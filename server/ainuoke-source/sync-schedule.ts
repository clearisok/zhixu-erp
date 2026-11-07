/** Beijing wall-clock scheduling. Business order status never determines a tier. */
export type SyncTier = 'frequent' | 'daily' | 'weekly' | 'monthly' | 'date-review';
export type SyncPolicy = {
  catalogMinutes: number;
  frequentMinutes: number;
  dailyTime: string;
  weeklyDay: number; // ISO weekday: Monday=1 ... Sunday=7
  weeklyTime: string;
  monthlyDay: number; // 1..28 keeps every month representable
  monthlyTime: string;
  missingDate: 'frequent';
};
export const DEFAULT_SYNC_POLICY: Readonly<SyncPolicy> = Object.freeze({
  catalogMinutes: 30,
  frequentMinutes: 30, dailyTime: '02:00', weeklyDay: 1,
  weeklyTime: '03:00', monthlyDay: 1, monthlyTime: '04:00', missingDate: 'frequent',
});
const HOUR = 3_600_000, DAY = 24 * HOUR, BEIJING = 8 * HOUR;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function validDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const n = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value;
}
export function validateSyncPolicy(policy: SyncPolicy): SyncPolicy {
  if (Object.keys(policy).sort().join(',') !== Object.keys(DEFAULT_SYNC_POLICY).sort().join(',')
    || !Number.isSafeInteger(policy.frequentMinutes) || policy.frequentMinutes < 5 || policy.frequentMinutes > 1440
    || !Number.isSafeInteger(policy.catalogMinutes) || policy.catalogMinutes < 5 || policy.catalogMinutes > 1440
    || !timePattern.test(policy.dailyTime) || !timePattern.test(policy.weeklyTime) || !timePattern.test(policy.monthlyTime)
    || !Number.isSafeInteger(policy.weeklyDay) || policy.weeklyDay < 1 || policy.weeklyDay > 7
    || !Number.isSafeInteger(policy.monthlyDay) || policy.monthlyDay < 1 || policy.monthlyDay > 28
    || policy.missingDate !== 'frequent') throw new Error('sync_policy_invalid');
  return { ...policy };
}
export function beijingDate(now: number): string {
  if (!Number.isFinite(now)) throw new Error('sync_clock_invalid');
  return new Date(now + BEIJING).toISOString().slice(0, 10);
}
/** Anniversary from the original due date; a missing day clamps to month end. */
export function addCalendarMonths(date: string, months: number): string {
  if (!validDateOnly(date) || !Number.isSafeInteger(months)) throw new Error('sync_date_invalid');
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(date + 'T00:00:00Z');
  target.setUTCDate(1);
  target.setUTCFullYear(year, month - 1 + months, 1);
  const end = new Date(target);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  target.setUTCDate(Math.min(day, end.getUTCDate()));
  return target.toISOString().slice(0, 10);
}
export function syncReferenceDate(deliveryDate: string | null, contractDate: string | null, now: number) {
  const today=beijingDate(now);
  if(!validDateOnly(deliveryDate)||!validDateOnly(contractDate)||contractDate>today
    ||deliveryDate<contractDate||deliveryDate>addCalendarMonths(today,60)
    ||contractDate<'1900-01-01')return null;
  const contractFloor=addCalendarMonths(contractDate,3);
  return deliveryDate>contractFloor?deliveryDate:contractFloor;
}
export function syncTier(deliveryDate: string | null, now: number, contractDate: string | null): SyncTier {
  const today = beijingDate(now);
  const reference=syncReferenceDate(deliveryDate,contractDate,now);
  if (!reference) return 'date-review';
  if (today <= addCalendarMonths(reference, 3)) return 'frequent';
  if (today <= addCalendarMonths(reference, 6)) return 'daily';
  if (today <= addCalendarMonths(reference, 12)) return 'weekly';
  return 'monthly';
}
function wall(date: string, time: string): number { return Date.parse(`${date}T${time}:00+08:00`); }
function shiftDay(date: string, delta: number): string {
  return new Date(Date.parse(date + 'T00:00:00Z') + delta * DAY).toISOString().slice(0, 10);
}
function slots(tier: 'daily' | 'weekly' | 'monthly', now: number, p: SyncPolicy) {
  const today = beijingDate(now);
  if (tier === 'daily') {
    const due = wall(today, p.dailyTime);
    return { latest: due <= now ? due : due - DAY, next: due > now ? due : due + DAY };
  }
  if (tier === 'weekly') {
    const weekday = new Date(today + 'T00:00:00Z').getUTCDay() || 7;
    const due = wall(shiftDay(today, -((weekday - p.weeklyDay + 7) % 7)), p.weeklyTime);
    return { latest: due <= now ? due : due - 7 * DAY, next: due > now ? due : due + 7 * DAY };
  }
  const date = today.slice(0, 8) + String(p.monthlyDay).padStart(2, '0');
  const due = wall(date, p.monthlyTime);
  return {
    latest: due <= now ? due : wall(addCalendarMonths(date, -1), p.monthlyTime),
    next: due > now ? due : wall(addCalendarMonths(date, 1), p.monthlyTime),
  };
}
export type SyncSchedule = { tier: SyncTier; due: boolean; slot: string | null; nextAt: string | null; dateNeedsReview: boolean };
/** Missed slots catch up once. A failed/unknown attempt consumes its slot, not success time.
 * Manual requests deliberately do not consult this automatic scheduling function. */
export function syncSchedule(input: {
  deliveryDate: string | null; contractDate: string | null; now: number; lastSuccessAt: string | null; lastAutomaticAttemptAt: string | null;
}, policy: SyncPolicy = DEFAULT_SYNC_POLICY): SyncSchedule {
  const p = validateSyncPolicy(policy), tier = syncTier(input.deliveryDate, input.now,input.contractDate);
  const parsed = (s: string | null) => {
    if (s === null) return null;
    const n = Date.parse(s);
    if (!Number.isFinite(n)) throw new Error('sync_timestamp_invalid');
    return n;
  };
  const success = parsed(input.lastSuccessAt), attempted = parsed(input.lastAutomaticAttemptAt);
  const last = Math.max(success ?? 0, attempted ?? 0);
  if (tier === 'frequent' || tier === 'date-review') {
    const next = last === 0 ? input.now : last + p.frequentMinutes * 60_000;
    return { tier, due: next <= input.now, slot: new Date(next).toISOString(), nextAt: new Date(next).toISOString(), dateNeedsReview: tier === 'date-review' };
  }
  const { latest, next } = slots(tier, input.now, p);
  // A newly discovered historical contract gets one first observation promptly.
  const due = last < latest;
  return { tier, due, slot: new Date(latest).toISOString(), nextAt: new Date(due ? input.now : next).toISOString(), dateNeedsReview: false };
}

export function syncScheduleLabel(tier: SyncTier, policy: SyncPolicy = DEFAULT_SYNC_POLICY): string {
  const p = validateSyncPolicy(policy);
  if (tier === 'frequent' || tier === 'date-review') return `每${p.frequentMinutes}分钟${tier === 'date-review' ? ' · 交期待核对' : ''}`;
  if (tier === 'daily') return `每日${p.dailyTime}`;
  if (tier === 'weekly') return `每周${'一二三四五六日'[p.weeklyDay - 1]}${p.weeklyTime}`;
  return `每月${p.monthlyDay}日${p.monthlyTime}`;
}

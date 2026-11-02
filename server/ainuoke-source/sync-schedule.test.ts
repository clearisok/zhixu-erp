import test from 'node:test';
import assert from 'node:assert/strict';
import { addCalendarMonths, syncTier, syncSchedule, DEFAULT_SYNC_POLICY, validDateOnly } from './sync-schedule.js';
const at = (s: string) => Date.parse(s + '+08:00');
test('calendar months use inclusive original-date anniversaries, clamp month ends and respect leap years', () => {
  assert.equal(addCalendarMonths('2026-01-31', 3), '2026-04-30');
  assert.equal(addCalendarMonths('2024-02-29', 12), '2025-02-28');
  assert.equal(addCalendarMonths('2026-11-30', 3), '2027-02-28');
  assert.equal(validDateOnly('2026-02-29'), false);
  const due = '2026-01-31';
  for (const [date, tier] of [['2026-01-01','frequent'],['2026-01-31','frequent'],['2026-04-30','frequent'],['2026-05-01','daily'],['2026-07-31','daily'],['2026-08-01','weekly'],['2027-01-31','weekly'],['2027-02-01','monthly']] as const) {
    assert.equal(syncTier(due, at(date+'T23:59:59')), tier, date);
  }
  assert.equal(syncTier('2026-02-28', at('2026-05-29T00:00:00')), 'daily');
});
test('Beijing date changes tier at local midnight, independent of host timezone', () => {
  assert.equal(syncTier('2026-08-02', Date.parse('2026-11-02T15:59:59Z')), 'frequent');
  assert.equal(syncTier('2026-08-02', Date.parse('2026-11-02T16:00:00Z')), 'daily');
});
const schedule = (deliveryDate: string|null, now: string, success: string|null, attempt: string|null = null) => syncSchedule({deliveryDate,now:at(now),lastSuccessAt:success,lastAutomaticAttemptAt:attempt});
test('frequent refresh runs once per interval and clock rollback cannot trigger another request', () => {
  const success = '2026-11-02T10:00:00+08:00';
  assert.equal(schedule('2026-11-02','2026-11-02T10:29:59',success).due,false);
  assert.equal(schedule('2026-11-02','2026-11-02T10:30:00',success).due,true);
  assert.equal(schedule('2026-11-02','2026-11-02T09:00:00',success).due,false);
  assert.equal(schedule('2026-11-02','2026-11-02T10:40:00',success,'2026-11-02T10:30:00+08:00').due,false);
});
test('daily 02:00, Monday 03:00 and month-first 04:00 use exact Beijing slots', () => {
  for (const [due, before, exact, previous] of [
    ['2026-06-01','2026-11-02T01:59:59','2026-11-02T02:00:00','2026-11-01T02:00:00+08:00'],
    ['2026-01-01','2026-11-02T02:59:59','2026-11-02T03:00:00','2026-10-26T03:00:00+08:00'],
    ['2025-01-01','2026-11-01T03:59:59','2026-11-01T04:00:00','2026-10-01T04:00:00+08:00'],
  ]) {
    assert.equal(schedule(due,before,previous).due,false);
    assert.equal(schedule(due,exact,previous).due,true);
    assert.equal(schedule(due,exact,previous,exact+'+08:00').due,false);
  }
});
test('missed weekly/monthly slots catch up once and manual success satisfies that observation', () => {
  assert.equal(schedule('2025-01-01','2026-11-03T12:00:00','2026-08-01T04:00:00+08:00').due,true);
  assert.equal(schedule('2025-01-01','2026-11-03T12:00:00','2026-11-02T10:00:00+08:00').due,false);
  assert.equal(schedule('2026-01-01','2026-11-04T12:00:00','2026-10-25T10:00:00+08:00').due,true);
});
test('due-date changes reclassify immediately without changing completion or business status', () => {
  const last = '2026-11-02T00:00:00+08:00';
  assert.equal(schedule('2025-01-01','2026-11-02T12:00:00',last).due,false);
  assert.equal(schedule('2026-12-01','2026-11-02T12:00:00',last).due,true);
  assert.equal(schedule('2026-12-01','2026-11-02T12:00:00',last).tier,'frequent');
});
test('missing dates stay explicit and policy supports a manual-only fallback', () => {
  const input = {deliveryDate:null,now:at('2026-11-02T12:00:00'),lastSuccessAt:null,lastAutomaticAttemptAt:null};
  assert.equal(syncSchedule(input).dateNeedsReview,true);
  assert.equal(syncSchedule(input).due,true);
  assert.equal(syncSchedule(input,{...DEFAULT_SYNC_POLICY,missingDate:'manual'}).due,false);
  assert.throws(()=>syncSchedule(input,{...DEFAULT_SYNC_POLICY,dailyTime:'25:00'}),/sync_policy_invalid/);
});

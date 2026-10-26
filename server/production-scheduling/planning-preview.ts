import {
  calculateScheduleDates, ScheduleScanLimitError,
} from "../../features/production-scheduling/service/production-scheduling-service.js";
import {
  PRODUCTION_RESOURCE_LIMITS, productionResourceDate, productionResourceUuid,
  type CalendarExceptionInput,
} from "../production-resources/contract.js";

/** Technical limits fail explicitly; they are not truncated queue results. */
export const SCHEDULE_PLANNING_LIMITS = { queueRows: 500, scanDays: 36_600, workdays: 36_600 } as const;
export class SchedulePlanningError extends Error {
  constructor(readonly code: string) { super(code); this.name = "SchedulePlanningError"; }
}
type ResourceVersion = { id: string; version: number; enabled: boolean };
export type QueueResourceSnapshot = {
  group: ResourceVersion & { productionSiteId: string };
  site: ResourceVersion & { productionCalendarId: string };
  calendar: ResourceVersion & { workingWeekdays: number[]; exceptions: CalendarExceptionInput[] };
};
export type QueuePlanningRow = {
  id: string;
  salesOrderId: string;
  productionGroupId: string;
  version: number;
  queueSequence: number;
  createdAt: string;
  status: "planned" | "in_progress" | "completed" | "cancelled";
  dateMode: "auto_queue" | "manual_fixed";
  requiredWorkdays: number;
  completedQuantity: string;
  actualStartDate: string | null;
  actualCompletedDate: string | null;
  plannedStartDate: string | null;
  firstProductionDate: string | null;
  plannedEndDate: string | null;
  nonWorkingDayCount: number;
};
export type QueuePlanningInput = {
  queueVersion: number;
  anchorDate: string;
  resources: QueueResourceSnapshot;
  assignments: QueuePlanningRow[];
};
export type QueuePlanningChange = {
  assignmentId: string;
  expectedVersion: number;
  before: Pick<QueuePlanningRow, "plannedStartDate" | "firstProductionDate" | "plannedEndDate" | "nonWorkingDayCount">;
  after: QueuePlanningChange["before"];
};
export type QueuePlanningWarning = {
  kind: "protected_overlap" | "protected_end_missing";
  assignmentId: string;
  previousEndDate: string | null;
};

const invalid = (code = "schedule_planning_snapshot_invalid"): never => { throw new SchedulePlanningError(code); };
const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
function uuid(value: unknown): string {
  try { return productionResourceUuid(value); } catch { return invalid(); }
}
function date(value: unknown): string {
  try { return productionResourceDate(value); } catch { return invalid(); }
}
const optionalDate = (value: unknown): string | null => value === null ? null : date(value);
function resource(value: ResourceVersion): ResourceVersion {
  if (!value || !integer(value.version, 1) || typeof value.enabled !== "boolean") return invalid();
  return { id: uuid(value.id), version: value.version, enabled: value.enabled };
}
function resources(value: QueueResourceSnapshot): QueueResourceSnapshot {
  if (!value?.group || !value.site || !value.calendar) return invalid();
  const group = { ...resource(value.group), productionSiteId: uuid(value.group.productionSiteId) };
  const site = { ...resource(value.site), productionCalendarId: uuid(value.site.productionCalendarId) };
  const calendar = resource(value.calendar);
  if (group.productionSiteId !== site.id || site.productionCalendarId !== calendar.id) return invalid("schedule_resource_relationship_changed");
  if (!group.enabled || !site.enabled || !calendar.enabled) return invalid("schedule_resources_disabled");
  const weekdays = value.calendar.workingWeekdays;
  if (!Array.isArray(weekdays) || weekdays.length < 1 || weekdays.length > 7
    || Array.from(weekdays).some(day => !integer(day, 0, 6)) || new Set(weekdays).size !== weekdays.length) return invalid();
  if (!Array.isArray(value.calendar.exceptions) || value.calendar.exceptions.length > PRODUCTION_RESOURCE_LIMITS.exceptions) return invalid();
  const seen = new Set<string>();
  const exceptions = Array.from(value.calendar.exceptions, item => {
    if (!item || (item.type !== "working" && item.type !== "non_working") || typeof item.name !== "string"
      || !item.name.trim() || item.name.length > 200) return invalid();
    const exceptionDate = date(item.date);
    if (seen.has(exceptionDate)) return invalid();
    seen.add(exceptionDate);
    return { date: exceptionDate, type: item.type, name: item.name };
  });
  return { group, site, calendar: { ...calendar, workingWeekdays: [...weekdays].sort((a, b) => a - b), exceptions: exceptions.sort((a, b) => a.date.localeCompare(b.date)) } };
}
function row(value: QueuePlanningRow, groupId: string): QueuePlanningRow {
  if (!value || !integer(value.version, 1) || !integer(value.queueSequence, 1)
    || !integer(value.requiredWorkdays, 1, SCHEDULE_PLANNING_LIMITS.workdays)
    || !integer(value.nonWorkingDayCount, 0, SCHEDULE_PLANNING_LIMITS.scanDays)
    || !["planned", "in_progress", "completed", "cancelled"].includes(value.status)
    || !["auto_queue", "manual_fixed"].includes(value.dateMode)
    || typeof value.completedQuantity !== "string" || value.completedQuantity.length > 128
    || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value.completedQuantity)
    || typeof value.createdAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value.createdAt)
    || !Number.isFinite(Date.parse(value.createdAt)) || new Date(value.createdAt).toISOString() !== value.createdAt) return invalid();
  const productionGroupId = uuid(value.productionGroupId);
  if (productionGroupId !== groupId) return invalid("schedule_queue_group_mismatch");
  const result: QueuePlanningRow = {
    id: uuid(value.id), salesOrderId: uuid(value.salesOrderId), productionGroupId,
    version: value.version, queueSequence: value.queueSequence, createdAt: value.createdAt,
    status: value.status, dateMode: value.dateMode, requiredWorkdays: value.requiredWorkdays,
    completedQuantity: value.completedQuantity, actualStartDate: optionalDate(value.actualStartDate),
    actualCompletedDate: optionalDate(value.actualCompletedDate), plannedStartDate: optionalDate(value.plannedStartDate),
    firstProductionDate: optionalDate(value.firstProductionDate), plannedEndDate: optionalDate(value.plannedEndDate),
    nonWorkingDayCount: value.nonWorkingDayCount,
  };
  if (result.plannedStartDate && result.plannedEndDate && result.plannedStartDate > result.plannedEndDate
    || result.actualStartDate && result.actualCompletedDate && result.actualStartDate > result.actualCompletedDate
    || result.firstProductionDate && (!result.plannedStartDate || !result.plannedEndDate
      || result.firstProductionDate < result.plannedStartDate || result.firstProductionDate > result.plannedEndDate)) return invalid();
  return result;
}
export function queuePlanningRowIsProtected(value: QueuePlanningRow): boolean {
  return value.dateMode !== "auto_queue" || value.status !== "planned" || value.actualStartDate !== null
    || value.actualCompletedDate !== null || !/^0(?:\.0+)?$/u.test(value.completedQuantity);
}
const dates = (value: QueuePlanningRow): QueuePlanningChange["before"] => ({
  plannedStartDate: value.plannedStartDate, firstProductionDate: value.firstProductionDate,
  plannedEndDate: value.plannedEndDate, nonWorkingDayCount: value.nonWorkingDayCount,
});

/** Pure preview, never a persistence command. Actor, effective SO, request,
 * locks/CAS and the full preview fingerprint still belong to the future service. */
export function previewInternalQueue(input: QueuePlanningInput) {
  if (!input || !integer(input.queueVersion, 0) || !Array.isArray(input.assignments)) return invalid();
  if (input.assignments.length > SCHEDULE_PLANNING_LIMITS.queueRows) return invalid("schedule_queue_limit_exceeded");
  const anchorDate = date(input.anchorDate), snapshot = resources(input.resources);
  const assignments = Array.from(input.assignments, value => row(value, snapshot.group.id));
  if (new Set(assignments.map(item => item.id)).size !== assignments.length) return invalid();
  const queue = assignments.filter(item => item.status !== "cancelled").sort((a, b) =>
    a.queueSequence - b.queueSequence || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const changes: QueuePlanningChange[] = [], warnings: QueuePlanningWarning[] = [];
  let previousEnd: string | null = null, missingProtectedEnd = false, scannedDays = 0;
  for (const assignment of queue) {
    if (queuePlanningRowIsProtected(assignment)) {
      if (previousEnd && assignment.plannedStartDate && assignment.plannedStartDate < previousEnd) {
        warnings.push({ kind: "protected_overlap", assignmentId: assignment.id, previousEndDate: previousEnd });
      }
      const end = assignment.actualCompletedDate ?? assignment.plannedEndDate;
      if (end === null) {
        missingProtectedEnd = true;
        warnings.push({ kind: "protected_end_missing", assignmentId: assignment.id, previousEndDate: previousEnd });
      } else if (previousEnd === null || end > previousEnd) previousEnd = end;
      continue;
    }
    if (missingProtectedEnd) return invalid("schedule_queue_anchor_missing");
    const startDate: string = previousEnd ?? assignment.plannedStartDate ?? anchorDate;
    const handoffStart = previousEnd !== null;
    let calculated: ReturnType<typeof calculateScheduleDates>;
    try {
      calculated = calculateScheduleDates({ startDate, requiredWorkdays: assignment.requiredWorkdays,
        calendar: snapshot.calendar, handoffStart, scanLimit: SCHEDULE_PLANNING_LIMITS.scanDays - scannedDays });
    } catch (error) {
      if (error instanceof ScheduleScanLimitError) return invalid("schedule_scan_limit_exceeded");
      throw error;
    }
    // Count all examined dates, including rest days, across the whole queue.
    scannedDays += Math.round((Date.parse(calculated.plannedEndDate + "T00:00:00Z") - Date.parse(startDate + "T00:00:00Z")) / 86_400_000) + (handoffStart ? 0 : 1);
    const before = dates(assignment), after = { ...calculated };
    if (Object.keys(before).some(key => before[key as keyof typeof before] !== after[key as keyof typeof after])) {
      changes.push({ assignmentId: assignment.id, expectedVersion: assignment.version, before, after });
    }
    previousEnd = calculated.plannedEndDate;
  }
  return {
    queueVersion: input.queueVersion, anchorDate, resources: snapshot,
    expectedAssignments: queue.map(item => ({ id: item.id, version: item.version })),
    protectedAssignmentIds: queue.filter(queuePlanningRowIsProtected).map(item => item.id),
    changes, warnings, scannedDays,
  };
}

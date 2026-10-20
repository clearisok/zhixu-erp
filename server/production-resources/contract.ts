import { HttpError } from "../http/errors.js";

export const PRODUCTION_RESOURCE_TYPES = ["calendars", "sites", "groups", "factories"] as const;
export type ProductionResourceType = typeof PRODUCTION_RESOURCE_TYPES[number];
export const PRODUCTION_RESOURCE_LIMITS = { exceptions: 1000, leadDays: 3650, sortMagnitude: 1_000_000_000 } as const;

type Common = { name: string; enabled: boolean; remark: string };
export type CalendarExceptionInput = { date: string; type: "working" | "non_working"; name: string };
export type CalendarInput = Common & { workingWeekdays: number[]; exceptions: CalendarExceptionInput[] };
export type SiteInput = Common & { countryCode: string | null; productionCalendarId: string; preProductionSampleLeadDays: number };
export type GroupInput = Common & { shortName: string; productionSiteId: string; sortOrder: number };
export type FactoryInput = Common & { shortName: string; contactPerson: string; phone: string };
export type ProductionResourceInputs = { calendars: CalendarInput; sites: SiteInput; groups: GroupInput; factories: FactoryInput };
type CommandBase = { requestId: string } & (
  { action: "create"; resourceId: null; expectedVersion: 0 } |
  { action: "update"; resourceId: string; expectedVersion: number }
);
export type ProductionResourceCommand = { [K in ProductionResourceType]: CommandBase & { kind: K; data: ProductionResourceInputs[K] } }[ProductionResourceType];

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const commonKeys = ["name", "enabled", "remark"];
function invalid(): never { throw new HttpError(400, "invalid_production_resource_command", "Invalid production resource command"); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const result = object(value);
  if (Object.keys(result).length !== keys.length || keys.some(key => !Object.hasOwn(result, key))) invalid();
  return result;
}
function text(value: unknown, max: number, trim = true, required = false): string {
  if (typeof value !== "string" || value.includes("\0") || Array.from(value).some(char => char.length === 1 && /[\uD800-\uDFFF]/u.test(char))) return invalid();
  const result = trim ? value.trim() : value;
  if (result.length > max || (required && !result)) invalid();
  return result;
}
export function productionResourceUuid(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) return invalid();
  return value.toLowerCase();
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) return invalid();
  return value;
}
function common(value: Record<string, unknown>): Common {
  if (typeof value.enabled !== "boolean") invalid();
  return { name: text(value.name, 200, true, true), enabled: value.enabled, remark: text(value.remark, 2000, false) };
}
export function productionResourceDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || value.startsWith("0000-")) return invalid();
  const stamp = Date.parse(value + "T00:00:00.000Z");
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value) invalid();
  return value;
}
function calendar(value: unknown): CalendarInput {
  const raw = exact(value, [...commonKeys, "workingWeekdays", "exceptions"]);
  if (!Array.isArray(raw.workingWeekdays) || !raw.workingWeekdays.length || raw.workingWeekdays.length > 7) invalid();
  const workingWeekdays = Array.from(raw.workingWeekdays, day => integer(day, 0, 6));
  if (new Set(workingWeekdays).size !== workingWeekdays.length) invalid();
  if (!Array.isArray(raw.exceptions) || raw.exceptions.length > PRODUCTION_RESOURCE_LIMITS.exceptions) invalid();
  const dates = new Set<string>();
  const exceptions = Array.from(raw.exceptions, value => {
    const item = exact(value, ["date", "type", "name"]), date = productionResourceDate(item.date);
    if (dates.has(date) || (item.type !== "working" && item.type !== "non_working")) invalid();
    dates.add(date);
    return { date, type: item.type as CalendarExceptionInput["type"], name: text(item.name, 200) };
  });
  return { ...common(raw), workingWeekdays: workingWeekdays.sort((a, b) => a - b), exceptions: exceptions.sort((a, b) => a.date.localeCompare(b.date)) };
}
function site(value: unknown): SiteInput {
  const raw = exact(value, [...commonKeys, "countryCode", "productionCalendarId", "preProductionSampleLeadDays"]);
  const countryCode = raw.countryCode === null ? null : text(raw.countryCode, 2).toUpperCase();
  if (countryCode !== null && !/^[A-Z]{2}$/u.test(countryCode)) invalid();
  return { ...common(raw), countryCode, productionCalendarId: productionResourceUuid(raw.productionCalendarId), preProductionSampleLeadDays: integer(raw.preProductionSampleLeadDays, 0, PRODUCTION_RESOURCE_LIMITS.leadDays) };
}
function group(value: unknown): GroupInput {
  const raw = exact(value, [...commonKeys, "shortName", "productionSiteId", "sortOrder"]);
  if (typeof raw.sortOrder !== "number" || !Number.isFinite(raw.sortOrder) || Math.abs(raw.sortOrder) > PRODUCTION_RESOURCE_LIMITS.sortMagnitude) invalid();
  return { ...common(raw), shortName: text(raw.shortName, 80), productionSiteId: productionResourceUuid(raw.productionSiteId), sortOrder: raw.sortOrder };
}
function factory(value: unknown): FactoryInput {
  const raw = exact(value, [...commonKeys, "shortName", "contactPerson", "phone"]);
  return { ...common(raw), shortName: text(raw.shortName, 80), contactPerson: text(raw.contactPerson, 120), phone: text(raw.phone, 80) };
}

/** No actor, timestamp, currency, Browser defaults or generated identity is accepted. */
export function parseProductionResourceCommand(value: unknown): ProductionResourceCommand {
  const raw = exact(value, ["requestId", "action", "kind", "resourceId", "expectedVersion", "data"]);
  if (raw.action !== "create" && raw.action !== "update") invalid();
  const expectedVersion = integer(raw.expectedVersion, raw.action === "create" ? 0 : 1, 2147483647);
  if (raw.action === "create" && (expectedVersion !== 0 || raw.resourceId !== null)) invalid();
  const requestId = productionResourceUuid(raw.requestId);
  const base: CommandBase = raw.action === "create"
    ? { requestId, action: "create", resourceId: null, expectedVersion: 0 }
    : { requestId, action: "update", resourceId: productionResourceUuid(raw.resourceId), expectedVersion };
  switch (raw.kind) {
    case "calendars": return { ...base, kind: raw.kind, data: calendar(raw.data) };
    case "sites": return { ...base, kind: raw.kind, data: site(raw.data) };
    case "groups": return { ...base, kind: raw.kind, data: group(raw.data) };
    case "factories": return { ...base, kind: raw.kind, data: factory(raw.data) };
    default: return invalid();
  }
}

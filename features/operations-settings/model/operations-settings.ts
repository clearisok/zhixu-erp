export type ProductionCalendarException = { id: string; date: string; type: "working" | "non_working"; name: string };
export type ProductionCalendar = { id: string; name: string; workingWeekdays: number[]; exceptions: ProductionCalendarException[]; enabled: boolean; remark: string; createdAt: string; updatedAt: string };
export type ProductionSite = { id: string; name: string; countryCode: string | null; productionCalendarId: string; preProductionSampleLeadDays: number; enabled: boolean; remark: string; createdAt: string; updatedAt: string };
export type SupplyHub = { id: string; name: string; enabled: boolean; remark: string; createdAt: string; updatedAt: string };
export type SupplyRoute = { id: string; supplyHubId: string; productionSiteId: string; name: string; enabled: boolean; remark: string; createdAt: string; updatedAt: string };
export type TransportMode = { id: string; routeId: string; name: string; transitDays: number; enabled: boolean; sortOrder: number; remark: string; createdAt: string; updatedAt: string };

export type ProductionGroup = {
  id: string;
  name: string;
  shortName: string;
  productionSiteId: string;
  enabled: boolean;
  sortOrder: number;
  remark: string;
  createdAt: string;
  updatedAt: string;
};

export type OutsourceFactory = { id: string; name: string; shortName: string; enabled: boolean; contactPerson: string; phone: string; remark: string; createdAt: string; updatedAt: string };
export type MonthlyProductionTarget = { id: string; month: string; totalProcessingOutputTargetRmb: number | null; internalProcessingOutputTargetRmb: number | null; remark: string; createdAt: string; updatedAt: string };
export type ClosingSettings = { defaultSalesTaxRatePercent: number; monthlyProductionTargets: MonthlyProductionTarget[] };
export type OperationsSettingsState = {
  productionGroups: ProductionGroup[];
  outsourceFactories: OutsourceFactory[];
  productionSites: ProductionSite[];
  productionCalendars: ProductionCalendar[];
  supplyHubs: SupplyHub[];
  supplyRoutes: SupplyRoute[];
  transportModes: TransportMode[];
  closingSettings: ClosingSettings;
};

const DEFAULT_TIME = "2026-08-28T00:00:00.000Z";
export const DEFAULT_CAMBODIA_CALENDAR_ID = "production-calendar-cambodia-default";
export const DEFAULT_CHINA_CALENDAR_ID = "production-calendar-china-default";
export const DEFAULT_CAMBODIA_SITE_ID = "production-site-cambodia-default";
export const DEFAULT_CHINA_SITE_ID = "production-site-china-default";
export const DEFAULT_SUPPLY_HUB_ID = "supply-hub-ningbo-default";
export const DEFAULT_CAMBODIA_ROUTE_ID = "supply-route-ningbo-cambodia-default";

const defaultCalendars = (): ProductionCalendar[] => [
  { id: DEFAULT_CAMBODIA_CALENDAR_ID, name: "柬埔寨生产日历", workingWeekdays: [1, 2, 3, 4, 5, 6], exceptions: [], enabled: true, remark: "默认周一至周六工作，周日休息；可维护例外日期", createdAt: DEFAULT_TIME, updatedAt: DEFAULT_TIME },
  { id: DEFAULT_CHINA_CALENDAR_ID, name: "中国生产日历", workingWeekdays: [0, 1, 2, 3, 4, 5, 6], exceptions: [], enabled: true, remark: "默认每天工作；可维护例外日期", createdAt: DEFAULT_TIME, updatedAt: DEFAULT_TIME },
];
const defaultSites = (): ProductionSite[] => [
  { id: DEFAULT_CAMBODIA_SITE_ID, name: "柬埔寨工厂", countryCode: "KH", productionCalendarId: DEFAULT_CAMBODIA_CALENDAR_ID, preProductionSampleLeadDays: 5, enabled: true, remark: "", createdAt: DEFAULT_TIME, updatedAt: DEFAULT_TIME },
  { id: DEFAULT_CHINA_SITE_ID, name: "中国工厂", countryCode: "CN", productionCalendarId: DEFAULT_CHINA_CALENDAR_ID, preProductionSampleLeadDays: 0, enabled: true, remark: "", createdAt: DEFAULT_TIME, updatedAt: DEFAULT_TIME },
];
const defaultHubs = (): SupplyHub[] => [{ id: DEFAULT_SUPPLY_HUB_ID, name: "宁波仓", enabled: true, remark: "", createdAt: DEFAULT_TIME, updatedAt: DEFAULT_TIME }];
const defaultRoutes = (): SupplyRoute[] => [{ id: DEFAULT_CAMBODIA_ROUTE_ID, supplyHubId: DEFAULT_SUPPLY_HUB_ID, productionSiteId: DEFAULT_CAMBODIA_SITE_ID, name: "宁波仓 → 柬埔寨工厂", enabled: true, remark: "", createdAt: DEFAULT_TIME, updatedAt: DEFAULT_TIME }];
const defaultModes = (): TransportMode[] => [
  { id: "transport-cambodia-expedited", routeId: DEFAULT_CAMBODIA_ROUTE_ID, name: "定时达", transitDays: 8, enabled: true, sortOrder: 10, remark: "", createdAt: DEFAULT_TIME, updatedAt: DEFAULT_TIME },
  { id: "transport-cambodia-land", routeId: DEFAULT_CAMBODIA_ROUTE_ID, name: "陆运", transitDays: 12, enabled: true, sortOrder: 20, remark: "", createdAt: DEFAULT_TIME, updatedAt: DEFAULT_TIME },
  { id: "transport-cambodia-sea", routeId: DEFAULT_CAMBODIA_ROUTE_ID, name: "海运", transitDays: 20, enabled: true, sortOrder: 30, remark: "", createdAt: DEFAULT_TIME, updatedAt: DEFAULT_TIME },
];

export const defaultOperationsSettings: OperationsSettingsState = {
  productionGroups: [], outsourceFactories: [], productionSites: defaultSites(), productionCalendars: defaultCalendars(), supplyHubs: defaultHubs(), supplyRoutes: defaultRoutes(), transportModes: defaultModes(),
  closingSettings: { defaultSalesTaxRatePercent: 13, monthlyProductionTargets: [] },
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === "string" ? value : "";
const finite = (value: unknown, fallback: number): number => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const nullable = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const iso = (value: unknown, fallback: string) => text(value) || fallback;
const unique = <T extends { id: string }>(items: T[]) => [...new Map(items.map((item) => [item.id, item])).values()];
const base = (item: Record<string, unknown>, now: string) => ({ createdAt: iso(item.createdAt, now), updatedAt: iso(item.updatedAt ?? item.createdAt, now) });

function normalizeCalendar(value: unknown, now: string): ProductionCalendar | null { const item = record(value); const id = text(item.id).trim(); const name = text(item.name).trim(); if (!id || !name) return null; const weekdays = Array.isArray(item.workingWeekdays) ? [...new Set(item.workingWeekdays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6))] : []; const exceptions = Array.isArray(item.exceptions) ? item.exceptions.flatMap((entry) => { const source = record(entry); const exceptionId = text(source.id).trim(); const date = text(source.date); const type = source.type === "working" ? "working" as const : source.type === "non_working" ? "non_working" as const : null; return exceptionId && /^\d{4}-\d{2}-\d{2}$/.test(date) && type ? [{ id: exceptionId, date, type, name: text(source.name).trim() }] : []; }) : []; return { id, name, workingWeekdays: weekdays, exceptions: unique(exceptions), enabled: item.enabled !== false, remark: text(item.remark), ...base(item, now) }; }
function normalizeSite(value: unknown, now: string): ProductionSite | null { const item = record(value); const id = text(item.id).trim(); const name = text(item.name).trim(); const productionCalendarId = text(item.productionCalendarId).trim(); if (!id || !name || !productionCalendarId) return null; return { id, name, countryCode: text(item.countryCode).trim() || null, productionCalendarId, preProductionSampleLeadDays: Math.max(0, Math.floor(finite(item.preProductionSampleLeadDays, 0))), enabled: item.enabled !== false, remark: text(item.remark), ...base(item, now) }; }
function normalizeGroup(value: unknown, now: string, fallbackSiteId: string): ProductionGroup | null { const item = record(value); const id = text(item.id).trim(); const name = text(item.name).trim(); if (!id || !name) return null; return { id, name, shortName: text(item.shortName).trim(), productionSiteId: text(item.productionSiteId).trim() || fallbackSiteId, enabled: item.enabled !== false, sortOrder: finite(item.sortOrder, 0), remark: text(item.remark), ...base(item, now) }; }
function normalizeFactory(value: unknown, now: string): OutsourceFactory | null { const item = record(value); const id = text(item.id).trim(); const name = text(item.name).trim(); if (!id || !name) return null; return { id, name, shortName: text(item.shortName).trim(), enabled: item.enabled !== false, contactPerson: text(item.contactPerson).trim(), phone: text(item.phone).trim(), remark: text(item.remark), ...base(item, now) }; }
function normalizeHub(value: unknown, now: string): SupplyHub | null { const item = record(value); const id = text(item.id).trim(); const name = text(item.name).trim(); return id && name ? { id, name, enabled: item.enabled !== false, remark: text(item.remark), ...base(item, now) } : null; }
function normalizeRoute(value: unknown, now: string): SupplyRoute | null { const item = record(value); const id = text(item.id).trim(); const supplyHubId = text(item.supplyHubId).trim(); const productionSiteId = text(item.productionSiteId).trim(); if (!id || !supplyHubId || !productionSiteId) return null; return { id, supplyHubId, productionSiteId, name: text(item.name).trim() || id, enabled: item.enabled !== false, remark: text(item.remark), ...base(item, now) }; }
function normalizeMode(value: unknown, now: string): TransportMode | null { const item = record(value); const id = text(item.id).trim(); const routeId = text(item.routeId).trim(); const name = text(item.name).trim(); if (!id || !routeId || !name) return null; return { id, routeId, name, transitDays: Math.max(0, Math.ceil(finite(item.transitDays, 0))), enabled: item.enabled !== false, sortOrder: finite(item.sortOrder, 0), remark: text(item.remark), ...base(item, now) }; }
function normalizeTarget(value: unknown, now: string): MonthlyProductionTarget | null { const item = record(value); const id = text(item.id).trim(); const month = text(item.month).trim(); if (!id || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null; return { id, month, totalProcessingOutputTargetRmb: nullable(item.totalProcessingOutputTargetRmb), internalProcessingOutputTargetRmb: nullable(item.internalProcessingOutputTargetRmb), remark: text(item.remark), ...base(item, now) }; }

export function normalizeOperationsSettings(value: unknown, now = new Date().toISOString()): OperationsSettingsState {
  const source = record(value); const closing = record(source.closingSettings);
  const calendars = unique((Array.isArray(source.productionCalendars) && source.productionCalendars.length ? source.productionCalendars : defaultCalendars()).flatMap((item) => normalizeCalendar(item, now) ?? []));
  const sites = unique((Array.isArray(source.productionSites) && source.productionSites.length ? source.productionSites : defaultSites()).flatMap((item) => normalizeSite(item, now) ?? []));
  const fallbackSiteId = sites[0]?.id ?? DEFAULT_CAMBODIA_SITE_ID;
  const groups = unique((Array.isArray(source.productionGroups) ? source.productionGroups : []).flatMap((item) => normalizeGroup(item, now, fallbackSiteId) ?? []));
  const factories = unique((Array.isArray(source.outsourceFactories) ? source.outsourceFactories : []).flatMap((item) => normalizeFactory(item, now) ?? []));
  const hubs = unique((Array.isArray(source.supplyHubs) && source.supplyHubs.length ? source.supplyHubs : defaultHubs()).flatMap((item) => normalizeHub(item, now) ?? []));
  const routes = unique((Array.isArray(source.supplyRoutes) && source.supplyRoutes.length ? source.supplyRoutes : defaultRoutes()).flatMap((item) => normalizeRoute(item, now) ?? []));
  const modes = unique((Array.isArray(source.transportModes) && source.transportModes.length ? source.transportModes : defaultModes()).flatMap((item) => normalizeMode(item, now) ?? []));
  const targets = unique((Array.isArray(closing.monthlyProductionTargets) ? closing.monthlyProductionTargets : []).flatMap((item) => normalizeTarget(item, now) ?? []));
  return { productionGroups: groups.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN")), outsourceFactories: factories.sort((a, b) => a.name.localeCompare(b.name, "zh-CN")), productionSites: sites, productionCalendars: calendars, supplyHubs: hubs, supplyRoutes: routes, transportModes: modes.sort((a, b) => a.sortOrder - b.sortOrder), closingSettings: { defaultSalesTaxRatePercent: Math.max(0, finite(closing.defaultSalesTaxRatePercent, 13)), monthlyProductionTargets: targets.sort((a, b) => b.month.localeCompare(a.month)) } };
}

export function upsertProductionGroup(state: OperationsSettingsState, input: ProductionGroup, now = new Date().toISOString()): OperationsSettingsState { const existing = state.productionGroups.find((item) => item.id === input.id); const item = { ...input, name: input.name.trim(), shortName: input.shortName.trim(), remark: input.remark.trim(), createdAt: existing?.createdAt ?? input.createdAt ?? now, updatedAt: now }; return normalizeOperationsSettings({ ...state, productionGroups: existing ? state.productionGroups.map((current) => current.id === item.id ? item : current) : [...state.productionGroups, item] }, now); }
export function upsertOutsourceFactory(state: OperationsSettingsState, input: OutsourceFactory, now = new Date().toISOString()): OperationsSettingsState { const existing = state.outsourceFactories.find((item) => item.id === input.id); const item = { ...input, name: input.name.trim(), shortName: input.shortName.trim(), contactPerson: input.contactPerson.trim(), phone: input.phone.trim(), remark: input.remark.trim(), createdAt: existing?.createdAt ?? input.createdAt ?? now, updatedAt: now }; return normalizeOperationsSettings({ ...state, outsourceFactories: existing ? state.outsourceFactories.map((current) => current.id === item.id ? item : current) : [...state.outsourceFactories, item] }, now); }
export function saveClosingTaxRate(state: OperationsSettingsState, rate: number): OperationsSettingsState { return normalizeOperationsSettings({ ...state, closingSettings: { ...state.closingSettings, defaultSalesTaxRatePercent: Math.max(0, rate) } }); }
export function upsertMonthlyProductionTarget(state: OperationsSettingsState, input: MonthlyProductionTarget, now = new Date().toISOString()): OperationsSettingsState { if (state.closingSettings.monthlyProductionTargets.some((item) => item.month === input.month && item.id !== input.id)) throw new Error(`${input.month} 已存在月度产值目标`); const existing = state.closingSettings.monthlyProductionTargets.find((item) => item.id === input.id); const item = { ...input, remark: input.remark.trim(), createdAt: existing?.createdAt ?? input.createdAt ?? now, updatedAt: now }; return normalizeOperationsSettings({ ...state, closingSettings: { ...state.closingSettings, monthlyProductionTargets: existing ? state.closingSettings.monthlyProductionTargets.map((current) => current.id === item.id ? item : current) : [...state.closingSettings.monthlyProductionTargets, item] } }, now); }
export function deleteMonthlyProductionTarget(state: OperationsSettingsState, id: string): OperationsSettingsState { return { ...state, closingSettings: { ...state.closingSettings, monthlyProductionTargets: state.closingSettings.monthlyProductionTargets.filter((item) => item.id !== id) } }; }
export function upsertProductionCalendar(state: OperationsSettingsState, item: ProductionCalendar): OperationsSettingsState { return normalizeOperationsSettings({ ...state, productionCalendars: [...state.productionCalendars.filter((entry) => entry.id !== item.id), item] }); }
export function upsertProductionSite(state: OperationsSettingsState, item: ProductionSite): OperationsSettingsState { return normalizeOperationsSettings({ ...state, productionSites: [...state.productionSites.filter((entry) => entry.id !== item.id), item] }); }
export function upsertSupplyHub(state: OperationsSettingsState, item: SupplyHub): OperationsSettingsState { return normalizeOperationsSettings({ ...state, supplyHubs: [...state.supplyHubs.filter((entry) => entry.id !== item.id), item] }); }
export function upsertSupplyRoute(state: OperationsSettingsState, item: SupplyRoute): OperationsSettingsState { return normalizeOperationsSettings({ ...state, supplyRoutes: [...state.supplyRoutes.filter((entry) => entry.id !== item.id), item] }); }
export function upsertTransportMode(state: OperationsSettingsState, item: TransportMode): OperationsSettingsState { return normalizeOperationsSettings({ ...state, transportModes: [...state.transportModes.filter((entry) => entry.id !== item.id), item] }); }
export function createOperationsMasterDataId(prefix: string): string { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

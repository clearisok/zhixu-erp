import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { parseProductionResourceCommand, productionResourceDate, PRODUCTION_RESOURCE_LIMITS, type ProductionResourceType } from "./contract.js";
const id = randomUUID();
const values = {
  calendars: { name: "合成工作日历", enabled: true, remark: "", workingWeekdays: [6, 2, 1], exceptions: [{ date: "2027-01-02", type: "working", name: "合成调休" }, { date: "2027-01-01", type: "non_working", name: "合成假日" }] },
  sites: { name: "合成生产地点", enabled: true, remark: "", countryCode: "cn", productionCalendarId: id, preProductionSampleLeadDays: 0 },
  groups: { name: "10组", enabled: false, remark: " 保留备注格式\n", shortName: "", productionSiteId: id, sortOrder: -1.25 },
  factories: { name: "合成外发厂", enabled: true, remark: "", shortName: "", contactPerson: "合成联系人", phone: "+86 0000 (合成)" },
};
const command = (kind: ProductionResourceType, data: unknown = structuredClone(values[kind])) => ({ requestId: randomUUID(), action: "create", kind, resourceId: null, expectedVersion: 0, data });
const rejects = (value: unknown) => assert.throws(() => parseProductionResourceCommand(value), { status: 400, code: "invalid_production_resource_command" });

test("resource contracts preserve four explicit types and never supply Browser defaults", () => {
  for (const kind of ["calendars", "sites", "groups", "factories"] as const) {
    const original = command(kind), before = structuredClone(original), parsed = parseProductionResourceCommand(original);
    assert.equal(parsed.kind, kind); assert.equal(parsed.resourceId, null); assert.equal(parsed.expectedVersion, 0);
    assert.deepEqual(original, before); assert.equal(parsed.data.name, values[kind].name);
  }
  const group = parseProductionResourceCommand(command("groups")); assert.equal(group.kind, "groups");
  if (group.kind === "groups") { assert.equal(group.data.sortOrder, -1.25); assert.equal(group.data.remark, " 保留备注格式\n"); }
  rejects(command("groups", { ...values.groups, productionSiteId: "" }));
  rejects(command("sites", { ...values.sites, productionCalendarId: "" }));
});
test("only update accepts an existing identity and a positive integral version", () => {
  const valid = { ...command("factories"), action: "update", resourceId: id.toUpperCase(), expectedVersion: 7 };
  assert.equal(parseProductionResourceCommand(valid).resourceId, id.toLowerCase());
  for (const update of [{ resourceId: null }, { expectedVersion: 0 }, { expectedVersion: 1.1 }, { expectedVersion: "1" }, { resourceId: "factory-name" }]) rejects({ ...valid, ...update });
  for (const create of [{ resourceId: id }, { expectedVersion: 1 }, { action: "delete" }]) rejects({ ...command("factories"), ...create });
});
test("forged ownership, caller timestamps, money and aggregate fields cannot enter a resource command", () => {
  for (const extra of [{ actorId: id }, { createdAt: "2026-01-01" }, { verified: true }, { quoteId: id }, { currency: "USD" }, { productionGroups: [] }]) rejects({ ...command("factories"), ...extra });
  for (const extra of [{ id }, { createdBy: id }, { version: 2 }, { cost: 12 }, { defaultProcessingCurrency: "USD" }]) rejects(command("factories", { ...values.factories, ...extra }));
  for (const invalid of [null, [], "factory", {}, { ...command("factories"), kind: "supplyHubs" }]) rejects(invalid);
});
test("calendar workdays are explicit, nonempty, unique, integral and bounded", () => {
  for (const days of [[], [1, 1], [7], [-1], [1.1], ["1"], null, Array(1), [0, 1, 2, 3, 4, 5, 6, 0]]) rejects(command("calendars", { ...values.calendars, workingWeekdays: days }));
  const calendar = parseProductionResourceCommand(command("calendars"));
  if (calendar.kind !== "calendars") assert.fail("Expected calendar");
  assert.deepEqual(calendar.data.workingWeekdays, [1, 2, 6]);
  assert.deepEqual(calendar.data.exceptions.map(row => row.date), ["2027-01-01", "2027-01-02"]);
});
test("calendar dates represent real days including leap years and early ISO years", () => {
  for (const date of ["0001-01-01", "2000-02-29", "2024-02-29", "9999-12-31"]) assert.equal(productionResourceDate(date), date);
  for (const date of ["0000-01-01", "1900-02-29", "2027-02-29", "2027-04-31", "2027-13-01", "2027-1-01", "2027-01-01T00:00:00Z", "infinity"]) assert.throws(() => productionResourceDate(date));
});
test("a date has one explicit exception and input size is rejected rather than truncated", () => {
  const exception = values.calendars.exceptions[0];
  for (const exceptions of [[exception, { ...exception, type: "non_working" }], [{ ...exception, type: "holiday" }], [{ ...exception, type: ["working"] }], [{ ...exception, id }], [{ ...exception, name: " " }], [{ ...exception, date: "2027-02-30" }], Array(1), Array(PRODUCTION_RESOURCE_LIMITS.exceptions + 1).fill(exception)]) rejects(command("calendars", { ...values.calendars, exceptions }));
});
test("site country and lead time remain independent of price and currency", () => {
  const site = parseProductionResourceCommand(command("sites"));
  if (site.kind !== "sites") assert.fail("Expected site");
  assert.equal(site.data.countryCode, "cn"); assert.equal(site.data.preProductionSampleLeadDays, 0);
  assert.equal(parseProductionResourceCommand(command("sites", { ...values.sites, countryCode: null })).kind, "sites");
  for (const country of ["CHN", "中国", "柬埔寨 / 金边"]) {
    const parsed = parseProductionResourceCommand(command("sites", { ...values.sites, countryCode: country }));
    if (parsed.kind !== "sites") assert.fail("Expected site"); assert.equal(parsed.data.countryCode, country);
  }
  for (const lead of [-1, 0.1, null, "5", PRODUCTION_RESOURCE_LIMITS.leadDays + 1]) rejects(command("sites", { ...values.sites, preProductionSampleLeadDays: lead }));
  for (const country of ["", " ", 1, "a".repeat(81)]) rejects(command("sites", { ...values.sites, countryCode: country }));
});
test("settings text keeps supported Unicode and rejects invalid transport values without echoing them", () => {
  assert.equal(parseProductionResourceCommand(command("factories", { ...values.factories, name: "  合成🧵工厂  " })).data.name, "合成🧵工厂");
  for (const name of ["", "   ", "a".repeat(201), "bad\0name", "bad\uD800", null]) rejects(command("factories", { ...values.factories, name }));
  for (const sortOrder of [Number.NaN, Number.POSITIVE_INFINITY, "10", PRODUCTION_RESOURCE_LIMITS.sortMagnitude + 1]) rejects(command("groups", { ...values.groups, sortOrder }));
  rejects(command("factories", { ...values.factories, enabled: "false" }));
});

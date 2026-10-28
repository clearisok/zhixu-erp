import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { parseProductionResourceCommand, PRODUCTION_RESOURCE_TYPES } from "./contract.js";
import { parseLogisticsResourceCommand } from "./logistics-contract.js";
import { managedResourceKind, parseManagedResourceCommand } from "./managed-contract.js";

const command = (kind: string, data: unknown) => ({ action: "create", requestId: randomUUID(), kind, resourceId: null, expectedVersion: 0, data });
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
test("the unified service keeps old four-kind canonical payload hashes and does not widen their UI contract", () => {
  assert.deepEqual(PRODUCTION_RESOURCE_TYPES, ["calendars", "sites", "groups", "factories"]);
  const inputs = [command("calendars", { name: " 日历 ", enabled: true, remark: "", workingWeekdays: [3, 1], exceptions: [] }),
    command("sites", { name: "地点", enabled: false, remark: "", countryCode: null, productionCalendarId: randomUUID(), preProductionSampleLeadDays: 0 }),
    command("groups", { name: "组", enabled: true, remark: "", shortName: "", productionSiteId: randomUUID(), sortOrder: 0.5 }),
    command("factories", { name: "外发", enabled: true, remark: "", shortName: "", contactPerson: "", phone: "" })];
  for (const input of inputs) { assert.deepEqual(parseManagedResourceCommand(input), parseProductionResourceCommand(input)); assert.equal(digest(parseManagedResourceCommand(input)), digest(parseProductionResourceCommand(input))); }
});
test("new logistics kinds reuse their existing strict contract rather than a second command format", () => {
  const inputs = [command("hubs", { name: "合成仓", enabled: true, remark: "" }), command("transport-plans", {
    name: "合成路线", enabled: true, remark: "", supplyHubId: randomUUID(), productionSiteId: randomUUID(),
    modes: [{ modeId: null, name: "运输", enabled: true, remark: "", transitDays: 12, sortOrder: 0 }],
  })];
  for (const input of inputs) { assert.deepEqual(parseManagedResourceCommand(input), parseLogisticsResourceCommand(input)); assert.equal(managedResourceKind(input.kind), input.kind); assert.throws(() => parseProductionResourceCommand(input), { status: 400 }); }
});
test("unknown types and fields fail closed before a request can acquire a receipt", () => {
  for (const kind of ["modes", "routes", "shipments", "hubs/../groups", null]) assert.throws(() => managedResourceKind(kind), { status: 400 });
  for (const input of [command("routes", {}), { ...command("hubs", { name: "仓", enabled: true, remark: "" }), actorId: randomUUID() }, command("hubs", { name: "仓", enabled: true, remark: "", defaultHub: true })]) assert.throws(() => parseManagedResourceCommand(input), { status: 400 });
});

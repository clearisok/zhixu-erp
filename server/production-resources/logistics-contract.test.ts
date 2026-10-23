import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { parseProductionResourceCommand, PRODUCTION_RESOURCE_TYPES, PRODUCTION_RESOURCE_LIMITS } from "./contract.js";
import {
  assertTransportPlanModeMembership, LOGISTICS_RESOURCE_LIMITS, parseLogisticsResourceCommand,
  type TransportPlanCommand,
} from "./logistics-contract.js";

const hubId = randomUUID(), siteId = randomUUID(), planId = randomUUID(), modeId = randomUUID();
const hub = { name: " 合成集货仓🧵 ", enabled: true, remark: " 保留格式\n" };
const mode = { name: " 合成陆运 ", enabled: true, remark: "", modeId: null, transitDays: 12, sortOrder: -1.25 };
const plan = { name: "合成集货仓 → 合成生产地点", enabled: true, remark: "", supplyHubId: hubId, productionSiteId: siteId, modes: [mode] };
const create = (kind = "transport-plans", data: unknown = structuredClone(plan)) => ({
  requestId: randomUUID(), action: "create", kind, resourceId: null, expectedVersion: 0, data,
});
const update = (data: unknown = { ...structuredClone(plan), modes: [{ ...mode, modeId }] }) => ({
  ...create("transport-plans", data), action: "update", resourceId: planId, expectedVersion: 4,
});
const rejects = (value: unknown) => assert.throws(() => parseLogisticsResourceCommand(value), {
  status: 400, code: "invalid_production_resource_command",
});
function parsedPlan(value: unknown): TransportPlanCommand {
  const parsed = parseLogisticsResourceCommand(value);
  if (parsed.kind !== "transport-plans") assert.fail("Expected transport plan");
  return parsed;
}
const membershipConflict = (value: TransportPlanCommand, ids: readonly string[]) => assert.throws(
  () => assertTransportPlanModeMembership(value, ids), { status: 409, code: "logistics_mode_membership_conflict" },
);

test("hub inputs preserve Unicode and remarks without supplying Browser defaults or caller identity", () => {
  const input = create("hubs", hub), original = structuredClone(input);
  const parsed = parseLogisticsResourceCommand(input);
  assert.equal(parsed.kind, "hubs");
  assert.deepEqual(parsed.data, { ...hub, name: "合成集货仓🧵" });
  assert.deepEqual(input, original);
  assert.equal(parsed.resourceId, null);
  for (const data of [{}, { ...hub, id: hubId }, { ...hub, defaultHub: true }, { ...hub, enabled: "true" }]) rejects(create("hubs", data));
});

test("one plan owns explicit parent references and a complete list of modes without mutating input", () => {
  const input = create(), original = structuredClone(input);
  const parsed = parsedPlan(input);
  assert.deepEqual(input, original);
  assert.equal(parsed.data.supplyHubId, hubId);
  assert.equal(parsed.data.productionSiteId, siteId);
  assert.equal(parsed.data.modes[0].name, "合成陆运");
  assert.equal(parsed.data.modes[0].sortOrder, -1.25);
  assert.equal(parsed.data.modes[0].modeId, null);
  for (const patch of [{ supplyHubId: "" }, { productionSiteId: "" }, { supplyHubId: "宁波仓" }, { productionSiteId: null }])
    rejects(create("transport-plans", { ...plan, ...patch }));
});

test("creation cannot choose server identities; updates require a positive version and UUID", () => {
  rejects(create("transport-plans", { ...plan, modes: [{ ...mode, modeId }] }));
  for (const patch of [{ resourceId: planId }, { expectedVersion: 1 }, { action: "delete" }]) rejects({ ...create(), ...patch });
  for (const patch of [{ resourceId: null }, { expectedVersion: 0 }, { expectedVersion: 2.5 }, { expectedVersion: "4" }]) rejects({ ...update(), ...patch });
  const parsed = parsedPlan({ ...update({ ...plan, supplyHubId: hubId.toUpperCase(), modes: [{ ...mode, modeId: modeId.toUpperCase() }] }), resourceId: planId.toUpperCase() });
  assert.equal(parsed.resourceId, planId);
  assert.equal(parsed.data.supplyHubId, hubId);
  assert.equal(parsed.data.modes[0].modeId, modeId);
});

test("actor, timestamps, order, currency and price data are not logistics resource inputs", () => {
  for (const extra of [{ actorId: randomUUID() }, { createdAt: "2026-10-21" }, { salesOrderId: randomUUID() }, { currency: "USD" }, { shippedQuantity: 5 }]) rejects({ ...create(), ...extra });
  for (const extra of [{ price: 10 }, { currency: "CNY" }, { version: 9 }, { createdAt: "2026-10-21" }]) rejects(create("transport-plans", { ...plan, ...extra }));
  for (const extra of [{ routeId: planId }, { id: modeId }, { unitPrice: 5 }, { actualArrivalDate: "2026-10-21" }]) rejects(create("transport-plans", { ...plan, modes: [{ ...mode, ...extra }] }));
});

test("modes cannot be missing, sparse, oversized or repeat an existing identity", () => {
  for (const modes of [[], null, Array(1), Array(LOGISTICS_RESOURCE_LIMITS.modes + 1).fill(mode)]) rejects(create("transport-plans", { ...plan, modes }));
  rejects(update({ ...plan, modes: [{ ...mode, modeId }, { ...mode, modeId: modeId.toUpperCase() }] }));
  rejects(create("transport-plans", { ...plan, modes: [{ ...mode, modeId: "" }] }));
  const maximum = Array.from({ length: LOGISTICS_RESOURCE_LIMITS.modes }, () => ({ ...mode }));
  assert.equal(parsedPlan(create("transport-plans", { ...plan, modes: maximum })).data.modes.length, LOGISTICS_RESOURCE_LIMITS.modes);
});

test("zero and bounded natural transit days are kept; coercion and rounding never invent a duration", () => {
  for (const transitDays of [0, LOGISTICS_RESOURCE_LIMITS.transitDays])
    assert.equal(parsedPlan(create("transport-plans", { ...plan, modes: [{ ...mode, transitDays }] })).data.modes[0].transitDays, transitDays);
  for (const transitDays of [-1, 0.1, null, "12", Number.NaN, Number.POSITIVE_INFINITY, LOGISTICS_RESOURCE_LIMITS.transitDays + 1])
    rejects(create("transport-plans", { ...plan, modes: [{ ...mode, transitDays }] }));
  for (const sortOrder of ["2", Number.NaN, Number.NEGATIVE_INFINITY, PRODUCTION_RESOURCE_LIMITS.sortMagnitude + 1])
    rejects(create("transport-plans", { ...plan, modes: [{ ...mode, sortOrder }] }));
});

test("repeated display names and disabled modes are retained rather than merged or activated", () => {
  const parsed = parsedPlan(create("transport-plans", { ...plan, enabled: false, modes: [{ ...mode, enabled: false }, { ...mode, enabled: false, transitDays: 0 }] }));
  assert.equal(parsed.data.enabled, false);
  assert.equal(parsed.data.modes.length, 2);
  assert.equal(parsed.data.modes[0].name, parsed.data.modes[1].name);
  assert.ok(parsed.data.modes.every(item => item.enabled === false && item.modeId === null));
});

test("logistics text follows existing resource limits and rejects malformed Unicode without echoing it", () => {
  for (const name of ["", " ", "a".repeat(201), "PRIVATE\0name", "PRIVATE\uD800", null]) rejects(create("hubs", { ...hub, name }));
  rejects(create("hubs", { ...hub, remark: "x".repeat(2001) }));
  rejects(create("transport-plans", { ...plan, modes: [{ ...mode, name: " " }] }));
  const invalid = create("transport-plans", { ...plan, modes: [{ ...mode, remark: "PRIVATE\uDC00" }] });
  assert.throws(() => parseLogisticsResourceCommand(invalid), error => error instanceof Error && !error.message.includes("PRIVATE"));
});

test("locked membership accepts retained disabled identities and appends only unallocated new children", () => {
  const input = parsedPlan(update({ ...plan, modes: [{ ...mode, modeId, enabled: false }, { ...mode, transitDays: 0 }] }));
  const original = structuredClone(input), ids = [modeId.toUpperCase()];
  assertTransportPlanModeMembership(input, ids);
  assert.deepEqual(input, original);
  assert.deepEqual(ids, [modeId.toUpperCase()]);
  assertTransportPlanModeMembership(parsedPlan(create()), []);
});

test("omitted or foreign child identities and stale complete membership fail closed", () => {
  const input = parsedPlan(update());
  membershipConflict(input, []);
  membershipConflict(input, [randomUUID()]);
  membershipConflict(input, [modeId, randomUUID()]);
  membershipConflict(input, [modeId, modeId]);
  membershipConflict(input, ["not-a-stored-uuid"]);
  membershipConflict(parsedPlan(create()), [modeId]);
  membershipConflict(parsedPlan(update({ ...plan, modes: [mode] })), [modeId]);
});

test("the old four-kind parser stays narrow; logistics parsing rejects unrelated kinds", () => {
  assert.deepEqual(PRODUCTION_RESOURCE_TYPES, ["calendars", "sites", "groups", "factories"]);
  for (const input of [create(), create("hubs", hub)]) assert.throws(() => parseProductionResourceCommand(input), { status: 400 });
  for (const kind of ["calendars", "routes", "modes", "shipments", "supplyHubs"]) rejects(create(kind));
});

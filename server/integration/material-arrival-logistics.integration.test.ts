import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { startContinuousFixture } from "./ainuoke-continuous-fixture.js";
import { loadExistingBootstrapActor } from "../sales-orders/bootstrap-runner.js";
import { executeProductionResourceCommand, type ManagedProductionResource } from "../production-resources/service.js";
import { parseManagedResourceCommand, type ManagedResourceType } from "../production-resources/managed-contract.js";
import { executeOrderTracking, previewOrderTracking } from "../production-scheduling/tracking-service.js";
import { executeProductionPlan, previewProductionPlan, readOrderProductionPlans } from "../production-scheduling/service.js";
import { createMaterialArrivalsClient, materialArrivalCommandDigest } from "../../features/style-progress/server/material-arrivals-client.js";
import { projectArrivalBatchLogistics } from "../../features/style-progress/model/server-arrival-logistics.js";
import type { ArrivalCommand, ArrivalIntent } from "../material-arrivals/contract.js";

test("arrival client and original logistics use trusted physical snapshots without exposing resource or commercial payload", { timeout: 180000 }, async t => {
  const x = await startContinuousFixture(resolve("dist/client"), { materialArrivals: true }); t.after(() => x.close());
  const admin = await loadExistingBootstrapActor(x.pool, x.users[0]), cookie = await x.login(x.users[0]), current = () => true;
  const calls: string[] = [];
  const transport = (cookieValue: string) => async (path: string, init?: RequestInit) => { calls.push((init?.method ?? "GET") + " " + path); return fetch(x.base + path, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), Cookie: cookieValue, Origin: x.base } }); };
  const client = createMaterialArrivalsClient(transport(cookie));
  const resource = async (kind: ManagedResourceType, data: unknown, before?: ManagedProductionResource) => {
    const result = await executeProductionResourceCommand(x.pool, admin, parseManagedResourceCommand({ requestId: randomUUID(), action: before ? "update" : "create", kind,
      resourceId: before?.id ?? null, expectedVersion: before?.version ?? 0, data }));
    assert.equal(result.status, "applied"); if (result.status !== "applied") assert.fail(); return result.resource;
  };
  const editResource = (before: ManagedProductionResource, patch: Record<string, unknown>) => { const { kind, id: _id, version: _v, createdAt: _c, updatedAt: _u, ...data } = before; void _id; void _v; void _c; void _u; return resource(kind, { ...data, ...patch }, before); };
  const calendar = await resource("calendars", { name: "合成日历", enabled: true, remark: "PRIVATE-CALENDAR", workingWeekdays: [0, 1, 2, 3, 4, 5, 6], exceptions: [] });
  const site = await resource("sites", { name: "原采用地点", enabled: true, remark: "PRIVATE-SITE", countryCode: "KH", productionCalendarId: calendar.id, preProductionSampleLeadDays: 5 });
  const group = await resource("groups", { name: "合成组", shortName: "组", enabled: true, remark: "PRIVATE-GROUP", productionSiteId: site.id, sortOrder: 1 });
  const hub = await resource("hubs", { name: "明确集货仓", enabled: true, remark: "PRIVATE-HUB" });
  const factory = await resource("factories", { name: "外发厂", shortName: "外发", enabled: true, remark: "PRIVATE-FACTORY", contactPerson: "PRIVATE-CONTACT", phone: "PRIVATE-PHONE" });
  let route = await resource("transport-plans", { name: "合成正式路线", enabled: true, remark: "PRIVATE-ROUTE", supplyHubId: hub.id, productionSiteId: site.id,
    modes: [{ modeId: null, name: "海运", enabled: true, remark: "PRIVATE-SEA", transitDays: 20, sortOrder: 1.5 }, { modeId: null, name: "陆运", enabled: true, remark: "PRIVATE-LAND", transitDays: 12, sortOrder: 2 }, { modeId: null, name: "快运", enabled: true, remark: "PRIVATE-FAST", transitDays: 8, sortOrder: 3 }] });
  const tracking = await previewOrderTracking(x.pool, admin, { action: "set_order_tracking", orderId: x.orderId, expectedVersion: 0, data: { supplyHubId: hub.id, remark: "PRIVATE-TRACKING" } });
  assert.equal((await executeOrderTracking(x.pool, admin, { requestId: randomUUID(), intent: tracking.intent, previewHash: tracking.previewHash })).status, "applied");
  const plan = async (executionType: "internal" | "outsource", executorId: string, startDate: string) => {
    const scope = await readOrderProductionPlans(x.pool, admin, x.orderId), preview = await previewProductionPlan(x.pool, admin, { action: "create", orderId: x.orderId,
      assignmentId: null, expectedVersion: 0, expectedPlanVersion: scope.order.planVersion,
      data: { executionType, executorId, colorId: null, plannedQuantity: "1", duration: { mode: "workdays", workdays: 1 }, dates: { mode: "manual_fixed", startDate, endDate: startDate }, remark: "PRIVATE-ASSIGNMENT" } });
    const result = await executeProductionPlan(x.pool, admin, { requestId: randomUUID(), intent: preview.intent, previewHash: preview.previewHash }); assert.equal(result.status, "applied");
    if (result.status !== "applied") assert.fail(); return result.assignments.find(a => !scope.assignments.some(old => old.id === a.id))!;
  };
  await t.test("read works before any schedule and remains free of fabricated default facts", async () => {
    const read = await client.read(x.orderId, current); assert.equal(read.logistics.assignment, null); assert.deepEqual(read.logistics.settings.productionGroups, []);
    assert.equal(projectArrivalBatchLogistics(read.logistics, "2027-01-01").recommendation?.status, "pending_schedule"); assert.equal((await x.pool.query("SELECT count(*)::int n FROM material_arrival_plans")).rows[0].n, 0);
  });
  const internal = await plan("internal", group.id, "2027-02-01");
  await t.test("style-progress-only actor receives narrow adopted logistics and no resource notes, contacts, schedule quantities or prices", async () => {
    const row = (await x.pool.query("INSERT INTO app_users(username,password_hash,display_name,role) VALUES('arrival.only',crypt($1,gen_salt('bf',4)),'arrival.only','viewer') RETURNING id::text", [x.password])).rows[0];
    await x.pool.query("INSERT INTO app_roles(id,name) VALUES('arrival.only','arrival.only')"); await x.pool.query("INSERT INTO app_user_roles(user_id,role_id) VALUES($1,'arrival.only')", [row.id]);
    for (const key of ["order.view", "ainuoke.view", "style_progress.read"]) await x.pool.query("INSERT INTO app_role_permissions(role_id,permission_key) VALUES('arrival.only',$1)", [key]);
    const onlyCookie = await x.login("arrival.only"), read = await createMaterialArrivalsClient(transport(onlyCookie)).read(x.orderId, current);
    assert.equal(read.canEdit, false); assert.equal(read.logistics.assignment?.id, internal.id); assert.equal(read.logistics.settings.productionSites[0].name, "原采用地点");
    const raw = await transport(onlyCookie)(`/api/v1/material-arrivals/orders/${x.orderId}`); assert.equal(raw.status, 200);
    const json = JSON.stringify({ parsed: read, raw: await raw.json() }); for (const word of ["PRIVATE-", "contactPerson", "phone", "remark", "plannedQuantity", "Price", "cgPrice", "laborPrice", "salePrice"]) assert.equal(json.includes(word), false, word);
    assert.equal(read.logistics.settings.transportModes[0].sortOrder, 1.5);
  });
  let command: ArrivalCommand;
  await t.test("client validates actual preview, applied outcome, exact digest and anchored public history", async () => {
    const read = await client.read(x.orderId, current), d = read.source.demands.find(v => v.materialCode === "SYNTHETIC-MAT-ready")!;
    const intent: ArrivalIntent = { action: "replace_arrival_plan", orderId: x.orderId, canonicalKey: d.canonicalKey, expectedVersion: 0,
      batches: [{ id: randomUUID(), expectedArrivalAtHubDate: "2027-01-01", allocations: [{ materialDemandId: d.id, quantity: "40" }] }, { id: randomUUID(), expectedArrivalAtHubDate: "2027-01-15", allocations: [{ materialDemandId: d.id, quantity: "20" }] }] };
    const preview = await client.preview(intent, read, current); command = { requestId: randomUUID(), intent: preview.intent, previewHash: preview.previewHash };
    const saved = await client.submit(command, current); assert.equal(saved.status, "applied"); assert.equal(saved.payloadHash, await materialArrivalCommandDigest(command));
    const receipt = await client.receipt(command, current); assert.equal(receipt.state, "known"); if (receipt.state !== "known") assert.fail(); assert.equal(receipt.result.status, "applied");
    const state = await client.read(x.orderId, current), modes = state.plans[0].plan.data.batches.map(b => projectArrivalBatchLogistics(state.logistics, b.expectedArrivalAtHubDate).recommendation?.recommendedMode?.name).sort(); assert.deepEqual(modes, ["海运", "陆运"].sort());
    const history = await client.history(x.orderId, d.canonicalKey, 0, null, current); assert.equal(history.history[0].snapshot.orderId, x.orderId); assert.equal(history.history[0].snapshot.version, 1);
    assert.equal(JSON.stringify(history).includes("created_by"), false);
  });
  await t.test("master location edits do not rewrite the schedule's adopted location, while a changed transport plan yields a new current recommendation", async () => {
    await editResource(site, { name: "新主数据名称", preProductionSampleLeadDays: 30 });
    const before = await client.read(x.orderId, current); assert.equal(before.logistics.settings.productionSites[0].name, "原采用地点"); assert.equal(before.logistics.settings.productionSites[0].preProductionSampleLeadDays, 5);
    if (route.kind !== "transport-plans") assert.fail(); route = await editResource(route, { modes: route.modes.map(m => ({ ...m, transitDays: m.name === "海运" ? 40 : m.transitDays })) });
    const after = await client.read(x.orderId, current); assert.equal(after.logistics.versions.route, before.logistics.versions.route! + 1);
    assert.equal(projectArrivalBatchLogistics(after.logistics, "2027-01-01").recommendation?.recommendedMode?.name, "陆运");
    assert.deepEqual(after.plans, before.plans); assert.equal(after.logistics.assignment?.resourceSnapshotHash, internal.resourceSnapshotHash);
  });
  await t.test("earliest outsource is retained instead of silently selecting a later internal plan", async () => {
    const outside = await plan("outsource", factory.id, "2027-01-10"), read = await client.read(x.orderId, current);
    assert.equal(read.logistics.assignment?.id, outside.id); assert.equal(projectArrivalBatchLogistics(read.logistics, "2027-01-01").recommendation?.status, "site_missing");
    const scope = await readOrderProductionPlans(x.pool, admin, x.orderId), p = await previewProductionPlan(x.pool, admin, { action: "cancel", orderId: x.orderId, assignmentId: outside.id, expectedVersion: outside.version, expectedPlanVersion: scope.order.planVersion, reason: "合成取消" });
    assert.equal((await executeProductionPlan(x.pool, admin, { requestId: randomUUID(), intent: p.intent, previewHash: p.previewHash })).status, "applied"); assert.equal((await client.read(x.orderId, current)).logistics.assignment?.id, internal.id);
  });
  await t.test("disabled Hub blocks advice without erasing the saved dates or original receipt", async () => {
    const before = await client.read(x.orderId, current); await editResource(hub, { enabled: false }); const after = await client.read(x.orderId, current);
    assert.deepEqual(after.plans, before.plans); assert.equal(projectArrivalBatchLogistics(after.logistics, "2027-01-01").status, "blocked"); assert.equal((await client.receipt(command!, current)).state, "known");
  });
  await t.test("failed Source leaves plan, public history and original-command receipt accessible", async () => {
    x.setMode("failed"); await assert.rejects(x.capture(), (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "source_capture_failed"));
    const read = await client.read(x.orderId, current); assert.notEqual(read.source.status, "ready"); assert.equal(read.plans.length, 1); assert.ok(read.plans[0].issues.includes("source_unavailable"));
    assert.equal((await client.history(x.orderId, read.plans[0].plan.canonicalKey, 0, 1, current)).history.length, 1); assert.equal((await client.receipt(command!, current)).state, "known");
  });
  assert.equal(x.errors.length, 0); assert.ok(calls.some(v => v.includes("/preview"))); assert.ok(calls.some(v => v.includes("/commands")));
});

import assert from "node:assert/strict";
import test from "node:test";
import { planHash } from "../../../../server/production-scheduling/repository";
import { canonicalPlanJson } from "../../../../server/production-scheduling/canonical-json";
import { canonicalProductionPlanCommand, createProductionPlanClient, productionPlanFingerprint, type PlanCommand } from "../production-plan-client";

const orderId = "11111111-1111-4111-8111-111111111111", groupId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333", assignmentId = "44444444-4444-4444-8444-444444444444";
const time = "2026-10-20T00:00:00.000Z", resourceHash = "a".repeat(64);
const command = canonicalProductionPlanCommand({ requestId, previewHash: "b".repeat(64), intent: { action: "create", orderId, expectedPlanVersion: 2,
  assignmentId: null, expectedVersion: 0, data: { executionType: "internal", executorId: groupId, colorId: null, plannedQuantity: "30", duration: { mode: "workdays", workdays: 2 }, dates: { mode: "auto_queue", startDate: "2027-01-04" }, remark: "合成排单" } } });
const draft = { id: null, orderId, version: 1, executionType: "internal", productionGroupId: groupId, outsourceFactoryId: null, colorId: null, colorNameSnapshot: null,
  plannedQuantity: "30", durationMode: "workdays", dailyOutputSnapshot: "15", requiredWorkdays: 2, dateMode: "auto_queue", plannedStartDate: "2027-01-04", firstProductionDate: "2027-01-04", plannedEndDate: "2027-01-05", nonWorkingDayCount: 0, queueSequence: 1, resourceSnapshotHash: resourceHash, status: "planned", remark: "合成排单" };
const row = { ...draft, id: assignmentId, createdBy: "10", updatedBy: "10", createdAt: time, updatedAt: time };
const summary = { executionType: "internal", group: { id: groupId, name: "组", version: 1 }, site: { id: orderId, name: "地点", version: 2 }, calendar: { id: requestId, name: "日历", version: 3 } };
const preview = { intent: command.intent, previewHash: command.previewHash, changes: [{ before: null, after: draft }], resources: { [resourceHash]: summary }, warnings: [], orderVersions: [{ orderId, version: 2 }], queueVersions: [{ groupId, version: 0 }] };
const outcome = { requestId, payloadHash: planHash(command), status: "applied", changed: true, operationId: "operation-" + requestId, assignments: [row], orderVersions: [{ orderId, version: 3 }], queueVersions: [{ groupId, version: 1 }], replayed: false };
function client(data: unknown, status = 200, calls: { url: string; init?: RequestInit }[] = []) {
  return createProductionPlanClient((async (url, init) => { calls.push({ url: String(url), init }); return Response.json(data, { status }); }) as typeof fetch);
}
test("WebCrypto and Node share the existing recursive canonical bytes, including reordered input keys", async () => {
  const reordered = { previewHash: command.previewHash, intent: { ...command.intent }, requestId };
  assert.equal(await productionPlanFingerprint(reordered), planHash(command));
  assert.equal(canonicalPlanJson({ z: [{ b: 1, a: 2 }], a: null }), '{"a":null,"z":[{"a":2,"b":1}]}');
  assert.throws(() => canonicalProductionPlanCommand({ ...command, completedQuantity: "0" }));
  assert.throws(() => canonicalProductionPlanCommand({ ...command, intent: { ...command.intent, salesPrice: "100" } }));
});
test("preview and one explicit command use session/CSRF boundaries without Browser fallback or money projection", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const actual = await client({ ...preview, salesPrice: "never", changes: [{ before: null, after: { ...draft, completedQuantity: "0", salesPrice: "never" } }] }, 200, calls).preview(command.intent);
  assert.equal(actual.changes[0].after.id, null); assert.equal(JSON.stringify(actual).includes("never"), false); assert.equal("completedQuantity" in actual.changes[0].after, false);
  const saved = await client({ ...outcome, token: "never", assignments: [{ ...row, laborPrice: "never" }] }, 200, calls).execute(command);
  assert.equal(saved.status, "applied"); assert.equal(JSON.stringify(saved).includes("never"), false);
  assert.deepEqual(calls.map(c => c.url), ["/api/v1/production-scheduling/preview", "/api/v1/production-scheduling/commands"]);
  for (const call of calls) { assert.equal(call.init?.method, "POST"); assert.equal(call.init?.credentials, "include"); assert.equal(call.init?.cache, "no-store"); assert.deepEqual(call.init?.headers, { "Content-Type": "application/json", "X-Zhixu-Request": "1" }); }
  assert.equal(calls[1].init?.body, JSON.stringify(command));
});
test("preview rejects changed intent, version, executor facts, unknown warning or inconsistent derived values", async () => {
  const badDrafts = [{ ...draft, version: 2 }, { ...draft, orderId: requestId }, { ...draft, productionGroupId: assignmentId }, { ...draft, dailyOutputSnapshot: "16" }, { ...draft, plannedEndDate: "2027-01-03" }, { ...draft, colorId: assignmentId }, { ...draft, firstProductionDate: null }];
  for (const bad of badDrafts) await assert.rejects(() => client({ ...preview, changes: [{ before: null, after: bad }] }).preview(command.intent));
  for (const bad of [{ ...preview, intent: { ...command.intent, expectedPlanVersion: 9 } }, { ...preview, orderVersions: [{ orderId, version: 3 }] }, { ...preview, orderVersions: [] }, { ...preview, queueVersions: [] }, { ...preview, changes: [] }, { ...preview, resources: {} }, { ...preview, warnings: [{ kind: "not-a-warning", assignmentId: null }] }]) await assert.rejects(() => client(bad).preview(command.intent));
});
test("manual external zero plan preserves null calendar facts and exact large decimal quantities", async () => {
  const external = canonicalProductionPlanCommand({ ...command, intent: { ...command.intent, data: { executionType: "outsource", executorId: groupId, colorId: null, plannedQuantity: "0", duration: { mode: "workdays", workdays: 2 }, dates: { mode: "manual_fixed", startDate: "2027-01-04", endDate: "2027-01-05" }, remark: "" } } });
  const externalRow = { ...row, executionType: "outsource", productionGroupId: null, outsourceFactoryId: groupId, plannedQuantity: "0", dailyOutputSnapshot: "0", dateMode: "manual_fixed", firstProductionDate: null, nonWorkingDayCount: null, queueSequence: null, remark: "" };
  const result = await client({ ...outcome, payloadHash: planHash(external), assignments: [externalRow] }).execute(external);
  assert.equal(result.status, "applied"); if (result.status === "applied") { assert.equal(result.assignments[0].firstProductionDate, null); assert.equal(result.assignments[0].plannedQuantity, "0"); }
  const big = canonicalProductionPlanCommand({ ...command, intent: { ...command.intent, data: { ...(command.intent.action === "create" ? command.intent.data : assert.fail()), plannedQuantity: "9007199254740993.001", duration: { mode: "workdays", workdays: 1 } } } });
  const large = await client({ ...outcome, payloadHash: planHash(big), assignments: [{ ...row, plannedQuantity: "9007199254740993.001", dailyOutputSnapshot: "9007199254740994", requiredWorkdays: 1 }] }).execute(big);
  assert.equal(large.status, "applied"); if (large.status === "applied") assert.equal(large.assignments[0].plannedQuantity, "9007199254740993.001");
});
test("no-change update is terminal but fabricated create/no-op or wrong receipt identity/hash/content stays unresolved", async () => {
  const update: PlanCommand = { ...command, intent: { ...(command.intent as Extract<typeof command.intent, { action: "create" }>), action: "update", assignmentId, expectedVersion: 1, reason: "合成原因" } };
  const unchanged = { ...outcome, payloadHash: planHash(update), changed: false, operationId: null, assignments: [], orderVersions: [{ orderId, version: 2 }] };
  const result = await client(unchanged).execute(update); assert.equal(result.status, "applied"); if (result.status === "applied") assert.equal(result.changed, false);
  for (const bad of [{ ...outcome, requestId: orderId }, { ...outcome, payloadHash: "c".repeat(64) }, { ...outcome, assignments: [{ ...row, version: 2 }] }, { ...outcome, assignments: [{ ...row, plannedQuantity: "31", dailyOutputSnapshot: "16" }] }, { ...outcome, changed: false, operationId: null, assignments: [] }, { ...outcome, operationId: "operation-invalid" }, { ...outcome, orderVersions: [{ orderId, version: 4 }] }, { ...outcome, orderVersions: [] }, { ...outcome, queueVersions: [] }, { ...outcome, replayed: "false" }]) await assert.rejects(() => client(bad).execute(command));
});
test("durable rejections verify status/hash and suppress untrusted code or error text", async () => {
  for (const status of [404, 409, 422]) {
    const rejected = { requestId, payloadHash: planHash(command), status: "rejected", error: { status, code: "production_plan_preview_changed", message: "secret-token" }, replayed: true };
    assert.equal((await client(rejected, status).execute(command)).status, "rejected");
    await assert.rejects(() => client(rejected, 200).execute(command));
    await assert.rejects(() => client({ ...rejected, payloadHash: "c".repeat(64) }, status).execute(command));
    assert.equal(JSON.stringify(await client({ ...rejected, error: { status, code: "secret-token" } }, status).execute(command)).includes("secret-token"), false);
    const receipt = await client({ state: "known", requestId, result: rejected }).receipt(command); assert.equal(receipt.state, "known");
  }
  await assert.rejects(() => client({ error: { code: "production_queue_limit" } }, 422).execute(command), { knownNotApplied: false });
});
test("pending/unknown/known receipts perform only GET and never invent a retry or automatic acknowledgement", async () => {
  for (const state of ["known", "pending", "unknown"] as const) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const result = await client({ state, requestId, result: state === "known" ? outcome : null }, 200, calls).receipt(command);
    assert.equal(result.state, state); assert.equal(calls.length, 1); assert.equal(calls[0].init?.method, "GET"); assert.equal(calls[0].url, "/api/v1/production-scheduling/commands/" + requestId);
  }
  for (const data of [{ state: "known", requestId: orderId, result: outcome }, { state: "known", requestId, result: { ...outcome, payloadHash: "wrong" } }, { state: "unknown", requestId, result: outcome }]) await assert.rejects(() => client(data).receipt(command));
});
test("transport/JSON/UTF8/oversize failures remain safe unknown or invalid results after one attempt", async () => {
  for (const fetcher of [async () => { throw Error("secret-token"); }, async () => new Response("secret-token", { status: 502 }), async () => new Response(new Uint8Array([255])), async () => new Response(" ".repeat(1024 * 1024 + 4097))]) {
    let calls = 0; await assert.rejects(() => createProductionPlanClient((async () => { calls++; return fetcher(); }) as typeof fetch).execute(command), (error: unknown) => error instanceof Error && !error.message.includes("secret-token")); assert.equal(calls, 1);
  }
  await assert.rejects(() => client({ error: { code: "secret-token", message: "secret-token" } }, 503).execute(command), { code: "plan_outcome_unknown", knownNotApplied: false });
});
test("constructed one-MiB logical results retain bounded room for both command and receipt envelopes", async () => {
  const rows = Array.from({ length: 400 }, (_, index) => ({ ...row, id: (index + 100).toString(16).padStart(8, "0") + "-1111-4111-8111-111111111111", queueSequence: index + 1, remark: "" }));
  const replan: PlanCommand = { ...command, intent: { action: "replan", groupId, expectedQueueVersion: 2, anchorDate: "2027-01-04", orderedAssignmentIds: rows.map(item => item.id) } };
  const logical = { requestId, status: "applied", changed: true, operationId: outcome.operationId, assignments: rows,
    orderVersions: [{ orderId, version: 3 }], queueVersions: [{ groupId, version: 3 }] };
  // Wire-format construction only: a real service preview may hit its larger
  // complete fingerprint limit before this logical result size is reachable.
  let remaining = 1024 * 1024 - Buffer.byteLength(JSON.stringify(logical)); assert.ok(remaining > 0);
  for (const item of rows) { const length = Math.min(2000, remaining); item.remark = "x".repeat(length); remaining -= length; }
  assert.equal(remaining, 0); assert.equal(Buffer.byteLength(JSON.stringify(logical)), 1024 * 1024);
  const result = { ...logical, payloadHash: planHash(replan) }, reply = { ...result, replayed: false };
  assert.ok(Buffer.byteLength(JSON.stringify(reply)) > 1024 * 1024);
  assert.equal((await client(reply).execute(replan)).status, "applied");
  assert.equal((await client({ state: "known", requestId, result }).receipt(replan)).state, "known");
  let cancelled = false;
  const oversized = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(1024 * 1024 + 4097)); }, cancel() { cancelled = true; } });
  await assert.rejects(() => createProductionPlanClient((async () => new Response(oversized)) as typeof fetch).execute(command), { code: "plan_response_invalid" });
  assert.equal(cancelled, true);
});
test("identity change during digest prevents POST and GET; late 401 belongs to the old owner", async () => {
  for (const operation of ["execute", "receipt"] as const) { const calls: { url: string; init?: RequestInit }[] = []; let active = true;
    const pending = client(outcome, 200, calls)[operation](command, () => active); active = false;
    await assert.rejects(() => pending, { code: "plan_owner_changed" }); assert.equal(calls.length, 0);
  }
  let active = true, release!: (response: Response) => void;
  const controlled = createProductionPlanClient((() => new Promise<Response>(done => { release = done; })) as typeof fetch);
  const pending = controlled.preview(command.intent, () => active); active = false; release(Response.json({ error: { code: "authentication_required" } }, { status: 401 }));
  await assert.rejects(() => pending, { code: "plan_owner_changed" });
  let bodyStarted!: () => void, finishBody!: () => void; const started = new Promise<void>(done => { bodyStarted = done; }); active = true;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) { bodyStarted(); return new Promise<void>(done => { finishBody = () => { controller.enqueue(new TextEncoder().encode(JSON.stringify(preview))); controller.close(); done(); }; }); } }, { highWaterMark: 0 });
  const streamed = createProductionPlanClient((async () => new Response(stream)) as typeof fetch).preview(command.intent, () => active);
  await started; active = false; finishBody(); await assert.rejects(() => streamed, { code: "plan_owner_changed" });
});
test("explicit replan validates the same group, complete result identities and queue version", async () => {
  const replan: PlanCommand = { ...command, intent: { action: "replan", groupId, expectedQueueVersion: 2, anchorDate: "2027-01-04", orderedAssignmentIds: [assignmentId] } };
  const current = { ...outcome, payloadHash: planHash(replan), assignments: [{ ...row, version: 2 }], queueVersions: [{ groupId, version: 3 }] };
  assert.equal((await client(current).execute(replan)).status, "applied");
  assert.equal((await client({ ...current, changed: false, operationId: null, assignments: [], queueVersions: [{ groupId, version: 2 }] }).execute(replan)).status, "applied");
  for (const bad of [{ ...current, queueVersions: [{ groupId, version: 2 }] }, { ...current, orderVersions: [] }, { ...current, assignments: [{ ...row, id: requestId }] }, { ...current, assignments: [{ ...row, productionGroupId: orderId }] }]) await assert.rejects(() => client(bad).execute(replan));
});

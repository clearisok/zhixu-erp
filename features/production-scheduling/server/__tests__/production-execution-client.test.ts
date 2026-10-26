import assert from "node:assert/strict";
import test from "node:test";
import { planHash } from "../../../../server/production-scheduling/repository";
import { previewExecutionChange } from "../../../../server/production-scheduling/execution-preview";
import { parseExecutionCommand } from "../../../../server/production-scheduling/execution-contract";
import { createProductionPlanClient, productionPlanFingerprint, type ExecutionScope, type StoredExecution } from "../production-plan-client";
import { executionFormIntent, newExecutionForm } from "../production-execution-form";
import { assignmentId, groupId, orderId, orderRead, orderSummary, requestId, resourceHash, resources, savedAssignment, time } from "./production-plan-read-fixture";

const scope: ExecutionScope = { order: orderRead, assignment: savedAssignment, queue: null };
const form = { ...newExecutionForm(scope), completedQuantity: "12.5" };
const intent = executionFormIntent(scope, form);
const attribution = { assignmentId, orderId, executionType: "internal" as const, productionGroupId: groupId, outsourceFactoryId: null, colorId: null, colorNameSnapshot: null, resourceSnapshotHash: resourceHash };
const head: StoredExecution = { ...intent.data, version: 1, assignmentVersion: 1, assignmentId, orderId, attribution, createdAt: time, updatedAt: time };
const pure = previewExecutionChange({ intent, assignment: savedAssignment, execution: null, planVersion: 2, queue: null });
const preview = { ...pure, previewHash: "b".repeat(64), planChanges: [], orderVersions: [{ orderId, version: 2 }], queueVersions: [{ groupId, version: 4 }] };
const command = parseExecutionCommand({ requestId, intent, previewHash: preview.previewHash });
const outcome = { requestId, payloadHash: planHash(command), status: "applied", changed: true, operationId: "operation-" + requestId,
  assignments: [], execution: head, assignmentId, orderVersions: [{ orderId, version: 3 }], queueVersions: [{ groupId, version: 5 }], replayed: false };
function client(value: unknown, status = 200, calls: { path: string; init?: RequestInit }[] = []) {
  return createProductionPlanClient((async (path, init) => { calls.push({ path: String(path), init }); return Response.json(value, { status }); }) as typeof fetch);
}
const withHead = (value: StoredExecution = head): ExecutionScope => ({ ...scope, order: { ...orderRead, executions: { [assignmentId]: value } } });

test("execution form never invents quantity or actual dates; zero and large decimals remain exact", () => {
  assert.deepEqual(newExecutionForm(scope), { status: "in_progress", completedQuantity: "", actualStartDate: "", actualCompletedDate: "", reason: "" });
  assert.equal(newExecutionForm(scope, true).actualCompletedDate, "");
  assert.throws(() => executionFormIntent(scope, newExecutionForm(scope)));
  assert.throws(() => executionFormIntent(scope, { ...form, status: "completed" }));
  assert.equal(executionFormIntent(scope, { ...form, completedQuantity: "9007199254740993.001" }).data.completedQuantity, "9007199254740993.001");
  assert.equal(executionFormIntent(scope, { ...form, completedQuantity: "0" }).data.completedQuantity, "0");
  assert.equal(newExecutionForm(withHead({ ...head, completedQuantity: "0" })).completedQuantity, "0");
  for (const completedQuantity of ["", "1e2", "-1", "NaN"]) assert.throws(() => executionFormIntent(scope, { ...form, completedQuantity }));
  for (const patch of [{ completedQuantity: "12" }, { actualStartDate: "2027-01-01" }]) {
    const previous = patch.actualStartDate ? withHead({ ...head, actualStartDate: "2027-01-02" }) : withHead();
    assert.throws(() => executionFormIntent(previous, { ...form, ...patch }), { code: "production_execution_reason_required" });
    assert.equal(executionFormIntent(previous, { ...form, ...patch, reason: "明确更正" }).reason, "明确更正");
  }
  const ended = withHead({ ...head, status: "completed", actualCompletedDate: "2027-01-04" });
  assert.throws(() => executionFormIntent(ended, form), { code: "production_execution_reason_required" });
  assert.throws(() => executionFormIntent(scope, { ...form, status: "completed", actualCompletedDate: "2027-02-30" }));
  assert.throws(() => executionFormIntent(scope, form, true));
});

test("order and queue actual facts are explicit non-monetary projections with original attribution", async () => {
  const raw = { ...orderRead, executions: { [assignmentId]: { ...head, salesPrice: "hidden", attribution: { ...attribution, laborPrice: "hidden" } } } };
  const actual = await client(raw).order(orderId); assert.deepEqual(actual.executions[assignmentId], head); assert.equal(JSON.stringify(actual).includes("hidden"), false);
  assert.deepEqual((await client(orderRead).order(orderId)).executions, {});
  const zero = await client({ ...raw, executions: { [assignmentId]: { ...head, completedQuantity: "0" } } }).order(orderId); assert.equal(zero.executions[assignmentId].completedQuantity, "0");
  const queue = { groupId, group: { id: groupId, name: "组", enabled: false, version: 1 }, version: 4, assignments: [savedAssignment], executions: raw.executions, resources, ordersById: { [orderId]: orderSummary } };
  assert.deepEqual((await client(queue).queue(groupId)).executions[assignmentId], head);
  for (const change of [{ orderId: groupId }, { assignmentId: requestId }, { assignmentVersion: 2 }, { completedQuantity: 12.5 }, { actualStartDate: "2027-02-30" },
    { attribution: { ...attribution, resourceSnapshotHash: "c".repeat(64) } }, { attribution: { ...attribution, productionGroupId: requestId } }, { attribution: { ...attribution, colorId: requestId, colorNameSnapshot: "新颜色" } }]) {
    await assert.rejects(() => client({ ...raw, executions: { [assignmentId]: { ...head, ...change } } }).order(orderId));
  }
  await assert.rejects(() => client({ ...raw, executions: { [requestId]: head } }).order(orderId));
  await assert.rejects(() => client({ ...raw, canComplete: "true" }).order(orderId));
});

test("execution preview and commit use the existing session transport and canonical digest", async () => {
  const calls: { path: string; init?: RequestInit }[] = [];
  const read = await client({ ...preview, salePrice: "hidden" }, 200, calls).executionPreview(intent, scope);
  assert.equal(read.before, null); assert.equal(read.after.completedQuantity, "12.5"); assert.equal(JSON.stringify(read).includes("hidden"), false);
  assert.equal(await productionPlanFingerprint(command), planHash(command));
  const saved = await client({ ...outcome, token: "hidden" }, 200, calls).execute(command);
  assert.equal(saved.status, "applied"); assert.equal(JSON.stringify(saved).includes("hidden"), false);
  assert.deepEqual(calls.map(row => row.path), ["/api/v1/production-scheduling/execution/preview", "/api/v1/production-scheduling/execution/commands"]);
  for (const row of calls) { assert.equal(row.init?.credentials, "include"); assert.equal(row.init?.cache, "no-store"); assert.equal(row.init?.method, "POST"); assert.deepEqual(row.init?.headers, { "Content-Type": "application/json", "X-Zhixu-Request": "1" }); }
  for (const raw of [{ ...preview, before: { ...preview.after, version: 1 } }, { ...preview, after: { ...preview.after, completedQuantity: "13" } }, { ...preview, changed: false },
    { ...preview, orderVersions: [] }, { ...preview, queueVersions: [] }, { ...preview, intent: { ...intent, expectedExecutionVersion: 1 } }, { ...preview, replannableAssignmentIds: [requestId] }]) await assert.rejects(() => client(raw).executionPreview(intent, scope));
});

test("completion replan preview cannot change product, executor, protected rows or earlier rows", async () => {
  const laterId = "55555555-5555-4555-8555-555555555555", later = { ...savedAssignment, id: laterId, orderId: requestId, queueSequence: 2 };
  const queue = { groupId, group: { id: groupId, name: "组", enabled: true, version: 1 }, version: 4, assignments: [savedAssignment, later], executions: {}, resources,
    ordersById: { [orderId]: orderSummary, [requestId]: { ...orderSummary, id: requestId } } };
  const context: ExecutionScope = { ...scope, queue }, ended = executionFormIntent(context, { ...form, status: "completed", actualCompletedDate: "2027-01-06" }, true);
  const { createdAt: _c, updatedAt: _u, createdBy: _cb, updatedBy: _ub, ...laterDraft } = later; void _c; void _u; void _cb; void _ub;
  const after = { ...laterDraft, version: 2, plannedStartDate: "2027-01-06", firstProductionDate: "2027-01-07", plannedEndDate: "2027-01-08" };
  const raw = { ...preview, intent: ended, after: { ...ended.data, version: 1 }, queuePreview: { warnings: [] }, replannableAssignmentIds: [laterId],
    planChanges: [{ before: later, after }], orderVersions: [{ orderId, version: 2 }, { orderId: requestId, version: 2 }] };
  assert.equal((await client(raw).executionPreview(ended, context)).planChanges.length, 1);
  for (const patch of [{ plannedQuantity: "31", dailyOutputSnapshot: "16" }, { productionGroupId: requestId }, { colorId: requestId, colorNameSnapshot: "红" }, { queueSequence: 3 }]) await assert.rejects(() => client({ ...raw, planChanges: [{ before: later, after: { ...after, ...patch } }] }).executionPreview(ended, context));
  await assert.rejects(() => client({ ...raw, queuePreview: null }).executionPreview(ended, context));
  await assert.rejects(() => client(raw).executionPreview(ended, { ...context, queue: { ...queue, executions: { [laterId]: { ...head, assignmentId: laterId, orderId: requestId, attribution: { ...attribution, assignmentId: laterId, orderId: requestId } } } } }));
  await assert.rejects(() => client(raw).executionPreview(ended, { ...context, queue: { ...queue, assignments: [later, savedAssignment] } }));
});

test("execution receipts validate exact command, facts, versions and durable rejection; no automatic POST", async () => {
  for (const state of ["unknown", "pending", "known"] as const) {
    const calls: { path: string; init?: RequestInit }[] = [], result = await client({ state, requestId, result: state === "known" ? outcome : null }, 200, calls).receipt(command);
    assert.equal(result.state, state); assert.equal(calls.length, 1); assert.equal(calls[0].init?.method, "GET");
  }
  for (const raw of [{ ...outcome, payloadHash: "a".repeat(64) }, { ...outcome, assignmentId: requestId }, { ...outcome, execution: { ...head, version: 2 } },
    { ...outcome, execution: { ...head, completedQuantity: "99" } }, { ...outcome, orderVersions: [{ orderId, version: 2 }] }, { ...outcome, queueVersions: [] }, { ...outcome, changed: false }, { ...outcome, replayed: "false" }]) await assert.rejects(() => client(raw).execute(command));
  const unchangedIntent = executionFormIntent(withHead(), form), unchangedCommand = parseExecutionCommand({ ...command, intent: unchangedIntent });
  assert.equal((await client({ ...outcome, changed: false, operationId: null, payloadHash: planHash(unchangedCommand), orderVersions: [{ orderId, version: 2 }] }).execute(unchangedCommand)).status, "applied");
  for (const status of [404, 409, 422]) {
    const rejected = { requestId, status: "rejected", payloadHash: planHash(command), error: { status, code: "production_execution_preview_changed", message: "hidden" }, replayed: false };
    assert.equal((await client(rejected, status).execute(command)).status, "rejected");
    assert.equal((await client({ state: "known", requestId, result: rejected }).receipt(command)).state, "known");
    await assert.rejects(() => client(rejected).execute(command));
  }
  await assert.rejects(() => client({ error: { code: "production_execution_projection_limit" } }, 422).execute(command), { knownNotApplied: false });
});

const snapshot = (version: number) => ({ version, assignment_id: assignmentId, sales_order_id: orderId, assignment_version: 1, attribution,
  status: "in_progress", completed_quantity: "12.5", actual_start_date: null, actual_completed_date: null, created_at: "2026-10-20T08:00:00+08:00", updated_at: "2026-10-20T08:00:00+08:00", privatePrice: "hidden" });
const event = (version: number) => ({ version, requestId, operationId: "operation-" + requestId, reason: "合成更正", recordedAt: time, snapshot: snapshot(version) });
test("execution history has an independent stable anchor, exact original attribution and no raw amounts", async () => {
  const raw = { assignment: savedAssignment, execution: { ...head, version: 51 }, history: Array.from({ length: 50 }, (_, i) => event(51 - i)), asOfVersion: 51, offset: 0, limit: 50, hasMore: true, nextOffset: 50 };
  const first = await client(raw).executionHistory(assignmentId); assert.equal(first.history.length, 50); assert.equal(first.history[0].version, 51); assert.equal(JSON.stringify(first).includes("hidden"), false);
  const calls: { path: string; init?: RequestInit }[] = [];
  const next = await client({ ...raw, execution: { ...head, version: 52 }, history: [event(1)], offset: 50, hasMore: false, nextOffset: null }, 200, calls).executionHistory(assignmentId, 50, first.asOfVersion);
  assert.equal(next.history[0].version, 1); assert.ok(calls[0].path.endsWith("?offset=50&asOfVersion=51"));
  const empty = await client({ ...raw, execution: null, history: [], asOfVersion: 0, hasMore: false, nextOffset: null }).executionHistory(assignmentId); assert.equal(empty.execution, null);
  for (const changed of [{ asOfVersion: 52 }, { history: [event(50)] }, { history: [{ ...event(51), snapshot: { ...snapshot(51), attribution: { ...attribution, colorNameSnapshot: "其他" } } }] }, { hasMore: false, nextOffset: null }]) await assert.rejects(() => client({ ...raw, ...changed }).executionHistory(assignmentId, 0, 51));
});

test("execution reads/commands preserve session leases and stop after one transport or untrusted error", async () => {
  for (const operation of ["execute", "receipt"] as const) {
    let active = true, calls = 0;
    const pending = createProductionPlanClient((async () => { calls++; return Response.json(outcome); }) as typeof fetch)[operation](command, () => active); active = false;
    await assert.rejects(() => pending, { code: "plan_owner_changed" }); assert.equal(calls, 0);
  }
  let active = true, release!: (value: Response) => void;
  const pending = createProductionPlanClient((() => new Promise<Response>(done => { release = done; })) as typeof fetch).executionPreview(intent, scope, () => active);
  active = false; release(Response.json({ error: { code: "authentication_required" } }, { status: 401 })); await assert.rejects(() => pending, { code: "plan_owner_changed" });
  for (const response of [() => { throw Error("hidden-token"); }, () => new Response("bad-json", { status: 502 }), () => new Response("x".repeat(1024 * 1024 + 4097))]) {
    let calls = 0; await assert.rejects(() => createProductionPlanClient((async () => { calls++; return response(); }) as typeof fetch).execute(command), (error: unknown) => error instanceof Error && !error.message.includes("hidden-token")); assert.equal(calls, 1);
  }
});

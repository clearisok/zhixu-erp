import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { canonicalResourceCommand, createProductionResourceClient, productionResourceInput, resourceCommandFingerprint, type ProductionResourceCommand } from "../production-resource-client";

const id = "11111111-1111-4111-8111-111111111111", requestId = "22222222-2222-4222-8222-222222222222";
const time = "2026-10-20T00:00:00.000Z";
const command = (() => {
  const value = canonicalResourceCommand({ requestId, kind: "factories", action: "create", resourceId: null, expectedVersion: 0, data: { name: "合成外发厂", enabled: true, remark: "", shortName: "合成", contactPerson: "联系人", phone: "0000" } });
  if (value.kind !== "factories") throw Error("Invalid synthetic fixture"); return value;
})();
const hash = createHash("sha256").update(JSON.stringify(command)).digest("hex");
const resource = { id, kind: command.kind, version: 1, createdAt: time, updatedAt: time, ...command.data };
const outcome = { requestId, kind: command.kind, payloadHash: hash, status: "applied", resource, changed: true, operationId: "operation-" + id, replayed: false };
function client(data: unknown, status = 200, calls?: { url: string; init?: RequestInit }[]) {
  return createProductionResourceClient((async (url, init) => { calls?.push({ url: String(url), init }); return Response.json(data, { status }); }) as typeof fetch);
}
test("browser SHA-256 matches the existing canonical Server command, without reordering or another algorithm", async () => {
  assert.equal(await resourceCommandFingerprint(command), hash);
  assert.deepEqual(productionResourceInput(resource), command.data);
  assert.throws(() => canonicalResourceCommand({ ...command, password: "never" }));
});
test("one explicit POST uses trusted credentials and canonical body; no replay or local fallback", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const actual = await client({ ...outcome, password_hash: "never" }, 200, calls).execute(command);
  assert.equal(actual.status, "applied"); assert.equal(JSON.stringify(actual).includes("never"), false);
  assert.equal(calls.length, 1); assert.equal(calls[0].url, "/api/v1/production-resources/commands");
  assert.equal(calls[0].init?.credentials, "include"); assert.equal(calls[0].init?.cache, "no-store");
  assert.deepEqual(calls[0].init?.headers, { "Content-Type": "application/json", "X-Zhixu-Request": "1" });
  assert.equal(calls[0].init?.body, JSON.stringify(command));
});
test("transport, malformed JSON and untrusted messages remain unknown with one attempt", async () => {
  for (const fetcher of [async () => { throw Error("secret-token"); }, async () => new Response("secret-token", { status: 502 }), async () => Response.json({ error: { message: "secret-token" } }, { status: 503 })]) {
    let calls = 0;
    await assert.rejects(() => createProductionResourceClient((async () => { calls++; return fetcher(); }) as typeof fetch).execute(command), error => error instanceof Error && !error.message.includes("secret-token"));
    assert.equal(calls, 1);
  }
});
test("identity changed while WebCrypto was pending cannot send a POST or receipt read with another user's cookie", async () => {
  for (const operation of ["execute", "receipt"] as const) {
    const calls: { url: string; init?: RequestInit }[] = []; let active = true;
    const pending = client(outcome, 200, calls)[operation](command, () => active);
    active = false;
    await assert.rejects(() => pending, { code: "resource_owner_changed" }); assert.equal(calls.length, 0);
    await assert.rejects(() => client(outcome, 200, calls)[operation](command, () => false), { code: "resource_owner_changed" });
    assert.equal(calls.length, 0);
  }
});
test("wrong actor/request receipt, type, hash, resource identity, version, values and operation identity fail closed", async () => {
  const update = canonicalResourceCommand({ ...command, action: "update", resourceId: id, expectedVersion: 2 });
  const updateHash = await resourceCommandFingerprint(update);
  const valid = { ...outcome, payloadHash: updateHash, resource: { ...resource, version: 3 } };
  for (const data of [
    { ...valid, requestId: id }, { ...valid, kind: "groups" }, { ...valid, payloadHash: "a".repeat(64) },
    { ...valid, resource: { ...valid.resource, id: requestId } }, { ...valid, resource: { ...valid.resource, version: 2 } },
    { ...valid, resource: { ...valid.resource, remark: "different" } }, { ...valid, operationId: "operation-" + "-".repeat(36) },
    { ...valid, resource: { ...valid.resource, version: "3" } }, { ...valid, replayed: "false" },
  ]) await assert.rejects(() => client(data).execute(update));
  await assert.rejects(() => client({ ...outcome, changed: false, operationId: null }).execute(command));
});
test("no-change update and durable 404/409 rejection are known terminal outcomes", async () => {
  const update = canonicalResourceCommand({ ...command, action: "update", resourceId: id, expectedVersion: 1 });
  const payloadHash = await resourceCommandFingerprint(update);
  const unchanged = await client({ ...outcome, payloadHash, changed: false, operationId: null }).execute(update);
  assert.equal(unchanged.status, "applied"); if (unchanged.status === "applied") assert.equal(unchanged.changed, false);
  for (const [status, code] of [[404, "production_resource_not_found"], [409, "production_resource_version_conflict"]] as const) {
    const rejected = { requestId, kind: command.kind, status: "rejected", payloadHash: hash, error: { status, code }, replayed: true };
    assert.equal((await client(rejected, status).execute(command)).status, "rejected");
    await assert.rejects(() => client(rejected, 200).execute(command));
    await assert.rejects(() => client({ ...rejected, payloadHash: "wrong" }, status).execute(command));
  }
});
test("receipt reads never POST and distinguish known, pending and unknown without inventing failure", async () => {
  for (const state of ["known", "pending", "unknown"] as const) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const result = await client({ state, requestId, result: state === "known" ? outcome : null }, 200, calls).receipt(command);
    assert.equal(result.state, state); assert.equal(calls.length, 1); assert.equal(calls[0].init?.method, "GET");
    assert.equal(calls[0].url, "/api/v1/production-resources/commands/" + requestId);
  }
  for (const data of [{ state: "unknown", requestId: id, result: null }, { state: "known", requestId, result: { ...outcome, payloadHash: "wrong" } }, { state: "unknown", requestId, result: outcome }]) await assert.rejects(() => client(data).receipt(command));
});
test("calendar list is a summary; editing requires a complete detail and stable matching identity", async () => {
  const calendar = { id, kind: "calendars", version: 1, createdAt: time, updatedAt: time, name: "合成日历", enabled: true, remark: "", workingWeekdays: [1, 2], exceptionCount: 1 };
  const query = { search: "", status: "all" as const, offset: 0, limit: 20 };
  const list = await client({ items: [{ ...calendar, exceptions: [{ date: "not-a-date" }] }], total: 1, offset: 0, limit: 20, canEdit: true }).list("calendars", query);
  assert.equal(Object.hasOwn(list.items[0], "exceptions"), false);
  await assert.rejects(() => client({ resource: calendar }).read("calendars", id));
  const detail = { ...calendar, exceptions: [{ date: "2027-01-01", type: "non_working", name: "合成假日" }] };
  assert.equal((await client({ resource: detail }).read("calendars", id)).id, id);
  await assert.rejects(() => client({ resource: { ...detail, id: requestId } }).read("calendars", id));
  for (const data of [
    { items: [calendar, calendar], total: 2, offset: 0, limit: 20, canEdit: true },
    { items: [calendar], total: 0, offset: 0, limit: 20, canEdit: true },
    { items: [calendar], total: 1, offset: 20, limit: 20, canEdit: true },
  ]) await assert.rejects(() => client(data).list("calendars", query));
});
test("auth and validation errors cannot echo arbitrary server messages or mark auth failure as non-applied", async () => {
  for (const status of [401, 403, 400]) {
    const error = { error: { code: "invalid_production_resource_command", message: "secret-token" } };
    await assert.rejects(() => client(error, status).execute(command), value => value instanceof Error && !value.message.includes("secret-token") && (value as { knownNotApplied?: boolean }).knownNotApplied === (status === 400));
  }
});
test("only a fully matched bounded-result 422 is terminal; GET recovery and unknown replies stay distinct", async () => {
  const rejected = { requestId, kind: command.kind, status: "rejected", payloadHash: hash, error: { status: 422, code: "production_resource_result_too_large" }, replayed: false };
  assert.equal((await client(rejected, 422).execute(command)).status, "rejected");
  const receipt = await client({ state: "known", requestId, result: rejected }).receipt(command);
  assert.equal(receipt.state, "known");
  if (receipt.state === "known") assert.equal(receipt.result.status, "rejected");
  for (const invalid of [
    { ...rejected, payloadHash: "wrong" }, { ...rejected, error: { status: 422, code: "production_calendar_disabled" } },
    { ...rejected, error: { status: 422, code: "untrusted-code" } },
  ]) await assert.rejects(() => client(invalid, 422).execute(command));
  await assert.rejects(() => client(rejected, 200).execute(command));
  await assert.rejects(() => client({ ...rejected, error: { status: 409, code: "production_resource_result_too_large" } }, 409).execute(command));
  await assert.rejects(() => client({ error: rejected.error }, 422).execute(command), error => error instanceof Error && (error as { knownNotApplied?: boolean }).knownNotApplied === false);
});
// Ensure the rejected/known type stays usable without unsafe cast at the page boundary.
void (command satisfies ProductionResourceCommand);

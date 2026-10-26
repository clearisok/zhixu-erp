import assert from "node:assert/strict";
import test from "node:test";
import { canonicalResourceCommand } from "../production-resource-client";
import { acknowledgeResourcePending, readResourcePending, resourcePendingKey, saveResourcePending } from "../production-resource-outbox";
const userId = "11111111-1111-4111-8111-111111111111", requestId = "22222222-2222-4222-8222-222222222222";
const scope = { userId, kind: "factories" as const };
const command = (() => {
  const value = canonicalResourceCommand({ requestId, kind: "factories", action: "create", resourceId: null, expectedVersion: 0, data: { name: "合成外发厂", enabled: true, remark: "", shortName: "", contactPerson: "", phone: "" } });
  if (value.kind !== "factories") throw Error("Invalid synthetic fixture"); return value;
})();
class MemoryStorage {
  values = new Map<string, string>(); keys: string[] = [];
  getItem(key: string) { this.keys.push(key); return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
test("pending survives refresh-style reads; exact save preserves original bytes and timestamp", () => {
  const storage = new MemoryStorage(); saveResourcePending(storage, scope, command);
  const raw = storage.values.get(resourcePendingKey(scope));
  assert.deepEqual(readResourcePending(storage, scope), command); saveResourcePending(storage, scope, command);
  assert.equal(storage.values.get(resourcePendingKey(scope)), raw);
  assert.equal(Object.keys(JSON.parse(raw!)).length, 5);
});
test("only the exact original command can be acknowledged; another request or body remains blocked", () => {
  const storage = new MemoryStorage(); saveResourcePending(storage, scope, command);
  for (const other of [{ ...command, requestId: userId }, { ...command, data: { ...command.data, name: "changed" } }]) {
    assert.throws(() => saveResourcePending(storage, scope, other)); assert.throws(() => acknowledgeResourcePending(storage, scope, other));
    assert.deepEqual(readResourcePending(storage, scope), command);
  }
  acknowledgeResourcePending(storage, scope, command); assert.equal(readResourcePending(storage, scope), null);
});
test("user and kind are isolated; no Browser business namespace is read, cleared or replaced", () => {
  const storage = new MemoryStorage(); storage.values.set("zhixu.erp.local.quotes", "sentinel"); saveResourcePending(storage, scope, command);
  assert.equal(readResourcePending(storage, { ...scope, userId: requestId }), null);
  assert.equal(readResourcePending(storage, { ...scope, kind: "groups" }), null);
  assert.throws(() => saveResourcePending(storage, { ...scope, kind: "groups" }, command));
  assert.ok(storage.keys.every(key => key.startsWith("zhixu.server.production-resource.pending.v1.")));
  assert.equal(storage.values.get("zhixu.erp.local.quotes"), "sentinel");
});
test("corrupt, future, oversized, noncanonical or foreign pending bytes are preserved and block overwrite", () => {
  const valid = { schemaVersion: 1, userId, kind: "factories", savedAt: "2026-10-20T00:00:00.000Z", command };
  for (const raw of ["not-json", JSON.stringify({ ...valid, schemaVersion: 2 }), JSON.stringify({ ...valid, userId: requestId }), JSON.stringify({ ...valid, savedAt: "invalid" }), JSON.stringify({ ...valid, extra: true }), JSON.stringify({ ...valid, command: { ...command, data: { ...command.data, name: "  changed  " } } }), "中".repeat(400000)]) {
    const storage = new MemoryStorage(); storage.values.set(resourcePendingKey(scope), raw);
    assert.throws(() => readResourcePending(storage, scope)); assert.throws(() => saveResourcePending(storage, scope, command)); assert.throws(() => acknowledgeResourcePending(storage, scope, command));
    assert.equal(storage.values.get(resourcePendingKey(scope)), raw);
  }
});
test("read/write/readback/removal failures have no memory fallback or fake acknowledgement", () => {
  assert.throws(() => saveResourcePending({ getItem() { throw Error("denied"); }, setItem() {} }, scope, command));
  assert.throws(() => saveResourcePending({ getItem() { return null; }, setItem() {} }, scope, command));
  assert.throws(() => saveResourcePending({ getItem() { return null; }, setItem() { throw Error("quota"); } }, scope, command));
  const storage = new MemoryStorage(); saveResourcePending(storage, scope, command);
  assert.throws(() => acknowledgeResourcePending({ getItem: key => storage.getItem(key), removeItem() {} }, scope, command));
  assert.deepEqual(readResourcePending(storage, scope), command);
});

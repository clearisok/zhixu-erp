import type { Pool, PoolClient } from "pg";
import type { TrustedIdentity } from "../auth/session.js";
import { readCurrentActor } from "../auth/current-actor.js";
import { requirePermission } from "../auth/permissions.js";
import { HttpError } from "../http/errors.js";
import { appendOperationLog } from "../operation-logs/repository.js";
import { identityUuid } from "../sales-orders/identity-model.js";
import { requireVerifiedOrderBusiness } from "../sales-orders/identity-service.js";
import { freezePhysicalOrderGroups, lockEffectiveAttribution, requireEffectiveOrderForWrite, resolveEffectiveOrder } from "../sales-orders/effective-attribution.js";
import { hash, sourceKeyValid } from "./contract.js";
import { boundOrders } from "./service.js";
import { paymentDatabaseFingerprint } from "./payment-request-collection.js";
import { garmentCollectionProof, type GarmentCollectionPermit, type GarmentCollectionRequest } from "./garment-collection-control.js";

export type GarmentTargetRequest = { action: "enable"; request: GarmentCollectionRequest; freshnessMs: number }
  | { action: "disable"; sourceKey: string; salesOrderId: string; operatorUsername: string };
type Desired = { accountFingerprint: string; verificationSha256: string; freshnessMs: number } | null;
type Parsed = { action: "enable" | "disable"; sourceKey: string; salesOrderId: string; operatorUsername: string;
  desired: Desired; salesContractNo: string | null };
type Target = { accountFingerprint: string; enabled: boolean; verificationSha256: string | null; freshnessMs: number; version: number };
type Binding = { sourceOwnerOrderId: string; sourceLinkId: string; attributionChangeId: string | null;
  attributionVersion: number; orderVersion: number; salesContractNo: string };
type Scope = { schemaVersion: "ainuoke-garment-target-scope.v1"; databaseFingerprint: string;
  actor: { internalUserId: string; userId: string; username: string }; sourceKey: string; salesOrderId: string;
  action: "enable" | "disable"; desired: Desired; profile: { accountFingerprint: string; enabled: boolean } | null;
  target: Target | null; binding: Binding | null; generation: number | null };
type Outcome = { schemaVersion: "ainuoke-garment-target-outcome.v1"; action: "enable" | "disable";
  enabled: boolean; changed: boolean; version: number; sourceRead: "none"; snapshotsPublished: 0 };
type Stored = { actor_id: string; source_key: string; sales_order_id: string; source_owner_order_id: string | null;
  action: "enable" | "disable"; scope_hash: string; payload_hash: string; expires_at: Date; scope: Scope; result: Outcome };
type PreviewPermit = Pick<GarmentCollectionPermit, "requestId" | "expiresAt">;
const fail = (status: number, code: string): never => { throw new HttpError(status, code, "成衣来源配置未确认，请核对原请求。"); };
const sha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : fail(400, "garment_target_invalid_request");
function exact(value: Record<string, unknown>, names: string) {
  if (Object.keys(value).sort().join(",") !== names.split(",").sort().join(",")) fail(400, "garment_target_invalid_request");
}
function iso(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
const freshnessValid = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 1000 && Number(value) <= 86400000;
function permitOf(value: unknown): GarmentCollectionPermit {
  const v = object(value); exact(v, "requestId,scopeHash,expiresAt");
  if (typeof v.requestId !== "string" || !identityUuid.test(v.requestId) || !sha(v.scopeHash) || !iso(v.expiresAt))
    return fail(400, "garment_target_invalid_permit");
  return { requestId: v.requestId.toLowerCase(), scopeHash: v.scopeHash, expiresAt: v.expiresAt };
}
function fresh(permit: GarmentCollectionPermit, now: number) {
  if (!Number.isFinite(now) || now < 0 || Date.parse(permit.expiresAt) <= now || Date.parse(permit.expiresAt) > now + 600000)
    fail(409, "garment_target_permit_expired");
}
export function parseGarmentTargetRequest(input: GarmentTargetRequest, now = Date.now()): Parsed {
  const request = structuredClone(input), v = object(request);
  if (v.action === "enable") {
    exact(v, "action,request,freshnessMs");
    if (!freshnessValid(v.freshnessMs)) return fail(400, "garment_target_freshness_required");
    const r = request as Extract<GarmentTargetRequest, { action: "enable" }>, proof = garmentCollectionProof(r.request, now);
    return { action: "enable", sourceKey: r.request.config.sourceKey, salesOrderId: r.request.salesOrderId.toLowerCase(),
      operatorUsername: r.request.config.operatorUsername, salesContractNo: proof.salesContractNo,
      desired: { accountFingerprint: proof.sourceFingerprint, verificationSha256: proof.verificationSha256, freshnessMs: v.freshnessMs } };
  }
  exact(v, "action,sourceKey,salesOrderId,operatorUsername");
  if (v.action !== "disable" || typeof v.sourceKey !== "string" || !sourceKeyValid(v.sourceKey)
    || typeof v.salesOrderId !== "string" || !identityUuid.test(v.salesOrderId) || typeof v.operatorUsername !== "string"
    || !/^[a-zA-Z0-9._-]{3,64}$/u.test(v.operatorUsername)) return fail(400, "garment_target_invalid_request");
  return { action: "disable", sourceKey: v.sourceKey, salesOrderId: v.salesOrderId.toLowerCase(),
    operatorUsername: v.operatorUsername, desired: null, salesContractNo: null };
}
async function available(client: PoolClient, action: "enable" | "disable" | "receipt") {
  const ready = (await client.query(`SELECT to_regclass('public.ainuoke_garment_target_commands') IS NOT NULL
    ${action !== "receipt" ? "AND to_regclass('public.ainuoke_garment_shipment_targets') IS NOT NULL" : ""}
    ${action === "enable" ? "AND to_regclass('public.ainuoke_garment_shipment_heads') IS NOT NULL" : ""} AS ready`)).rows[0].ready;
  if (!ready) fail(503, "garment_target_commands_unavailable");
}
async function actorFor(client: PoolClient, caller: TrustedIdentity, lock = false) {
  const actor = await readCurrentActor(client, caller, lock);
  for (const key of ["order.view", "ainuoke.view", "ainuoke.sync", "ainuoke.bind"] as const) requirePermission(actor.permissions, key);
  return actor;
}
async function scopeOf(pool: Pool, client: PoolClient, actor: TrustedIdentity, request: Parsed, lock: boolean): Promise<Scope> {
  let profile: Scope["profile"] = null, binding: Binding | null = null, generation: number | null = null;
  if (request.action === "enable") {
    profile = (await client.query<{ accountFingerprint: string; enabled: boolean }>(`SELECT account_fingerprint AS "accountFingerprint",enabled
      FROM ainuoke_source_profiles WHERE source_key=$1 ${lock ? "FOR SHARE" : ""}`, [request.sourceKey])).rows[0] ?? null;
    if (!profile?.enabled || profile.accountFingerprint !== request.desired!.accountFingerprint) fail(409, "garment_target_profile_mismatch");
  }
  const target = (await client.query<Target>(`SELECT account_fingerprint AS "accountFingerprint",enabled,verification_sha256 AS "verificationSha256",
    freshness_ms AS "freshnessMs",version FROM ainuoke_garment_shipment_targets WHERE source_key=$1 AND sales_order_id=$2 ${lock ? "FOR UPDATE" : ""}`,
  [request.sourceKey, request.salesOrderId])).rows[0] ?? null;
  if (request.action === "enable") {
    if (target && target.accountFingerprint !== request.desired!.accountFingerprint) fail(409, "garment_target_account_immutable");
    if (lock) await freezePhysicalOrderGroups(client, [request.salesOrderId]);
    const effective = lock ? await requireEffectiveOrderForWrite(client, request.salesOrderId) : await resolveEffectiveOrder(client, request.salesOrderId);
    if (effective.historicalDuplicate) fail(409, "garment_target_order_unavailable");
    const business = await requireVerifiedOrderBusiness(client, request.salesOrderId);
    if (business.businessType !== "ainuoke_contract") fail(409, "garment_target_not_applicable");
    const order = (await boundOrders(client, lock, [request.salesOrderId]))[0];
    if (!order || order.salesContractNo !== request.salesContractNo) return fail(409, "garment_target_binding_mismatch");
    binding = { sourceOwnerOrderId: order.sourceOwnerOrderId, sourceLinkId: order.sourceLinkId, attributionChangeId: order.attributionChangeId,
      attributionVersion: order.attributionVersion, orderVersion: order.version, salesContractNo: order.salesContractNo! };
    generation = (await client.query("SELECT generation FROM ainuoke_garment_shipment_heads WHERE source_key=$1 AND sales_order_id=$2",
      [request.sourceKey, request.salesOrderId])).rows[0]?.generation ?? 0;
  } else if (!(await client.query("SELECT id FROM sales_orders WHERE id=$1", [request.salesOrderId])).rowCount)
    fail(404, "garment_target_order_unavailable");
  return { schemaVersion: "ainuoke-garment-target-scope.v1", databaseFingerprint: await paymentDatabaseFingerprint(pool, client),
    actor: { internalUserId: actor.internalUserId, userId: actor.userId, username: actor.username },
    sourceKey: request.sourceKey, salesOrderId: request.salesOrderId, action: request.action, desired: request.desired, profile, target, binding, generation };
}
function scopeHash(scope: Scope, permit: PreviewPermit) { return hash({ scope, requestId: permit.requestId, expiresAt: permit.expiresAt }); }
function payloadHash(scope: Pick<Scope, "sourceKey" | "salesOrderId" | "action" | "desired" | "actor">, permit: GarmentCollectionPermit) {
  return hash({ schemaVersion: "ainuoke-garment-target-command.v1", sourceKey: scope.sourceKey, salesOrderId: scope.salesOrderId,
    action: scope.action, desired: scope.desired, operatorUsername: scope.actor.username, permit });
}
function outcomeOf(scope: Scope): Outcome {
  const before = scope.target, desired = scope.desired;
  const changed = scope.action === "disable" ? Boolean(before?.enabled)
    : !before || !before.enabled || before.verificationSha256 !== desired!.verificationSha256 || before.freshnessMs !== desired!.freshnessMs;
  const version = before ? before.version + (changed ? 1 : 0) : scope.action === "enable" ? 1 : 0;
  if (!Number.isSafeInteger(version) || version > 2147483647) return fail(422, "garment_target_version_limit");
  return { schemaVersion: "ainuoke-garment-target-outcome.v1", action: scope.action, enabled: scope.action === "enable", changed, version,
    sourceRead: "none", snapshotsPublished: 0 };
}
function checkTarget(value: unknown) {
  const target = object(value); exact(target, "accountFingerprint,enabled,verificationSha256,freshnessMs,version");
  if (!sha(target.accountFingerprint) || typeof target.enabled !== "boolean" || target.verificationSha256 !== null && !sha(target.verificationSha256)
    || !freshnessValid(target.freshnessMs) || !Number.isInteger(target.version) || Number(target.version) < 1 || Number(target.version) > 2147483647)
    throw Error();
}
function checkedStored(row: Stored, actor: TrustedIdentity, requestId: string) {
  try {
    const permit = permitOf({ requestId, scopeHash: row.scope_hash, expiresAt: row.expires_at.toISOString() }), scope = row.scope;
    exact(object(scope), "schemaVersion,databaseFingerprint,actor,sourceKey,salesOrderId,action,desired,profile,target,binding,generation");
    exact(object(scope.actor), "internalUserId,userId,username");
    if (scope.schemaVersion !== "ainuoke-garment-target-scope.v1" || !sha(scope.databaseFingerprint)
      || scope.actor.internalUserId !== actor.internalUserId || scope.actor.userId !== actor.userId || row.actor_id !== actor.internalUserId
      || typeof scope.actor.username !== "string" || scope.sourceKey !== row.source_key || !sourceKeyValid(scope.sourceKey)
      || scope.salesOrderId !== row.sales_order_id || !identityUuid.test(scope.salesOrderId) || scope.action !== row.action) throw Error();
    if (scope.target !== null) checkTarget(scope.target);
    if (scope.action === "enable") {
      exact(object(scope.desired), "accountFingerprint,verificationSha256,freshnessMs");
      exact(object(scope.profile), "accountFingerprint,enabled");
      exact(object(scope.binding), "sourceOwnerOrderId,sourceLinkId,attributionChangeId,attributionVersion,orderVersion,salesContractNo");
      if (!scope.desired || !sha(scope.desired.accountFingerprint) || !sha(scope.desired.verificationSha256) || !freshnessValid(scope.desired.freshnessMs)
        || scope.profile?.enabled !== true || scope.profile.accountFingerprint !== scope.desired.accountFingerprint || !scope.binding
        || scope.binding.sourceOwnerOrderId !== row.source_owner_order_id || !identityUuid.test(scope.binding.sourceOwnerOrderId)
        || !identityUuid.test(scope.binding.sourceLinkId) || scope.binding.attributionChangeId !== null && !identityUuid.test(scope.binding.attributionChangeId)
        || !Number.isSafeInteger(scope.binding.attributionVersion) || scope.binding.attributionVersion < 0
        || !Number.isSafeInteger(scope.binding.orderVersion) || scope.binding.orderVersion < 1 || typeof scope.binding.salesContractNo !== "string"
        || scope.binding.salesContractNo.trim().length < 1 || !Number.isSafeInteger(scope.generation) || Number(scope.generation) < 0
        || Number(scope.generation) > 2147483647 || scope.target && scope.target.accountFingerprint !== scope.desired.accountFingerprint) throw Error();
    } else if (scope.action !== "disable" || scope.desired !== null || scope.profile !== null || scope.binding !== null || scope.generation !== null
      || row.source_owner_order_id !== null) throw Error();
    if (!sha(row.payload_hash) || scopeHash(scope, permit) !== row.scope_hash || payloadHash(scope, permit) !== row.payload_hash
      || hash(row.result) !== hash(outcomeOf(scope))) throw Error();
    return row;
  } catch { return fail(503, "garment_target_receipt_integrity_failed"); }
}
async function lookup(client: PoolClient, actor: TrustedIdentity, requestId: string) {
  const row = (await client.query<Stored>(`SELECT actor_id::text,source_key,sales_order_id::text,source_owner_order_id::text,action,
    scope_hash,payload_hash,expires_at,scope,result FROM ainuoke_garment_target_commands WHERE actor_id=$1 AND request_id=$2`,
  [actor.internalUserId, requestId])).rows[0];
  return row ? checkedStored(row, actor, requestId) : undefined;
}
function receipt(requestId: string, stored: Stored, replayed = true) {
  return { schemaVersion: "ainuoke-garment-target-receipt.v1" as const, requestId, receiptState: "completed" as const,
    result: stored.result, replayed, receiptIsHistorical: replayed, sourceReadThisInvocation: "none" as const, automaticRetry: false as const };
}
async function readTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try { await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); const value = await fn(client); await client.query("COMMIT"); return value; }
  catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
}
export async function planGarmentTarget(pool: Pool, caller: TrustedIdentity, input: GarmentTargetRequest, permitInput: PreviewPermit, now = Date.now) {
  const identity = structuredClone(caller), request = parseGarmentTargetRequest(input, now()), permit = permitOf({ ...permitInput, scopeHash: "0".repeat(64) });
  fresh(permit, now());
  return readTransaction(pool, async client => {
    await available(client, request.action); const actor = await actorFor(client, identity);
    if (actor.username !== request.operatorUsername) fail(403, "garment_target_operator_mismatch");
    const scope = await scopeOf(pool, client, actor, request, false); fresh(permit, now());
    return { schemaVersion: "ainuoke-garment-target-plan.v1" as const, requestId: permit.requestId, expiresAt: permit.expiresAt,
      scopeHash: scopeHash(scope, permit), scope, proposed: outcomeOf(scope), sourceRead: "none" as const, databaseWrites: "none" as const,
      humanApproval: "still_required" as const };
  });
}
/** DB-only command, mounted only by the explicit protected-file operator action.
 * No HTTP/scheduler or real-target authorization is implied. No Source IO. */
export async function applyGarmentTarget(pool: Pool, caller: TrustedIdentity, input: GarmentTargetRequest,
  permitInput: GarmentCollectionPermit, now = Date.now) {
  const identity = structuredClone(caller), request = parseGarmentTargetRequest(input, now()), permit = permitOf(structuredClone(permitInput));
  const client = await pool.connect(); let committing = false;
  try {
    await client.query("BEGIN"); await client.query("SET LOCAL lock_timeout='5s'"); await lockEffectiveAttribution(client);
    await available(client, request.action); const actor = await actorFor(client, identity, true);
    if (actor.username !== request.operatorUsername) fail(403, "garment_target_operator_mismatch");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["garment-target-request:" + actor.internalUserId + ":" + permit.requestId]);
    const prior = await lookup(client, actor, permit.requestId);
    if (prior) {
      if (payloadHash({ ...request, actor: { internalUserId: actor.internalUserId, userId: actor.userId, username: actor.username } }, permit) !== prior.payload_hash)
        fail(409, "garment_target_request_conflict");
      await client.query("ROLLBACK"); return receipt(permit.requestId, prior);
    }
    fresh(permit, now());
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["garment-publication:" + request.sourceKey + ":" + request.salesOrderId]);
    const scope = await scopeOf(pool, client, actor, request, true);
    if (scopeHash(scope, permit) !== permit.scopeHash) fail(409, "garment_target_scope_changed");
    fresh(permit, now()); const result = outcomeOf(scope), before = scope.target;
    if (result.changed) {
      if (before) {
        const changed = await client.query(`UPDATE ainuoke_garment_shipment_targets SET enabled=$3,verification_sha256=$4,freshness_ms=$5,version=$6
          WHERE source_key=$1 AND sales_order_id=$2 AND version=$7`, [request.sourceKey, request.salesOrderId, result.enabled,
          request.desired?.verificationSha256 ?? before.verificationSha256, request.desired?.freshnessMs ?? before.freshnessMs, result.version, before.version]);
        if (changed.rowCount !== 1) fail(409, "garment_target_scope_changed");
      } else await client.query(`INSERT INTO ainuoke_garment_shipment_targets(source_key,sales_order_id,account_fingerprint,enabled,verification_sha256,freshness_ms)
        VALUES($1,$2,$3,true,$4,$5)`, [request.sourceKey, request.salesOrderId, request.desired!.accountFingerprint,
        request.desired!.verificationSha256, request.desired!.freshnessMs]);
    }
    await appendOperationLog(client, actor, { operationId: "garment-target-" + actor.internalUserId + "-" + permit.requestId, module: "艾诺科同步", action: "启停艾诺科成衣来源",
      entityType: "AinuokeGarmentTarget", entityId: request.salesOrderId, metadata: { sourceReportId: "6086979", requestId: permit.requestId,
        action: request.action, changed: result.changed, version: result.version, enabled: result.enabled, sourceOnly: true } });
    await client.query(`INSERT INTO ainuoke_garment_target_commands(actor_id,request_id,source_key,sales_order_id,source_owner_order_id,action,
      scope_hash,payload_hash,expires_at,scope,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [actor.internalUserId, permit.requestId,
      request.sourceKey, request.salesOrderId, scope.binding?.sourceOwnerOrderId ?? null, request.action, permit.scopeHash, payloadHash(scope, permit),
      permit.expiresAt, JSON.stringify(scope), JSON.stringify(result)]);
    fresh(permit, now()); committing = true; await client.query("COMMIT");
    return { schemaVersion: "ainuoke-garment-target-receipt.v1" as const, requestId: permit.requestId, receiptState: "completed" as const,
      result, replayed: false, receiptIsHistorical: false, sourceReadThisInvocation: "none" as const, automaticRetry: false as const };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (committing) return { schemaVersion: "ainuoke-garment-target-receipt.v1" as const, requestId: permit.requestId,
      receiptState: "unverified_commit" as const, result: null, sourceReadThisInvocation: "none" as const, automaticRetry: false as const };
    throw error;
  } finally { client.release(); }
}
export async function readGarmentTargetReceipt(pool: Pool, caller: TrustedIdentity, input: { sourceKey: string; salesOrderId: string; requestId: string }) {
  const identity = structuredClone(caller), request = structuredClone(input); exact(object(request), "sourceKey,salesOrderId,requestId");
  if (!sourceKeyValid(request.sourceKey) || !identityUuid.test(request.salesOrderId) || !identityUuid.test(request.requestId)) fail(400, "garment_target_invalid_request");
  return readTransaction(pool, async client => {
    await available(client, "receipt"); const actor = await actorFor(client, identity), stored = await lookup(client, actor, request.requestId.toLowerCase());
    if (!stored) return { schemaVersion: "ainuoke-garment-target-receipt.v1" as const, requestId: request.requestId.toLowerCase(),
      receiptState: "unknown" as const, result: null, sourceReadThisInvocation: "none" as const, automaticRetry: false as const };
    if (stored.source_key !== request.sourceKey || stored.sales_order_id !== request.salesOrderId.toLowerCase()) fail(409, "garment_target_request_conflict");
    return receipt(request.requestId.toLowerCase(), stored);
  });
}

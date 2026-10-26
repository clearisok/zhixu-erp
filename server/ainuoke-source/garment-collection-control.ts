import type { Pool, PoolClient } from "pg";
import type { TrustedIdentity } from "../auth/session.js";
import { readCurrentActor } from "../auth/current-actor.js";
import { requirePermission } from "../auth/permissions.js";
import { HttpError } from "../http/errors.js";
import { appendOperationLog } from "../operation-logs/repository.js";
import { identityUuid } from "../sales-orders/identity-model.js";
import { lockEffectiveAttribution, freezePhysicalOrderGroups } from "../sales-orders/effective-attribution.js";
import { hash, sourceKeyValid } from "./contract.js";
import type { CollectorConfig } from "./collector.js";
import { garmentFilterConfig, validateGarmentFilterEvidence, type GarmentFilterSelection } from "./garment-filter-evidence.js";
import { paymentDatabaseFingerprint } from "./payment-request-collection.js";
import { prepareGarmentPublicationInTransaction, publishGarmentObservationInTransaction, type GarmentPublicationContext } from "./garment-shipment-store.js";
import { collectGarmentObservationPages, validateGarmentCollectionResult, garmentCollectionFailureCounts,
  GARMENT_COLLECTION_LIMITS, GARMENT_COLLECTION_FAILURE_CODES, type GarmentRequestCounts } from "./garment-collection-worker.js";

export type GarmentCollectionRequest = { config: CollectorConfig; salesOrderId: string;
  verification: { selection: GarmentFilterSelection; evidence: unknown; checkedAt: string } };
export type GarmentCollectionPermit = { requestId: string; scopeHash: string; expiresAt: string };
type PermitPreview = Pick<GarmentCollectionPermit, "requestId" | "expiresAt">;
const fail = (status: number, code: string): never => { throw new HttpError(status, code, "成衣采集请求暂不可用，请核对原请求。"); };
const sha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const obj = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : fail(400, "garment_collection_invalid_request");
function exact(value: Record<string, unknown>, names: string) {
  if (Object.keys(value).sort().join(",") !== names.split(",").sort().join(",")) fail(400, "garment_collection_invalid_request");
}
function iso(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function permitOf(value: unknown): GarmentCollectionPermit {
  const v = obj(value); exact(v, "requestId,scopeHash,expiresAt");
  if (typeof v.requestId !== "string" || !identityUuid.test(v.requestId) || !sha(v.scopeHash) || !iso(v.expiresAt))
    fail(400, "garment_collection_invalid_permit");
  return { requestId: (v.requestId as string).toLowerCase(), scopeHash: v.scopeHash as string, expiresAt: v.expiresAt as string };
}
function fresh(permit: GarmentCollectionPermit, now: number) {
  if (!Number.isFinite(now) || now < 0 || Date.parse(permit.expiresAt) <= now || Date.parse(permit.expiresAt) > now + 600000)
    fail(409, "garment_collection_permit_expired");
}
function requestOf(input: GarmentCollectionRequest, now: number) {
  const request = structuredClone(input), v = obj(request); exact(v, "config,salesOrderId,verification");
  const verification = obj(v.verification); exact(verification, "selection,evidence,checkedAt");
  if (!Number.isFinite(now) || now < 0 || typeof request.salesOrderId !== "string" || !identityUuid.test(request.salesOrderId) || !iso(verification.checkedAt)
    || Date.parse(verification.checkedAt) > now || Buffer.byteLength(JSON.stringify(verification), "utf8") > 48 * 1024 * 1024)
    fail(400, "garment_collection_invalid_request");
  const config = garmentFilterConfig(request.config, request.verification.selection);
  const verified = validateGarmentFilterEvidence(request.verification.evidence, config, request.verification.selection, Date.parse(request.verification.checkedAt));
  if (verified.summary.result !== "SCOPED_FILTER_OBSERVED") fail(409, "garment_collection_filter_unverified");
  const proof = { schemaVersion: "ainuoke-garment-scoped-filter-proof.v1", sourceFingerprint: request.verification.selection.sourceFingerprint,
    salesContractNo: request.verification.selection.salesContractNo, reportId: "6086979", queryField: "ExpContractNo", compareType: "is",
    flowName: "[内层]", pageSize: 100, maxPages: 1, maxRows: 100, queryManifestSha256: verified.summary.queryManifestSha256,
    candidateSha256: verified.summary.candidateSha256, pageHashes: verified.summary.pageHashes };
  return { request: { ...request, config, salesOrderId: request.salesOrderId.toLowerCase() }, proof, proofHash: hash(proof) };
}

/** Reconstruct the scoped proof, not merely a nonempty target hash. A historic
 * first-page proof is never generalized to another contract/account or paging. */
export function garmentCollectionProof(input: GarmentCollectionRequest, now = Date.now()) {
  const parsed = requestOf(input, now); return { ...parsed.proof, verificationSha256: parsed.proofHash };
}
async function actorFor(client: PoolClient, identity: TrustedIdentity, lock: boolean) {
  const actor = await readCurrentActor(client, identity, lock);
  for (const key of ["order.view", "ainuoke.view", "ainuoke.sync"] as const) requirePermission(actor.permissions, key);
  return actor;
}
async function available(client: PoolClient) {
  if (!(await client.query("SELECT to_regclass('public.ainuoke_garment_collection_commands') IS NOT NULL AS ready")).rows[0].ready)
    fail(503, "garment_collection_commands_unavailable");
}
type Scope = { schemaVersion: "ainuoke-garment-collection-scope.v1"; databaseFingerprint: string; actor: { internalUserId: string; userId: string; username: string };
  context: GarmentPublicationContext; filterProofHash: string; limits: typeof GARMENT_COLLECTION_LIMITS };
function stableScope(scope: Scope) {
  const { preparedAt, ...context } = scope.context;
  if (!Number.isFinite(preparedAt) || preparedAt < 0) fail(409, "garment_capture_clock_invalid");
  return { ...scope, context };
}
function scopeHash(scope: Scope, permit: PermitPreview) { return hash({ ...stableScope(scope), requestId: permit.requestId, expiresAt: permit.expiresAt }); }
function payloadHash(parsed: ReturnType<typeof requestOf>, permit: GarmentCollectionPermit) {
  return commandHash({ sourceKey: parsed.request.config.sourceKey,
    salesOrderId: parsed.request.salesOrderId, proofHash: parsed.proofHash, operatorUsername: parsed.request.config.operatorUsername,
    sourceFingerprint: parsed.proof.sourceFingerprint, permit });
}
function commandHash(input: { sourceKey: string; salesOrderId: string; proofHash: string; operatorUsername: string;
  sourceFingerprint: string; permit: GarmentCollectionPermit }) {
  return hash({ schemaVersion: "ainuoke-garment-collection-command.v1", ...input });
}
async function prepare(client: PoolClient, pool: Pool, identity: TrustedIdentity, parsed: ReturnType<typeof requestOf>, now: number): Promise<Scope> {
  await available(client); const actor = await actorFor(client, identity, false);
  if (actor.username !== parsed.request.config.operatorUsername) fail(403, "garment_collection_operator_mismatch");
  const context = await prepareGarmentPublicationInTransaction(client, actor, parsed.request.config.sourceKey, parsed.request.salesOrderId, now);
  const target = (await client.query("SELECT verification_sha256 FROM ainuoke_garment_shipment_targets WHERE source_key=$1 AND sales_order_id=$2",
    [context.sourceKey, context.salesOrderId])).rows[0];
  if (target?.verification_sha256 !== parsed.proofHash || context.sourceFingerprint !== parsed.proof.sourceFingerprint
    || context.salesContractNo !== parsed.proof.salesContractNo) fail(409, "garment_collection_filter_scope_mismatch");
  return { schemaVersion: "ainuoke-garment-collection-scope.v1", databaseFingerprint: await paymentDatabaseFingerprint(pool, client),
    actor: { internalUserId: actor.internalUserId, userId: actor.userId, username: actor.username }, context,
    filterProofHash: parsed.proofHash, limits: GARMENT_COLLECTION_LIMITS };
}
async function readTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try { await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); const value = await fn(client); await client.query("COMMIT"); return value; }
  catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
}
export async function planGarmentCollection(pool: Pool, caller: TrustedIdentity, input: GarmentCollectionRequest,
  permitInput: PermitPreview, now = Date.now()) {
  const identity = structuredClone(caller), parsed = requestOf(input, now), permit = permitOf({ ...permitInput, scopeHash: "0".repeat(64) }); fresh(permit, now);
  const scope = await readTransaction(pool, client => prepare(client, pool, identity, parsed, now));
  return { schemaVersion: "ainuoke-garment-collection-plan.v1" as const, requestId: permit.requestId, expiresAt: permit.expiresAt,
    scopeHash: scopeHash(scope, permit), scope, sourceRead: "none" as const, databaseWrites: "none" as const, authorization: "not_granted_by_plan" as const };
}

type Outcome = { schemaVersion: "ainuoke-garment-collection-outcome.v1"; requestCounts: GarmentRequestCounts | "unknown";
  outcome: "published"; publicationId: string; snapshotId: string; generation: number } | {
  schemaVersion: "ainuoke-garment-collection-outcome.v1"; requestCounts: GarmentRequestCounts | "unknown";
  outcome: "not_published"; code: string };
type Stored = { source_key: string; sales_order_id: string; source_owner_order_id: string; publication_id: string | null; scope_hash: string; payload_hash: string; scope: Scope;
  expires_at: Date; state: "started" | "completed"; result: Outcome | null };
function checkedStored(row: Stored, actor: TrustedIdentity, requestId: string) {
  try {
    const permit = permitOf({ requestId, scopeHash: row.scope_hash, expiresAt: row.expires_at.toISOString() });
    if (row.scope.schemaVersion !== "ainuoke-garment-collection-scope.v1" || row.scope.actor.internalUserId !== actor.internalUserId
      || row.scope.actor.userId !== actor.userId || row.scope.context.sourceOwnerOrderId !== row.source_owner_order_id
      || row.scope.context.sourceKey !== row.source_key || row.scope.context.salesOrderId !== row.sales_order_id
      || scopeHash(row.scope, permit) !== row.scope_hash || commandHash({ sourceKey: row.source_key, salesOrderId: row.sales_order_id,
        proofHash: row.scope.filterProofHash, operatorUsername: row.scope.actor.username, sourceFingerprint: row.scope.context.sourceFingerprint, permit }) !== row.payload_hash)
      throw Error();
    if (row.state === "started") { if (row.result !== null || row.publication_id !== null) throw Error(); return row; }
    if (row.state !== "completed") throw Error();
    const result = obj(row.result);
    exact(result, result.outcome === "published" ? "schemaVersion,requestCounts,outcome,publicationId,snapshotId,generation" : "schemaVersion,requestCounts,outcome,code");
    if (result.schemaVersion !== "ainuoke-garment-collection-outcome.v1") throw Error();
    if (result.requestCounts !== "unknown") {
      const counts = obj(result.requestCounts); exact(counts, "httpAttempts,reportRequests");
      if (!Number.isInteger(counts.httpAttempts) || !Number.isInteger(counts.reportRequests) || Number(counts.httpAttempts) < 0 || Number(counts.httpAttempts) > 3
        || Number(counts.reportRequests) < 0 || Number(counts.reportRequests) > 2
        || !(counts.httpAttempts === 0 && counts.reportRequests === 0 || counts.httpAttempts === Number(counts.reportRequests) + 1)) throw Error();
    }
    if (result.outcome === "published") {
      if (typeof result.publicationId !== "string" || !identityUuid.test(result.publicationId) || result.publicationId !== row.publication_id || !sha(result.snapshotId)
        || !Number.isSafeInteger(result.generation) || Number(result.generation) < 1 || Number(result.generation) > 2147483647
        || result.requestCounts === "unknown" || (result.requestCounts as GarmentRequestCounts).httpAttempts !== 3
        || (result.requestCounts as GarmentRequestCounts).reportRequests !== 2) throw Error();
    } else if (result.outcome !== "not_published" || row.publication_id !== null || typeof result.code !== "string"
      || !staticCodes.has(result.code) && !GARMENT_COLLECTION_FAILURE_CODES.includes(result.code) && result.code !== "garment_collection_not_published") throw Error();
    return row;
  } catch { return fail(503, "garment_collection_receipt_integrity_failed"); }
}
async function lookup(client: PoolClient, actor: TrustedIdentity, requestId: string, lock = false): Promise<Stored | undefined> {
  const row = (await client.query<Stored>(`SELECT source_key,sales_order_id::text,source_owner_order_id::text,publication_id::text,scope_hash,payload_hash,scope,expires_at,state,result FROM ainuoke_garment_collection_commands
    WHERE actor_id=$1 AND request_id=$2 ${lock ? "FOR UPDATE" : ""}`, [actor.internalUserId, requestId])).rows[0];
  return row ? checkedStored(row, actor, requestId) : undefined;
}
function same(stored: Stored, parsed: ReturnType<typeof requestOf>, permit: GarmentCollectionPermit) {
  if (stored.source_key !== parsed.request.config.sourceKey || stored.sales_order_id !== parsed.request.salesOrderId
    || stored.scope_hash !== permit.scopeHash || stored.payload_hash !== payloadHash(parsed, permit)) fail(409, "garment_collection_request_conflict");
}
function receipt(requestId: string, stored: Stored) {
  return { schemaVersion: "ainuoke-garment-collection-receipt.v1" as const, requestId,
    receiptState: stored.state === "completed" ? "completed" as const : "unverified_started" as const,
    result: stored.result, replayed: true, receiptIsHistorical: true, sourceReadThisInvocation: "none" as const, automaticRetry: false as const };
}
export async function readGarmentCollectionReceipt(pool: Pool, caller: TrustedIdentity,
  input: { sourceKey: string; salesOrderId: string; requestId: string }) {
  const identity = structuredClone(caller), request = structuredClone(input); exact(obj(request), "sourceKey,salesOrderId,requestId");
  if (!sourceKeyValid(request.sourceKey) || !identityUuid.test(request.salesOrderId) || !identityUuid.test(request.requestId))
    fail(400, "garment_collection_invalid_request");
  return readTransaction(pool, async client => {
    await available(client); const actor = await actorFor(client, identity, false), stored = await lookup(client, actor, request.requestId);
    if (!stored) return { schemaVersion: "ainuoke-garment-collection-receipt.v1" as const, requestId: request.requestId,
      receiptState: "unknown" as const, result: null, sourceReadThisInvocation: "none" as const, automaticRetry: false as const };
    if (stored.source_key !== request.sourceKey || stored.sales_order_id !== request.salesOrderId.toLowerCase()) fail(409, "garment_collection_request_conflict");
    return receipt(request.requestId, stored);
  });
}
const staticCodes = new Set(["authentication_required", "permission_denied", "garment_collection_operator_mismatch", "garment_collection_filter_scope_mismatch",
  "garment_collection_scope_changed", "garment_collection_permit_expired", "garment_source_not_connected", "garment_source_not_applicable",
  "garment_binding_changed", "garment_binding_unavailable", "garment_generation_conflict", "garment_generation_limit", "garment_order_not_available",
  "garment_capture_precedes_scope", "garment_capture_expired", "garment_observation_regressed", "garment_observation_storage_limit"]);
function safeCode(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  return typeof code === "string" && (staticCodes.has(code) || garmentCollectionFailureCounts(error) !== null)
    ? code : "garment_collection_not_published";
}
async function requestLock(client: PoolClient, actor: TrustedIdentity, permit: GarmentCollectionPermit) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["garment-collection:" + actor.internalUserId + ":" + permit.requestId]);
}
async function finish(client: PoolClient, actor: TrustedIdentity, parsed: ReturnType<typeof requestOf>, permit: GarmentCollectionPermit, result: Outcome) {
  const changed = await client.query(`UPDATE ainuoke_garment_collection_commands SET state='completed',result=$6::jsonb,publication_id=$7,completed_at=clock_timestamp()
    WHERE actor_id=$1 AND request_id=$2 AND scope_hash=$3 AND payload_hash=$4 AND source_key=$5 AND state='started'`,
  [actor.internalUserId, permit.requestId, permit.scopeHash, payloadHash(parsed, permit), parsed.request.config.sourceKey,
    JSON.stringify(result), result.outcome === "published" ? result.publicationId : null]);
  if (changed.rowCount !== 1) fail(409, "garment_collection_receipt_conflict");
  await appendOperationLog(client, actor, { module: "艾诺科同步", action: "采集艾诺科来源", entityType: "AinuokeSourceRun", entityId: permit.requestId,
    afterData: { values: { salesOrderId: parsed.request.salesOrderId, outcome: result.outcome } },
    metadata: { sourceReportId: "6086979", requestId: permit.requestId, sourceOnly: true, outcome: result.outcome } });
}

/** Durable one-shot command. It is not mounted in HTTP/CLI/schedulers. A started
 * receipt is never reclaimed; unknown results are reconciled by the original
 * actor/request. No transaction or database lock spans the worker invocation. */
export async function collectGarmentOnce(pool: Pool, caller: TrustedIdentity, input: GarmentCollectionRequest,
  permitInput: GarmentCollectionPermit, options: { now?: () => number;
    collect?: typeof collectGarmentObservationPages } = {}) {
  const identity = structuredClone(caller), now = options.now ?? Date.now, parsed = requestOf(input, now()), permit = permitOf(structuredClone(permitInput));
  const existing = await readTransaction(pool, async client => { await available(client); const actor = await actorFor(client, identity, false);
    return lookup(client, actor, permit.requestId); });
  if (existing) { same(existing, parsed, permit); return receipt(permit.requestId, existing); }
  fresh(permit, now());
  let scope: Scope, actor: TrustedIdentity, claiming = false;
  const claim = await pool.connect();
  try {
    await claim.query("BEGIN"); await claim.query("SET LOCAL lock_timeout='5s'"); await lockEffectiveAttribution(claim);
    actor = await actorFor(claim, identity, true); await requestLock(claim, actor, permit);
    const prior = await lookup(claim, actor, permit.requestId, true);
    if (prior) { same(prior, parsed, permit); await claim.query("ROLLBACK"); return receipt(permit.requestId, prior); }
    await claim.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["garment-publication:" + parsed.request.config.sourceKey + ":" + parsed.request.salesOrderId]);
    await claim.query("SELECT p.source_key FROM ainuoke_source_profiles p JOIN ainuoke_garment_shipment_targets t ON t.source_key=p.source_key WHERE p.source_key=$1 AND t.sales_order_id=$2 FOR SHARE OF p,t",
      [parsed.request.config.sourceKey, parsed.request.salesOrderId]);
    await freezePhysicalOrderGroups(claim, [parsed.request.salesOrderId]);
    fresh(permit, now()); scope = await prepare(claim, pool, actor, parsed, now());
    if (scopeHash(scope, permit) !== permit.scopeHash) fail(409, "garment_collection_scope_changed");
    await claim.query(`INSERT INTO ainuoke_garment_collection_commands(actor_id,request_id,source_key,sales_order_id,source_owner_order_id,scope_hash,payload_hash,scope,expires_at,state)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'started')`, [actor.internalUserId, permit.requestId, scope.context.sourceKey, scope.context.salesOrderId,
      scope.context.sourceOwnerOrderId, permit.scopeHash, payloadHash(parsed, permit), JSON.stringify(scope), permit.expiresAt]);
    claiming = true; await claim.query("COMMIT");
  } catch (error) {
    await claim.query("ROLLBACK").catch(() => undefined);
    if (claiming) return { schemaVersion: "ainuoke-garment-collection-receipt.v1" as const, requestId: permit.requestId,
      receiptState: "unverified_claim" as const, result: null, sourceReadThisInvocation: "none" as const, automaticRetry: false as const };
    throw error;
  } finally { claim.release(); }

  let result: Outcome | undefined, counts: GarmentRequestCounts | "unknown" = { httpAttempts: 0, reportRequests: 0 }, collected: ReturnType<typeof validateGarmentCollectionResult> | undefined;
  try {
    fresh(permit, now());
    const current = await readTransaction(pool, client => prepare(client, pool, identity, parsed, now()));
    if (scopeHash(current, permit) !== permit.scopeHash) fail(409, "garment_collection_scope_changed");
    fresh(permit, now());
    counts = "unknown";
    const raw = await (options.collect ?? collectGarmentObservationPages)(parsed.request.config,
      { sourceFingerprint: scope.context.sourceFingerprint, salesContractNo: scope.context.salesContractNo });
    collected = validateGarmentCollectionResult(raw, parsed.request.config,
      { sourceFingerprint: scope.context.sourceFingerprint, salesContractNo: scope.context.salesContractNo }, now());
    counts = collected.counts;
  } catch (error) { counts = garmentCollectionFailureCounts(error) ?? counts;
    result = { schemaVersion: "ainuoke-garment-collection-outcome.v1", outcome: "not_published", code: safeCode(error), requestCounts: counts }; }

  let finishClient: PoolClient | undefined, committing = false;
  try {
    finishClient = await pool.connect(); await finishClient.query("BEGIN"); await finishClient.query("SET LOCAL lock_timeout='5s'");
    // Keep the publication's effective-fence -> fresh actor -> target lock order.
    if (!result) {
      await lockEffectiveAttribution(finishClient); actor = await actorFor(finishClient, identity, true);
    }
    await requestLock(finishClient, actor, permit);
    if (!result) {
      const publication = await publishGarmentObservationInTransaction(finishClient, actor, scope.context, collected!.input, collected!.scope, now());
      result = { schemaVersion: "ainuoke-garment-collection-outcome.v1", outcome: "published", requestCounts: counts,
        publicationId: publication.publicationId, snapshotId: publication.snapshotId, generation: publication.generation };
    }
    await finish(finishClient, actor, parsed, permit, result); committing = true; await finishClient.query("COMMIT");
    return { schemaVersion: "ainuoke-garment-collection-receipt.v1" as const, requestId: permit.requestId, receiptState: "completed" as const,
      result, replayed: false, receiptIsHistorical: false, sourceReadThisInvocation: "see_result" as const, automaticRetry: false as const };
  } catch (error) {
    const rolledBack = await finishClient?.query("ROLLBACK").then(() => true, () => false);
    const publicationRollbackConfirmed = !committing && rolledBack === true;
    if (publicationRollbackConfirmed) {
      // Publication and its audit were rolled back. Persist a small terminal
      // failure in a new transaction; this does not need the withdrawn domain
      // grant to write business data, and never retries the worker/publication.
      try {
        await finishClient!.query("BEGIN"); await finishClient!.query("SET LOCAL lock_timeout='5s'");
        await requestLock(finishClient!, actor, permit);
        const failure: Outcome = { schemaVersion: "ainuoke-garment-collection-outcome.v1", outcome: "not_published",
          code: safeCode(error), requestCounts: counts };
        result = failure;
        await finish(finishClient!, actor, parsed, permit, failure);
        committing = true; await finishClient!.query("COMMIT");
        return { schemaVersion: "ainuoke-garment-collection-receipt.v1" as const, requestId: permit.requestId,
          receiptState: "completed" as const, result: failure, replayed: false, receiptIsHistorical: false,
          sourceReadThisInvocation: "see_result" as const, automaticRetry: false as const };
      } catch { await finishClient!.query("ROLLBACK").catch(() => undefined); }
    }
    // A missing terminal receipt is not permission to collect or publish again.
    return { schemaVersion: "ainuoke-garment-collection-receipt.v1" as const, requestId: permit.requestId,
      receiptState: committing ? "unverified_commit" as const : "unverified_started" as const,
      result: committing ? result ?? null : null, code: committing ? "garment_collection_commit_unverified" : safeCode(error),
      publicationRolledBack: publicationRollbackConfirmed, requestCounts: counts,
      sourceReadThisInvocation: "see_result" as const, automaticRetry: false as const };
  } finally { finishClient?.release(); }
}

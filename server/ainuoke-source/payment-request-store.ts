import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { HttpError } from '../http/errors.js';
import { appendOperationLog } from '../operation-logs/repository.js';
import { UUID_PATTERN } from '../sales-orders/delivery-plan-model.js';
import { sourceActor, boundOrders, type BoundSourceOrder } from './service.js';
import { hash, sourceKeyValid } from './contract.js';
import { buildPaymentContractSnapshot, paymentSnapshotFreshness, type PaymentSnapshotScope } from './payment-request-snapshot.js';

type Identity = Pick<TrustedIdentity, 'internalUserId' | 'userId'>;
type Target = { account_fingerprint: string; version: number; enabled: boolean; verification_sha256: string | null; profile_fingerprint: string; profile_enabled: boolean };
export type PaymentPublicationContext = {
  sourceKey: string; salesOrderId: string; sourceFingerprint: string; salesContractNo: string; targetVersion: number;
  sourceOwnerOrderId: string; sourceLinkId: string; attributionChangeId: string | null; attributionVersion: number;
  generation: number; preparedAt: number;
};
type Stored = { id: string; generation: number; account_fingerprint: string; target_version: number;
  source_owner_order_id: string; source_link_id: string; attribution_change_id: string | null; attribution_version: number;
  input: unknown; scope: PaymentSnapshotScope; payload: ReturnType<typeof buildPaymentContractSnapshot>; content_hash: string };
function error(status: number, code: string): never { throw new HttpError(status, code, '艾诺科货款申请来源暂不可用。'); }
function identifiers(sourceKey: string, id: string) {
  if (!sourceKeyValid(sourceKey) || !UUID_PATTERN.test(id)) error(400, 'invalid_payment_source_request');
}
async function targetFor(client: PoolClient, sourceKey: string, id: string, lock: boolean) {
  return (await client.query<Target>(`SELECT t.account_fingerprint,t.version,t.enabled,t.verification_sha256,
    p.account_fingerprint AS profile_fingerprint,p.enabled AS profile_enabled
    FROM ainuoke_payment_source_targets t JOIN ainuoke_source_profiles p ON p.source_key=t.source_key
    WHERE t.source_key=$1 AND t.sales_order_id=$2::uuid ${lock ? 'FOR SHARE OF t,p' : ''}`, [sourceKey, id])).rows[0];
}
const enabled = (target: Target | undefined): target is Target => Boolean(target?.enabled && target.profile_enabled
  && target.verification_sha256 && target.account_fingerprint === target.profile_fingerprint);
function contextOf(sourceKey: string, order: BoundSourceOrder, target: Target, generation: number, preparedAt: number): PaymentPublicationContext {
  return { sourceKey, salesOrderId: order.id, sourceFingerprint: target.account_fingerprint, salesContractNo: order.salesContractNo!,
    targetVersion: target.version, sourceOwnerOrderId: order.sourceOwnerOrderId, sourceLinkId: order.sourceLinkId,
    attributionChangeId: order.attributionChangeId, attributionVersion: order.attributionVersion, generation, preparedAt };
}
const fields = `s.id::text,h.generation,s.account_fingerprint,s.target_version,s.source_owner_order_id::text,s.source_link_id::text,
  s.attribution_change_id::text,s.attribution_version,s.input,s.scope,s.payload,s.content_hash`;
async function headFor(client: PoolClient, sourceKey: string, id: string) {
  return (await client.query<Stored>(`SELECT ${fields} FROM ainuoke_payment_heads h
    JOIN ainuoke_payment_snapshots s ON s.id=h.snapshot_id AND s.source_key=h.source_key AND s.sales_order_id=h.sales_order_id
    WHERE h.source_key=$1 AND h.sales_order_id=$2::uuid`, [sourceKey, id])).rows[0];
}
function bindingMatches(stored: Stored, context: PaymentPublicationContext) {
  return stored.account_fingerprint === context.sourceFingerprint && stored.target_version === context.targetVersion
    && stored.source_owner_order_id === context.sourceOwnerOrderId && stored.source_link_id === context.sourceLinkId
    && stored.attribution_change_id === context.attributionChangeId && stored.attribution_version === context.attributionVersion;
}
function verifyStored(current: Stored, context: PaymentPublicationContext) {
  try {
    const rebuilt = buildPaymentContractSnapshot(current.input, current.scope, Date.parse(current.payload.observedThrough));
    if (hash(rebuilt) !== current.content_hash || hash(current.payload) !== current.content_hash
      || rebuilt.sourceFingerprint !== context.sourceFingerprint || rebuilt.salesContractNo !== context.salesContractNo)
      error(503, 'payment_snapshot_integrity_failed');
    return rebuilt;
  } catch { return error(503, 'payment_snapshot_integrity_failed'); }
}
async function transaction<T>(pool: Pool, readOnly: boolean, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
    const result = await action(client); await client.query('COMMIT'); return result;
  } catch (cause) { await client.query('ROLLBACK'); throw cause; } finally { client.release(); }
}

/** Internal pre-collection scope. No HTTP writer/activation/collection is exposed. */
export async function preparePaymentPublication(pool: Pool, identity: Identity, sourceKey: string, salesOrderId: string, now = Date.now()) {
  identifiers(sourceKey, salesOrderId);
  if (!Number.isFinite(now) || now < 0) error(503, 'payment_capture_clock_invalid');
  return transaction(pool, true, async client => {
    await sourceActor(client, identity, true, false);
    const order = (await boundOrders(client)).find(row => row.id === salesOrderId);
    if (!order) error(404, 'payment_order_not_available');
    const target = await targetFor(client, sourceKey, salesOrderId, false);
    if (!enabled(target)) error(503, 'payment_source_not_connected');
    const current = await headFor(client, sourceKey, salesOrderId);
    return contextOf(sourceKey, order, target, current?.generation ?? 0, now);
  });
}

/** Server-only checked-page publication. Never accepts a caller-built projection,
 * raw SQL, account credentials or permissions; rechecks all DB scope after collection. */
export async function publishPaymentSnapshot(pool: Pool, caller: Identity, requestedContext: PaymentPublicationContext,
  input: unknown, scope: PaymentSnapshotScope, now = Date.now()) {
  const identity = { internalUserId: caller.internalUserId, userId: caller.userId };
  const context = structuredClone(requestedContext), checkedInput = structuredClone(input), checkedScope = structuredClone(scope);
  identifiers(context.sourceKey, context.salesOrderId);
  const snapshot = buildPaymentContractSnapshot(checkedInput, checkedScope, now);
  const inputText = JSON.stringify(checkedInput), scopeText = JSON.stringify(checkedScope);
  if (!Number.isFinite(context.preparedAt) || context.preparedAt < 0 || context.preparedAt > now
    || Date.parse(snapshot.observedFrom) < context.preparedAt) error(409, 'payment_capture_precedes_scope');
  return transaction(pool, false, async client => {
    const actor = await sourceActor(client, identity, true);
    await client.query('SELECT lock_order_attribution_write_guard()');
    // Serialize only this target. Different orders can publish independently.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['ainuoke-payment:' + context.sourceKey + ':' + context.salesOrderId]);
    const target = await targetFor(client, context.sourceKey, context.salesOrderId, true);
    if (!enabled(target)) error(503, 'payment_source_not_connected');
    const order = (await boundOrders(client, true)).find(row => row.id === context.salesOrderId);
    if (!order) error(409, 'payment_binding_changed');
    const current = await headFor(client, context.sourceKey, context.salesOrderId);
    const actual = contextOf(context.sourceKey, order, target, context.generation, context.preparedAt);
    if (hash(actual) !== hash(context) || snapshot.sourceFingerprint !== actual.sourceFingerprint
      || snapshot.salesContractNo !== actual.salesContractNo) error(409, 'payment_binding_changed');
    if (current && bindingMatches(current, actual)) verifyStored(current, actual);
    if (current && bindingMatches(current, actual) && current.content_hash === hash(snapshot))
      return { publicationId: current.id, snapshotId: snapshot.snapshotId, generation: current.generation, alreadyPublished: true };
    if ((current?.generation ?? 0) !== context.generation) error(409, 'payment_generation_conflict');
    if (current && (Date.parse(snapshot.observedFrom) < Date.parse(current.payload.observedFrom)
      || Date.parse(snapshot.observedThrough) < Date.parse(current.payload.observedThrough))) error(409, 'payment_observation_regressed');
    const publicationId = randomUUID(), generation = context.generation + 1;
    await client.query(`INSERT INTO ainuoke_payment_snapshots(id,source_key,sales_order_id,account_fingerprint,target_version,
      source_owner_order_id,source_link_id,attribution_change_id,attribution_version,sales_contract_no,snapshot_id,
      observed_from,observed_through,expires_at,input,scope,payload,content_hash,actor_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17::jsonb,$18,$19)`,
    [publicationId,actual.sourceKey,actual.salesOrderId,actual.sourceFingerprint,actual.targetVersion,actual.sourceOwnerOrderId,
      actual.sourceLinkId,actual.attributionChangeId,actual.attributionVersion,actual.salesContractNo,snapshot.snapshotId,
      snapshot.observedFrom,snapshot.observedThrough,snapshot.expiresAt,inputText,scopeText,JSON.stringify(snapshot),hash(snapshot),actor.internalUserId]);
    if (current) {
      const updated = await client.query(`UPDATE ainuoke_payment_heads SET snapshot_id=$3,generation=$4
        WHERE source_key=$1 AND sales_order_id=$2 AND generation=$5`,
      [actual.sourceKey,actual.salesOrderId,publicationId,generation,current.generation]);
      if (updated.rowCount !== 1) error(409, 'payment_generation_conflict');
    } else await client.query('INSERT INTO ainuoke_payment_heads(source_key,sales_order_id,snapshot_id,generation) VALUES($1,$2,$3,$4)',
      [actual.sourceKey,actual.salesOrderId,publicationId,generation]);
    await appendOperationLog(client, actor, { module: '艾诺科同步', action: '采集艾诺科来源', entityType: 'AinuokeSourceRun', entityId: publicationId,
      metadata: { sourceReportId: '6086941', publicationId, snapshotId: snapshot.snapshotId, generation, rowCount: snapshot.rows.length, sourceOnly: true } });
    return { publicationId, snapshotId: snapshot.snapshotId, generation, alreadyPublished: false };
  });
}

export type PaymentSnapshotReader = ReturnType<typeof createPaymentSnapshotReader>;
/** GET is DB-only: no credentials, Bridge/HTTP, Browser fallback, CCT or quote reads. */
export function createPaymentSnapshotReader(pool: Pool, config: { sourceKey: string }, now: () => number = Date.now) {
  if (!sourceKeyValid(config.sourceKey)) error(400, 'invalid_payment_source_configuration');
  const sourceKey = config.sourceKey;
  return async (identity: Identity, salesOrderId: string) => {
    identifiers(sourceKey, salesOrderId);
    return transaction(pool, true, async client => {
      await sourceActor(client, identity, false, false);
      const row = (await client.query<{ processing: boolean; effective_order_id: string }>(`SELECT
        COALESCE(i.business_type='processing',false) AS processing,e.effective_order_id::text
        FROM sales_orders o JOIN sales_order_effective_identities e ON e.original_order_id=o.id
        LEFT JOIN sales_order_identity_profiles i ON i.sales_order_id=o.id WHERE o.id=$1::uuid`, [salesOrderId])).rows[0];
      if (!row || row.effective_order_id !== salesOrderId) error(404, 'payment_order_not_available');
      const empty = (sourceStatus: 'not_applicable' | 'not_connected' | 'not_captured' | 'identity_changed' | 'stale') => ({
        salesOrderId, sourceReportId: '6086941' as const, sourceStatus, rows: [], bankPaymentStatus: 'not_inferred' as const,
      });
      if (row.processing) return empty('not_applicable');
      const order = (await boundOrders(client)).find(candidate => candidate.id === salesOrderId);
      if (!order) return empty('not_connected');
      const target = await targetFor(client, sourceKey, salesOrderId, false);
      if (!enabled(target)) return empty('not_connected');
      const current = await headFor(client, sourceKey, salesOrderId);
      if (!current) return empty('not_captured');
      const context = contextOf(sourceKey, order, target, current.generation, now());
      if (!bindingMatches(current, context)) return empty('identity_changed');
      try {
        // Rebuild with the original observation time, then evaluate current age.
        // JSONB property ordering must never substitute for content verification.
        const rebuilt = verifyStored(current, context);
        if (!paymentSnapshotFreshness(rebuilt, { sourceFingerprint: context.sourceFingerprint, salesContractNo: context.salesContractNo }, now()).readable)
          return empty('stale');
        return { salesOrderId, sourceReportId: '6086941' as const, sourceStatus: 'observed' as const,
          snapshotId: rebuilt.snapshotId, generation: current.generation, observedFrom: rebuilt.observedFrom,
          observedThrough: rebuilt.observedThrough, expiresAt: rebuilt.expiresAt, completeness: rebuilt.completeness,
          rows: rebuilt.rows, aggregation: rebuilt.aggregation, bankPaymentStatus: rebuilt.bankPaymentStatus,
          mappingVerified: rebuilt.mappingVerified, consistency: 'as_of_observed_time_not_live' as const };
      } catch { return error(503, 'payment_snapshot_integrity_failed'); }
    });
  };
}

export function paymentReadConfig(values: Readonly<Record<string, string | undefined>>, identityMode: string) {
  if ((values.ZHIXU_AINUOKE_PAYMENT_READ ?? 'disabled') === 'disabled') return null;
  const sourceKey = values.ZHIXU_AINUOKE_SOURCE_KEY ?? '';
  if (values.ZHIXU_AINUOKE_PAYMENT_READ !== 'snapshot' || identityMode !== 'session' || !sourceKeyValid(sourceKey))
    error(400, 'invalid_payment_source_configuration');
  return { sourceKey };
}

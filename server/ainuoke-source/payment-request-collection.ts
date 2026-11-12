import {withSyncAudit} from './sync-audit.js';
import type { Pool, PoolClient } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { UUID_PATTERN } from '../sales-orders/delivery-plan-model.js';
import { hash, SourceError } from './contract.js';
import { type CollectorConfig } from './collector.js';
import { collectPaymentContracts, configForSelection, CONTRACT_FAILURE_CODES, CONTRACT_LIMITS,
  paymentContractSnapshotInputs, type ContractSelection } from './payment-request-contract-probe.js';
import { buildPaymentContractSnapshot } from './payment-request-snapshot.js';
import { preparePaymentPublication, publishPaymentSnapshot, type PaymentPublicationContext } from './payment-request-store.js';
import { sourceActor } from './service.js';

type Identity = Pick<TrustedIdentity, 'internalUserId' | 'userId'>;
export type PaymentCollectionTarget = { alias: string; salesOrderId: string };
export type PaymentCollectionRequest = { config: CollectorConfig; selection: ContractSelection; targets: readonly PaymentCollectionTarget[] };
type Plan = Awaited<ReturnType<typeof prepare>>;
const fail = (code: string): never => { throw new SourceError(code); };
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);

export function parsePaymentCollectionRequest(input: PaymentCollectionRequest): PaymentCollectionRequest {
  const value = structuredClone(input);
  if (!value || Object.keys(value).sort().join(',') !== 'config,selection,targets') fail('payment_collection_invalid_request');
  value.config = configForSelection(value.config, value.selection);
  if (!Array.isArray(value.targets) || value.targets.length !== 2) fail('payment_collection_invalid_targets');
  value.targets = value.targets.map((target, index) => {
    if (!target || Object.keys(target).sort().join(',') !== 'alias,salesOrderId' || target.alias !== 'S' + (index + 1)
      || typeof target.salesOrderId !== 'string' || !UUID_PATTERN.test(target.salesOrderId)) fail('payment_collection_invalid_targets');
    return { alias: target.alias, salesOrderId: target.salesOrderId.toLowerCase() };
  });
  if (value.targets[0].salesOrderId === value.targets[1].salesOrderId) fail('payment_collection_invalid_targets');
  return value;
}
function fixedContext(context: PaymentPublicationContext) {
  const { preparedAt, ...fixed } = context;
  if (!Number.isFinite(preparedAt) || preparedAt < 0) fail('payment_capture_clock_invalid');
  return fixed;
}
export async function paymentDatabaseFingerprint(pool: Pool, connection: Pool|PoolClient = pool) {
  const database = (await connection.query(`SELECT current_database() AS database,current_user AS db_user,
    inet_server_addr()::text AS address,inet_server_port() AS port`)).rows[0];
  let connectionHost = pool.options.host ?? null, connectionPort: string | number | null = pool.options.port ?? null;
  if (pool.options.connectionString) {
    const uri = new URL(pool.options.connectionString);
    connectionHost = uri.hostname; connectionPort = uri.port || '5432';
  }
  return hash({ database, connectionHost, connectionPort });
}
async function prepare(pool: Pool, identity: Identity, request: PaymentCollectionRequest, now: () => number) {
  const actor = await sourceActor(pool, identity, true, false);
  if (actor.username !== request.config.operatorUsername) fail('payment_collection_operator_mismatch');
  const contexts: PaymentPublicationContext[] = [];
  for (const [index, target] of request.targets.entries()) {
    const context = await preparePaymentPublication(pool, identity, request.config.sourceKey, target.salesOrderId, now());
    if (context.sourceFingerprint !== request.selection.sourceFingerprint
      || context.salesContractNo !== request.selection.targets[index].salesContractNo) fail('payment_collection_binding_mismatch');
    contexts.push(context);
  }
  const databaseFingerprint = await paymentDatabaseFingerprint(pool);
  const scopeHash = hash({ schemaVersion: 'ainuoke-payment-collection-scope.v1', reportId: '6086941',
    databaseFingerprint, actor: identity, operatorUsername: request.config.operatorUsername,
    selection: request.selection, targets: request.targets, contexts: contexts.map(fixedContext), limits: CONTRACT_LIMITS });
  return { databaseFingerprint, scopeHash, contexts };
}

/** Internal, DB-read-only range preview. Neither this hash nor enabled targets
 * replace human authorization. No account, schema, target or source is changed. */
export async function planPaymentCollection(pool: Pool, caller: Identity, input: PaymentCollectionRequest, now: () => number = Date.now) {
  const identity = { internalUserId: caller.internalUserId, userId: caller.userId }, request = parsePaymentCollectionRequest(input);
  const plan = await prepare(pool, identity, request, now);
  return { schemaVersion: 'ainuoke-payment-collection-plan.v1' as const, scopeHash: plan.scopeHash,
    databaseFingerprint: plan.databaseFingerprint, sourceKey: request.config.sourceKey,
    sourceFingerprint: request.selection.sourceFingerprint, reportId: '6086941' as const,
    targets: plan.contexts.map((context, index) => ({ alias: request.targets[index].alias, ...fixedContext(context) })),
    limits: CONTRACT_LIMITS, sourceRead: 'none' as const, databaseWrites: 'none' as const, authorization: 'not_granted_by_plan' as const };
}

const publicationCodes = new Set(['permission_denied', 'source_actor_unavailable', 'payment_source_not_connected',
  'payment_order_not_available', 'payment_binding_changed', 'payment_generation_conflict', 'payment_observation_regressed',
  'payment_capture_precedes_scope', 'payment_snapshot_integrity_failed', 'payment_collection_scope_changed']);
function publicationCode(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  return typeof code === 'string' && publicationCodes.has(code) ? code : 'payment_collection_publication_failed';
}
function collectionCode(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  return typeof code === 'string' && (CONTRACT_FAILURE_CODES.includes(code) || code === 'payment_capture_precedes_scope'
    || code === 'payment_snapshot_stale' || code === 'payment_snapshot_replayed_pass' || code === 'payment_snapshot_clock_unavailable')
    ? code : 'payment_collection_validation_failed';
}
type Outcome = { alias: string; status: 'published'; publicationId: string; snapshotId: string; generation: number; alreadyPublished: boolean }
  | { alias: string; status: 'failed'; code: string }
  | { alias: string; status: 'unresolved'; code: string; candidateSnapshotId: string; expectedGeneration: number }
  | { alias: string; status: 'not_attempted' };
function receipt(outcomes: Outcome[], collection: { attempted: boolean; validated: boolean; code?: string }) {
  const published = outcomes.filter(item => item.status === 'published').length;
  const unresolved = outcomes.filter(item => item.status === 'unresolved').length;
  return { schemaVersion: 'ainuoke-payment-collection-result.v1' as const,
    result: unresolved ? 'PAYMENT_COLLECTION_UNVERIFIED' : published === 2 ? 'PAYMENT_COLLECTION_PUBLISHED'
      : published ? 'PAYMENT_COLLECTION_PARTIAL' : 'PAYMENT_COLLECTION_NOT_PUBLISHED',
    collection, published, unresolved, requiresPublicationReconciliation: unresolved > 0, outcomes,
    automaticRetry: false as const, targetActivation: 'unchanged' as const,
    bankPaymentStatus: 'not_inferred' as const };
}
async function scopeUnchanged(pool: Pool, identity: Identity, request: PaymentCollectionRequest, plan: Plan, now: () => number) {
  if ((await prepare(pool, identity, request, now)).scopeHash !== plan.scopeHash) fail('payment_collection_scope_changed');
}

/** Explicit internal one-shot path. Never mounted in the API or scheduler.
 * All targets are prepared before the sole worker call; all pages validate
 * before the first publication. Per-SO transactions keep accepted history when
 * a later publication fails. Receipts contain no rows, credentials or amounts. */
async function collectAndPublishPaymentContractsImplementation(pool: Pool, caller: Identity, input: PaymentCollectionRequest,
  expectedScopeHash: string, options: { now?: () => number;
    collect?: (config: CollectorConfig, selection: ContractSelection) => Promise<unknown> } = {}) {
  if (!sha(expectedScopeHash)) fail('payment_collection_explicit_scope_required');
  const request = parsePaymentCollectionRequest(input), identity = { internalUserId: caller.internalUserId, userId: caller.userId };
  const now = options.now ?? Date.now, plan = await prepare(pool, identity, request, now);
  if (plan.scopeHash !== expectedScopeHash) fail('payment_collection_scope_mismatch');
  const notAttempted = () => request.targets.map(target => ({ alias: target.alias, status: 'not_attempted' as const }));
  let captured: Array<ReturnType<typeof paymentContractSnapshotInputs>[number] & { candidateSnapshotId: string }>;
  try {
    const evidence = structuredClone(await (options.collect ?? collectPaymentContracts)(structuredClone(request.config), structuredClone(request.selection)));
    const checkedAt = now();
    captured = paymentContractSnapshotInputs(evidence, request.config, request.selection, checkedAt).map((capture, index) => {
      const snapshot = buildPaymentContractSnapshot(capture.input, capture.scope, checkedAt);
      if (Date.parse(snapshot.observedFrom) < plan.contexts[index].preparedAt) fail('payment_capture_precedes_scope');
      return { ...capture, candidateSnapshotId: snapshot.snapshotId };
    });
  } catch (error) {
    return receipt(notAttempted(), { attempted: true, validated: false, code: collectionCode(error) });
  }
  try { await scopeUnchanged(pool, identity, request, plan, now); }
  catch (error) { return receipt(notAttempted(), { attempted: true, validated: true, code: publicationCode(error) }); }
  const outcomes: Outcome[] = [];
  for (const [index, target] of request.targets.entries()) {
    try {
      const result = await publishPaymentSnapshot(pool, identity, plan.contexts[index], captured[index].input, captured[index].scope, now());
      outcomes.push({ alias: target.alias, status: 'published', ...result });
    } catch (error) {
      const code = publicationCode(error);
      if (code === 'payment_collection_publication_failed') outcomes.push({ alias: target.alias, status: 'unresolved', code,
        candidateSnapshotId: captured[index].candidateSnapshotId, expectedGeneration: plan.contexts[index].generation + 1 });
      else outcomes.push({ alias: target.alias, status: 'failed', code });
      for (const remaining of request.targets.slice(index + 1)) outcomes.push({ alias: remaining.alias, status: 'not_attempted' });
      break;
    }
  }
  return receipt(outcomes, { attempted: true, validated: true });
}

export async function collectAndPublishPaymentContracts(...args:Parameters<typeof collectAndPublishPaymentContractsImplementation>){return withSyncAudit(args[0],{sourceKey:args[2].config.sourceKey,type:'manual',reports:['6086941']},()=>collectAndPublishPaymentContractsImplementation(...args));}

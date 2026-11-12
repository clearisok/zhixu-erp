import {withSyncAudit,commitWithSyncAudit} from './sync-audit.js';
import type { Pool, PoolClient } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { requireOrderCommandActor } from '../sales-orders/identity-service.js';
import { SourceError, hash } from './contract.js';
import { sourceActor } from './service.js';
import { planPaymentCollection, collectAndPublishPaymentContracts, parsePaymentCollectionRequest,
  type PaymentCollectionRequest } from './payment-request-collection.js';
import { assertPaymentOperatorPermitFresh, parsePaymentOperatorPermit, paymentOperatorPayloadHash,
  reservePaymentOperatorCommand, completePaymentOperatorCommand, readPaymentOperatorCommand,
  type PaymentOperatorPermit, type PaymentOperatorCommand, type PaymentOperatorStoredCommand } from './payment-operator-command-store.js';

type Identity = Pick<TrustedIdentity, 'internalUserId' | 'userId'>;
type Options = Parameters<typeof collectAndPublishPaymentContracts>[4];
const fail = (code: string): never => { throw new SourceError(code); };
const scopeHash = (base: string, permit: Pick<PaymentOperatorPermit, 'requestId' | 'expiresAt'>) => hash({
  schemaVersion: 'ainuoke-payment-operator-collection-plan.v1', baseScopeHash: base,
  requestId: permit.requestId, expiresAt: permit.expiresAt,
});

export async function planPaymentOperatorCollection(pool: Pool, actor: Identity, input: PaymentCollectionRequest,
  permitInput: Pick<PaymentOperatorPermit, 'requestId' | 'expiresAt'>, now: () => number = Date.now) {
  const permit = parsePaymentOperatorPermit({ ...permitInput, scopeHash: '0'.repeat(64) });
  assertPaymentOperatorPermitFresh(permit, now());
  const plan = await planPaymentCollection(pool, actor, input, now);
  return { ...plan, schemaVersion: 'ainuoke-payment-operator-collection-plan.v1' as const,
    baseScopeHash: plan.scopeHash, scopeHash: scopeHash(plan.scopeHash, permit),
    requestId: permit.requestId, expiresAt: permit.expiresAt };
}

function existingReceipt(stored: PaymentOperatorStoredCommand, command: PaymentOperatorCommand) {
  if (stored.kind !== command.kind || stored.sourceKey !== command.sourceKey || stored.scopeHash !== command.permit.scopeHash
    || stored.payloadHash !== command.payloadHash) fail('payment_operator_request_conflict');
  return { schemaVersion: 'ainuoke-payment-operator-result.v1' as const, requestId: command.permit.requestId,
    receiptState: stored.state === 'completed' ? 'completed' as const : 'unverified_started' as const,
    replayed: true, result: stored.result, sourceReadThisInvocation: 'none' as const, receiptIsHistorical: true };
}

const preCollectionCodes = new Set(['permission_denied', 'authentication_required', 'source_actor_unavailable',
  'payment_source_not_connected', 'payment_order_not_available', 'payment_binding_changed', 'payment_collection_scope_mismatch',
  'payment_collection_binding_mismatch', 'payment_collection_operator_mismatch', 'payment_operator_permit_expired']);

/** A durable started receipt is committed before the sole upstream invocation.
 * Neither a terminal replay nor an ambiguous started receipt grants a new read.
 * Target/generation races after the lease are checked again by the coordinator
 * before its worker, and again before publication. No locks span network IO. */
async function collectPaymentOnceImplementation(pool: Pool, caller: Identity, input: PaymentCollectionRequest,
  permitInput: PaymentOperatorPermit, options: Options = {}) {
  const request = parsePaymentCollectionRequest(input), permit = parsePaymentOperatorPermit(permitInput);
  const identity = { internalUserId: caller.internalUserId, userId: caller.userId }, now = options.now ?? Date.now;
  const command: PaymentOperatorCommand = { sourceKey: request.config.sourceKey, kind: 'collect', permit,
    payloadHash: paymentOperatorPayloadHash('collect', permit.scopeHash, permit.expiresAt, {
      sourceKey: request.config.sourceKey, operatorUsername: request.config.operatorUsername, selection: request.selection, targets: request.targets,
    }) };
  const existing = await readPaymentOperatorCommand(pool, identity, request.config.sourceKey, permit.requestId);
  if (existing) return existingReceipt(existing, command);
  const plan = await planPaymentOperatorCollection(pool, identity, request, { requestId: permit.requestId, expiresAt: permit.expiresAt }, now);
  if (plan.scopeHash !== permit.scopeHash) fail('payment_operator_scope_changed');

  const client = await pool.connect(); let committing = false;
  try {
    await client.query('BEGIN'); await client.query("SET LOCAL lock_timeout='5s'");
    let actor = await sourceActor(client, identity, true);
    await requireOrderCommandActor(client, actor, 'ainuoke.sync'); actor = await sourceActor(client, identity, true);
    if (actor.username !== request.config.operatorUsername) fail('payment_collection_operator_mismatch');
    const reserved = await reservePaymentOperatorCommand(client, actor, command, now());
    if (!reserved.reserved) { await client.query('ROLLBACK'); return existingReceipt(reserved.stored, command); }
    committing = true; await commitWithSyncAudit(client);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (committing) return { schemaVersion: 'ainuoke-payment-operator-result.v1' as const, requestId: permit.requestId,
      receiptState: 'unverified_claim' as const, replayed: false, result: null, sourceReadThisInvocation: 'none' as const,
      receiptIsHistorical: false };
    throw error;
  } finally { client.release(); }

  let result: Record<string, unknown>;
  try {
    assertPaymentOperatorPermitFresh(permit, now());
    result = await collectAndPublishPaymentContracts(pool, identity, request, plan.baseScopeHash, options);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      && preCollectionCodes.has(error.code) ? error.code : 'payment_operator_collection_unverified';
    // An unexpected transport/runtime error is not proof that no IO occurred.
    result = { schemaVersion: 'ainuoke-payment-operator-failure.v1', result: 'UNVERIFIED', code, automaticRetry: false };
  }

  let finish: PoolClient | undefined, receiptState: 'completed' | 'unverified_receipt' = 'completed';
  try {
    finish = await pool.connect();
    await finish.query('BEGIN');
    await completePaymentOperatorCommand(finish, identity.internalUserId, command, result);
    await finish.query('COMMIT');
  } catch {
    await finish?.query('ROLLBACK').catch(() => undefined); receiptState = 'unverified_receipt';
  } finally { finish?.release(); }
  return { schemaVersion: 'ainuoke-payment-operator-result.v1' as const, requestId: permit.requestId,
    receiptState, replayed: false, result, sourceReadThisInvocation: 'see_result' as const, receiptIsHistorical: false };
}

export async function collectPaymentOnce(...args:Parameters<typeof collectPaymentOnceImplementation>){return withSyncAudit(args[0],{sourceKey:args[2].config.sourceKey,type:'manual',reports:['6086941']},()=>collectPaymentOnceImplementation(...args));}

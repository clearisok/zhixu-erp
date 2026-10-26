import type { Pool, PoolClient } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { readCurrentActor } from '../auth/current-actor.js';
import { requirePermission } from '../auth/permissions.js';
import { HttpError } from '../http/errors.js';
import { appendOperationLog, createServerOperationId } from '../operation-logs/repository.js';
import { lockEffectiveAttribution } from './effective-attribution.js';
import { orderCommandControlError, type OrderCommandMode } from './command-control.js';
import { appendLineCommercialVersion, readCommercialLines, type CommercialLine } from './color-commercial.js';
import { productHash } from './product-snapshot.js';
import { buildLaborAdoption } from './labor-adoption-source.js';
import { LABOR_ADOPTION_PERMISSIONS, laborAdoptionFail as fail, laborAdoptionUuid, laborSourceIdentity, parseLaborAdoptionCommand, parseLaborAdoptionIntent,
  type LaborAdoptionCommand } from './labor-adoption-model.js';

const READ_PERMISSIONS = ['order.view', 'quote.view', 'commercial.labor.view'] as const;
export type LaborAdoptionOutcome = { requestId: string; status: 'applied' | 'unchanged'; commercialVersionId: string; version: number; operationId: string | null }
  | { requestId: string; status: 'rejected'; error: { status: number; code: string } };
function requireGrants(actor: TrustedIdentity, write = false) {
  for (const key of write ? LABOR_ADOPTION_PERMISSIONS : READ_PERMISSIONS) requirePermission(actor.permissions, key);
}
async function schema(client: PoolClient) {
  const row = (await client.query(`SELECT to_regclass('public.order_labor_adoption_commands') IS NOT NULL AND EXISTS(
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales_order_commercial_lines' AND column_name='labor_confirmation_source') AS ready`)).rows[0];
  if (!row.ready) fail(503, 'labor_adoption_schema_unavailable');
}
async function budget(client: PoolClient, command: LaborAdoptionCommand) {
  const bytes = (await client.query<{ bytes: number }>('SELECT octet_length($1::jsonb::text)::int AS bytes', [JSON.stringify(command)])).rows[0].bytes;
  if (bytes > 131072) fail(422, 'labor_adoption_command_too_large');
}
function projectLine(line: CommercialLine) {
  return { colorId: line.colorId, colorName: line.colorName, quantity: line.quantity, priceVersionId: line.priceVersionId,
    priceVersionName: line.priceVersionName, laborPrice: line.laborPrice, laborCurrency: line.laborCurrency,
    confirmation: line.laborConfirmationSource ? laborSourceIdentity(line.laborConfirmationSource) : null };
}
export async function previewLaborAdoption(pool: Pool, identity: TrustedIdentity, raw: unknown) {
  const intent = parseLaborAdoptionIntent(raw), client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); const actor = await readCurrentActor(client, identity); requireGrants(actor, true); await schema(client);
    await budget(client, { requestId: '00000000-0000-0000-0000-000000000000', intent, previewHash: '0'.repeat(64) });
    const built = await buildLaborAdoption(client, intent, false);
    const result = { intent, previewHash: built.previewHash, currentVersion: built.current.version, currentVersionId: built.current.id,
      quoteId: built.current.quoteId, quoteCode: built.quoteCode, targetRevisionId: intent.targetRevisionId, revisionLabel: built.revisionLabel,
      before: built.lines.filter(line => intent.colorIds.includes(line.colorId)).map(projectLine),
      after: built.after.filter(line => intent.colorIds.includes(line.colorId)).map(projectLine), unchanged: !built.changed,
      warnings: built.warnings, preserved: ['garment_sale', 'product_snapshot', 'creation_source', 'processing_batch', 'closing_history', 'unselected_colors'] as const };
    if (Buffer.byteLength(JSON.stringify(result)) > 1048576) fail(422, 'labor_adoption_preview_too_large');
    await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { client.release(); }
}
export async function executeLaborAdoption(pool: Pool, identity: TrustedIdentity, raw: unknown, mode: OrderCommandMode = 'enabled') {
  const command = parseLaborAdoptionCommand(raw), digest = productHash(command), client = await pool.connect(); let committing = false;
  try {
    await client.query('BEGIN'); await client.query("SET LOCAL lock_timeout='5s'"); await lockEffectiveAttribution(client);
    const actor = await readCurrentActor(client, identity, true); requireGrants(actor, true); await schema(client); await budget(client, command);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`order-commercial-request:${actor.internalUserId}:${command.requestId}`]);
    const prior = (await client.query<{ payload_hash: string; result: LaborAdoptionOutcome }>('SELECT payload_hash,result FROM order_labor_adoption_commands WHERE actor_id=$1 AND request_id=$2', [actor.internalUserId, command.requestId])).rows[0];
    if (prior) {
      if (prior.payload_hash !== digest) fail(409, 'labor_adoption_request_conflict'); committing = true; await client.query('COMMIT'); return { ...prior.result, replayed: true };
    }
    if (mode !== 'enabled') fail(503, 'order_commands_frozen'); await client.query('SELECT require_order_commands_enabled()');
    await client.query("SELECT set_config('zhixu.labor_adoption','on',true)"); await client.query('SAVEPOINT labor_adoption_apply');
    let result: LaborAdoptionOutcome, beforeId: string | null = null, afterId: string | null = null;
    try {
      if ((await client.query('SELECT 1 FROM sales_order_commercial_versions WHERE actor_id=$1 AND request_id=$2', [actor.internalUserId, command.requestId])).rowCount) fail(409, 'commercial_request_used');
      const built = await buildLaborAdoption(client, command.intent, true);
      if (built.previewHash !== command.previewHash) fail(409, 'labor_adoption_preview_changed');
      beforeId = built.current.id;
      let operationId: string | null = null;
      if (built.changed) {
        afterId = (await appendLineCommercialVersion(client, { orderId: command.intent.orderId, version: built.current.version + 1, previousVersionId: beforeId,
          actorId: actor.internalUserId, requestId: command.requestId, payloadHash: digest, reason: command.intent.reason, lines: built.after, changeKind: 'labor_adoption' })).id;
        operationId = createServerOperationId();
        await appendOperationLog(client, actor, { operationId, module: '报价中心', action: '采用订单商业版本', entityType: 'OrderCommercialVersion', entityId: afterId,
          quoteId: built.current.quoteId, context: { salesOrderId: command.intent.orderId },
          afterData: { values: { salesOrderId: command.intent.orderId, version: built.current.version + 1 } },
          metadata: { workflow: 'usd_labor_adoption', requestId: command.requestId, colorCount: command.intent.colorIds.length } });
      } else afterId = beforeId;
      result = { requestId: command.requestId, status: built.changed ? 'applied' : 'unchanged', commercialVersionId: afterId,
        version: built.current.version + (built.changed ? 1 : 0), operationId };
    } catch (error) {
      if (!(error instanceof HttpError) || ![404, 409, 422].includes(error.status)) throw error;
      await client.query('ROLLBACK TO SAVEPOINT labor_adoption_apply'); beforeId = null; afterId = null;
      result = { requestId: command.requestId, status: 'rejected', error: { status: error.status, code: error.code } };
    }
    const actual = (await client.query<{ id: string }>('SELECT id::text FROM sales_orders WHERE id=$1', [command.intent.orderId])).rows[0]?.id ?? null;
    await client.query(`INSERT INTO order_labor_adoption_commands(actor_id,request_id,declared_order_id,sales_order_id,before_version_id,after_version_id,payload_hash,command,result)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [actor.internalUserId, command.requestId, command.intent.orderId, actual, beforeId, afterId, digest, command, result]);
    committing = true; await client.query('COMMIT'); return { ...result, replayed: false };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (committing) return { requestId: command.requestId, status: 'unverified' as const };
    throw orderCommandControlError(error);
  } finally { client.release(); }
}
export async function readLaborAdoptionReceipt(pool: Pool, identity: TrustedIdentity, value: unknown) {
  const requestId = laborAdoptionUuid(value), client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY'); await client.query("SET LOCAL lock_timeout='5s'");
    let actor = await readCurrentActor(client, identity); requireGrants(actor); await schema(client);
    await client.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))', [`order-commercial-request:${actor.internalUserId}:${requestId}`]);
    actor = await readCurrentActor(client, identity); requireGrants(actor);
    const row = (await client.query<{ result: LaborAdoptionOutcome }>('SELECT result FROM order_labor_adoption_commands WHERE actor_id=$1 AND request_id=$2', [actor.internalUserId, requestId])).rows[0];
    await client.query('COMMIT'); return row ? { state: 'recorded' as const, requestId, result: row.result } : { state: 'unknown' as const, requestId };
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { client.release(); }
}
export async function readLaborAdoptionHistory(pool: Pool, identity: TrustedIdentity, params: URLSearchParams) {
  const orderId = laborAdoptionUuid(params.get('orderId')), offset = Number(params.get('offset') ?? '0');
  if ([...params.keys()].some(key => !['orderId', 'offset'].includes(key) || params.getAll(key).length !== 1) || !Number.isSafeInteger(offset) || offset < 0) fail(400, 'invalid_labor_history_query');
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'); const actor = await readCurrentActor(client, identity); requireGrants(actor); await schema(client);
    const rows = (await client.query<{ requestId: string; createdAt: string; result: LaborAdoptionOutcome; beforeId: string | null; afterId: string | null }>(
      `SELECT request_id::text AS "requestId",created_at::text AS "createdAt",result,before_version_id::text AS "beforeId",after_version_id::text AS "afterId"
       FROM order_labor_adoption_commands WHERE sales_order_id=$1 ORDER BY created_at DESC,actor_id,request_id LIMIT 21 OFFSET $2`, [orderId, offset])).rows;
    const items = [];
    for (const row of rows.slice(0, 20)) items.push({ requestId: row.requestId, createdAt: row.createdAt, result: row.result,
      before: row.beforeId ? (await readCommercialLines(client, orderId, row.beforeId)).map(projectLine) : [],
      after: row.afterId ? (await readCommercialLines(client, orderId, row.afterId)).map(projectLine) : [] });
    const result = { items, offset, hasMore: rows.length > 20 };
    if (Buffer.byteLength(JSON.stringify(result)) > 1048576) fail(422, 'labor_history_too_large'); await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { client.release(); }
}

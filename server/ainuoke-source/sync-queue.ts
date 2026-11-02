import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { TrustedIdentity } from '../auth/session.js';
import { requirePermission } from '../auth/permissions.js';
import { sourceActor } from './service.js';
import { SourceError, hash, sourceKeyValid } from './contract.js';
import { syncSchedule, validateSyncPolicy, type SyncPolicy } from './sync-schedule.js';

type Identity = Pick<TrustedIdentity, 'internalUserId' | 'userId'>;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const iso = (v: Date | string | null) => v === null ? null : new Date(v).toISOString();
async function tx<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); await c.query("SET LOCAL lock_timeout='5s'"); const result = await fn(c); await c.query('COMMIT'); return result; }
  catch (e) { await c.query('ROLLBACK').catch(() => undefined); throw e; }
  finally { c.release(); }
}
async function lockSource(c: PoolClient, sourceKey: string) {
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['ainuoke-sync-queue:' + sourceKey]);
}
async function control(c: PoolClient, sourceKey: string) {
  const row = (await c.query(`SELECT s.* FROM ainuoke_sync_controls s JOIN ainuoke_source_profiles p USING(source_key)
    WHERE s.source_key=$1 AND p.enabled=true FOR SHARE OF p,s`, [sourceKey])).rows[0];
  if (!row?.enabled) throw new SourceError('sync_worker_not_enabled');
  if (row.paused_reason) throw new SourceError('sync_worker_paused');
  return { ...row, policy: validateSyncPolicy(row.policy as SyncPolicy) };
}
/** Explicit operator configuration, never called by API startup or migration. */
export async function configureSync(pool: Pool, identity: Identity, input: {
  sourceKey: string; enabled: boolean; expectedVersion: number; policy: SyncPolicy;
}) {
  if (!sourceKeyValid(input.sourceKey) || typeof input.enabled !== 'boolean' || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) throw new SourceError('sync_configuration_invalid');
  const policy = validateSyncPolicy(input.policy);
  return tx(pool, async c => {
    await lockSource(c, input.sourceKey);
    const actor = await sourceActor(c, identity, true); requirePermission(actor.permissions, 'ainuoke.bind');
    const profile = (await c.query('SELECT enabled FROM ainuoke_source_profiles WHERE source_key=$1 FOR SHARE', [input.sourceKey])).rows[0];
    if (!profile?.enabled) throw new SourceError('source_account_mismatch');
    const previous = (await c.query('SELECT version,paused_reason FROM ainuoke_sync_controls WHERE source_key=$1 FOR UPDATE', [input.sourceKey])).rows[0];
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new SourceError('sync_configuration_conflict');
    // An operational pause cannot be cleared by changing policy or enabling again.
    if (previous?.paused_reason && input.enabled) throw new SourceError('sync_worker_paused');
    const version = input.expectedVersion + 1;
    await c.query(`INSERT INTO ainuoke_sync_controls(source_key,enabled,version,policy,operator_id) VALUES($1,$2,$3,$4::jsonb,$5)
      ON CONFLICT(source_key) DO UPDATE SET enabled=excluded.enabled,version=excluded.version,policy=excluded.policy,operator_id=excluded.operator_id,updated_at=now()`,
      [input.sourceKey,input.enabled,version,JSON.stringify(policy),actor.internalUserId]);
    return { sourceKey: input.sourceKey, enabled: input.enabled, version, policy };
  });
}
/** Receipt is saved before notifying the worker; duplicate clicks coalesce per contract.
 * This command never reads credentials or performs upstream network requests. */
export async function requestContractSync(pool: Pool, identity: Identity, input: {sourceKey: string; sourceId: string; requestId: string}) {
  if (!sourceKeyValid(input.sourceKey) || typeof input.sourceId !== 'string' || !input.sourceId || input.sourceId.length > 200 || !uuid.test(input.requestId)) throw new SourceError('sync_request_invalid');
  return tx(pool, async c => {
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['ainuoke-sync-request:' + identity.internalUserId + ':' + input.requestId]);
    await lockSource(c,input.sourceKey);
    const actor = await sourceActor(c, identity, true), digest = hash(input);
    const prior = (await c.query('SELECT payload_hash,job_id::text FROM ainuoke_sync_requests WHERE actor_id=$1 AND request_id=$2', [actor.internalUserId,input.requestId])).rows[0];
    if (prior) {
      if (prior.payload_hash !== digest) throw new SourceError('sync_request_conflict');
      return { jobId: prior.job_id as string, requestId: input.requestId, replayed: true };
    }
    await control(c, input.sourceKey);
    const entry = (await c.query('SELECT sales_contract_no,visible FROM ainuoke_catalog_entries WHERE source_key=$1 AND source_id=$2 FOR SHARE', [input.sourceKey,input.sourceId])).rows[0];
    if (!entry) throw new SourceError('sync_contract_not_available');
    // A previously visible contract can still be requested; upstream visibility is rechecked.
    const existing = (await c.query("SELECT id::text,status,kind FROM ainuoke_sync_jobs WHERE source_key=$1 AND source_id=$2 AND status IN ('queued','running','unknown') FOR UPDATE", [input.sourceKey,input.sourceId])).rows[0];
    if (existing?.status === 'unknown') throw new SourceError('sync_result_unknown');
    const jobId: string = existing?.id ?? randomUUID();
    if (!existing) await c.query(`INSERT INTO ainuoke_sync_jobs(id,source_key,source_id,sales_contract_no,kind,status,requested_by)
      VALUES($1,$2,$3,$4,'manual','queued',$5)`, [jobId,input.sourceKey,input.sourceId,entry.sales_contract_no,actor.internalUserId]);
    else if (existing.status === 'queued') await c.query("UPDATE ainuoke_sync_jobs SET kind='manual',requested_by=$2 WHERE id=$1", [jobId,actor.internalUserId]);
    await c.query('INSERT INTO ainuoke_sync_requests(actor_id,request_id,payload_hash,job_id) VALUES($1,$2,$3,$4)', [actor.internalUserId,input.requestId,digest,jobId]);
    await c.query("SELECT pg_notify('ainuoke_sync_requested',$1)", [input.sourceKey]);
    return { jobId, requestId: input.requestId, replayed: false };
  });
}
/** Recalculate from current Source dates on every tick. Following/hiding is irrelevant. */
export async function enqueueAutomaticSync(pool: Pool, identity: Identity, sourceKey: string, now = Date.now()) {
  return tx(pool, async c => {
    await lockSource(c,sourceKey); const actor = await sourceActor(c,identity,true), settings = await control(c,sourceKey);
    if (String(settings.operator_id) !== actor.internalUserId) throw new SourceError('sync_operator_changed');
    const rows = (await c.query(`SELECT e.source_id,e.sales_contract_no,e.delivery_date,s.last_success_at,s.last_automatic_attempt_at
      FROM ainuoke_catalog_entries e LEFT JOIN ainuoke_contract_sync_state s USING(source_key,source_id)
      WHERE e.source_key=$1 AND e.visible=true ORDER BY e.sales_contract_no LIMIT 1001`, [sourceKey])).rows;
    if (rows.length > 1000) throw new SourceError('sync_catalog_capacity_exceeded');
    let queued = 0;
    for (const row of rows) {
      const schedule = syncSchedule({deliveryDate:row.delivery_date,now,lastSuccessAt:iso(row.last_success_at),lastAutomaticAttemptAt:iso(row.last_automatic_attempt_at)},settings.policy);
      if (!schedule.due) continue;
      const result = await c.query(`INSERT INTO ainuoke_sync_jobs(id,source_key,source_id,sales_contract_no,kind,status,requested_by,scheduled_slot,requested_at)
        VALUES($1,$2,$3,$4,'automatic','queued',$5,$6,$7) ON CONFLICT DO NOTHING`,
        [randomUUID(),sourceKey,row.source_id,row.sales_contract_no,actor.internalUserId,schedule.slot,new Date(now)]);
      queued += result.rowCount ?? 0;
    }
    return { queued, catalogCount: rows.length };
  });
}
export type SyncJob = {id:string;source_key:string;source_id:string;sales_contract_no:string;kind:'manual'|'automatic';requested_by:string;started_at:Date};
/** The caller additionally holds the source's session-level worker lock through IO. */
export async function claimSyncJobs(pool: Pool, identity: Identity, sourceKey: string, maximum = 5, now = Date.now()): Promise<SyncJob[]> {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 25) throw new SourceError('sync_batch_invalid');
  return tx(pool, async c => {
    await lockSource(c,sourceKey); const actor = await sourceActor(c,identity,true), settings = await control(c,sourceKey);
    if (String(settings.operator_id) !== actor.internalUserId) throw new SourceError('sync_operator_changed');
    const rows = (await c.query(`SELECT j.*,j.requested_by::text FROM ainuoke_sync_jobs j WHERE j.source_key=$1 AND j.status='queued'
      ORDER BY (j.kind='manual') DESC,j.requested_at,j.id LIMIT $2 FOR UPDATE SKIP LOCKED`,[sourceKey,maximum])).rows;
    // A manual operation captures only the selected contract, even if auto jobs await.
    const selected = rows[0]?.kind === 'manual' ? rows.slice(0,1) : rows;
    for (const job of selected) {
      // A revoked requester must not retain a queued write capability.
      const requester = (await c.query('SELECT public_id::text FROM app_users WHERE id=$1',[job.requested_by])).rows[0];
      try { await sourceActor(c,{internalUserId:String(job.requested_by),userId:requester?.public_id ?? ''},true); }
      catch { await c.query("UPDATE ainuoke_sync_jobs SET status='failed',finished_at=$2,result=$3::jsonb WHERE id=$1",[job.id,new Date(now),JSON.stringify({code:'sync_requester_unavailable'})]); continue; }
      await c.query("UPDATE ainuoke_sync_jobs SET status='running',started_at=$2 WHERE id=$1",[job.id,new Date(now)]);
      if (job.kind === 'automatic') await c.query(`INSERT INTO ainuoke_contract_sync_state(source_key,source_id,last_automatic_attempt_at) VALUES($1,$2,$3)
        ON CONFLICT(source_key,source_id) DO UPDATE SET last_automatic_attempt_at=excluded.last_automatic_attempt_at`,[sourceKey,job.source_id,new Date(now)]);
      job.started_at = new Date(now);
    }
    return selected.filter(j=>j.started_at) as SyncJob[];
  });
}
export async function readSyncRequest(pool: Pool, identity: Identity, requestId: string) {
  if (!uuid.test(requestId)) throw new SourceError('sync_request_invalid');
  await sourceActor(pool,identity,false,false);
  const row = (await pool.query(`SELECT j.id::text AS "jobId",j.status,j.kind,j.requested_at AS "requestedAt",j.started_at AS "startedAt",j.finished_at AS "finishedAt",j.result
    FROM ainuoke_sync_requests r JOIN ainuoke_sync_jobs j ON j.id=r.job_id WHERE r.actor_id=$1 AND r.request_id=$2`,[identity.internalUserId,requestId])).rows[0];
  return row ?? {status:'not_found',absenceProvesFailure:false};
}

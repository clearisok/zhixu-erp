import type {Pool} from 'pg';

/** A read-only recovery input, not authorization to start a worker. */
export async function readSyncHealth(pool:Pool,sourceKey:string,migrationFiles:readonly string[]){
 const c=await pool.connect();
 try{
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const db=(await c.query('SELECT pg_is_in_recovery() AS recovering,clock_timestamp() AS checked_at')).rows[0];
  const control=(await c.query('SELECT enabled,paused_reason,heartbeat_at FROM ainuoke_sync_controls WHERE source_key=$1',[sourceKey])).rows[0];
  const jobs=(await c.query("SELECT count(*)::int AS count FROM ainuoke_sync_jobs WHERE source_key=$1 AND status IN ('running','unknown')",[sourceKey])).rows[0];
  const catalogs=(await c.query("SELECT count(*)::int AS count FROM ainuoke_catalog_requests WHERE source_key=$1 AND status IN ('running','unknown')",[sourceKey])).rows[0];
  const attempts=(await c.query("SELECT count(*)::int AS count FROM ainuoke_sync_capture_attempts WHERE source_key=$1 AND status='running'",[sourceKey])).rows[0];
  const unknownJobs=(await c.query("SELECT count(*)::int AS count FROM ainuoke_sync_jobs WHERE source_key=$1 AND status='unknown'",[sourceKey])).rows[0];
  const unknownCatalogs=(await c.query("SELECT count(*)::int AS count FROM ainuoke_catalog_requests WHERE source_key=$1 AND status='unknown'",[sourceKey])).rows[0];
  // Observe the existing bigint advisory lease without taking it or changing
  // task state. Its owner is checked before a replacement worker starts.
  const lease=(await c.query(`WITH key AS (SELECT hashtextextended($1,0) AS k)
   SELECT EXISTS(SELECT 1 FROM pg_locks,key WHERE locktype='advisory' AND granted
    AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
    AND classid=((k >> 32) & 4294967295)::oid AND objid=(k & 4294967295)::oid AND objsubid=1) AS held`,
   ['ainuoke-sync-worker:'+sourceKey])).rows[0];
  await c.query('COMMIT');
  return {event:'SYNC_HEALTH',databaseHealthy:db?.recovering===false, databaseCheckedAt:db?.checked_at,
   migrationsCurrent:migrationFiles.some(name=>name.startsWith('0058_')),
   adminNotPaused:control?.enabled===true&&!control?.paused_reason,
   noUnknownResult:jobs?.count===0&&catalogs?.count===0&&attempts?.count===0,
   hasUnknownResult:unknownJobs?.count!==0||unknownCatalogs?.count!==0,
   workerLeaseHeld:lease?.held!==false,heartbeatAt:control?.heartbeat_at??null,sourceRequests:0};
 }catch(error){await c.query('ROLLBACK').catch(()=>undefined);throw error;}finally{c.release();}
}

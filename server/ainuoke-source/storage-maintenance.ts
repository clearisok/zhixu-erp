import type {Pool} from 'pg';

const failures=new WeakMap<Pool,Map<string,number>>();
/** Auxiliary work owns a separate bounded transaction. Never changes worker/pause/source state. */
export async function maintainSourceStorage(pool:Pool,sourceKey:string,now=Date.now()) {
 const recent=failures.get(pool)??new Map<string,number>();failures.set(pool,recent);
 const last=recent.get(sourceKey);
 if(last!==undefined&&now-last<300000)return {status:'backoff' as const};
 const c=await pool.connect().catch(()=>null);
 if(!c){recent.set(sourceKey,now);return {status:'failed' as const,code:'storage_maintenance_unavailable'};}
 try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='250ms'");await c.query("SET LOCAL statement_timeout='2s'");
  if(!(await c.query("SELECT to_regprocedure('ainuoke_storage_rollup(text,integer)') IS NOT NULL AS ready")).rows[0].ready){await c.query('ROLLBACK');return {status:'unavailable' as const};}
  const setting=(await c.query('SELECT storage_cleanup_enabled FROM ainuoke_sync_controls WHERE source_key=$1',[sourceKey])).rows[0];
  const rollup=(await c.query('SELECT ainuoke_storage_rollup($1,100) AS result',[sourceKey])).rows[0].result;
  const retention=(await c.query('SELECT ainuoke_storage_prune($1,$2,100) AS result',[sourceKey,setting?.storage_cleanup_enabled===true])).rows[0].result;
  await c.query('COMMIT');recent.delete(sourceKey);
  return {status:'complete' as const,rollup,retention};
 }catch{
  await c.query('ROLLBACK').catch(()=>undefined);recent.set(sourceKey,now);
  return {status:'failed' as const,code:'storage_maintenance_failed'};
 }finally{c.release();}
}

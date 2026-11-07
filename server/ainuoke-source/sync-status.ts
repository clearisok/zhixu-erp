import type {Pool} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {sourceActor} from './service.js';
import {effectiveSyncDeliverySql} from './sync-dates.js';
import {syncSchedule,syncReferenceDate,DEFAULT_SYNC_POLICY} from './sync-schedule.js';

export async function readAutomaticSyncStatus(pool:Pool,actor:Pick<TrustedIdentity,'internalUserId'|'userId'>,sourceKey:string,now=Date.now()){
 await sourceActor(pool,actor,true,false);
 const control=(await pool.query('SELECT enabled,policy,paused_reason,heartbeat_at FROM ainuoke_sync_controls WHERE source_key=$1',[sourceKey])).rows[0];
 const rows=(await pool.query(`SELECT e.source_id,e.sales_contract_no,e.contract_date,${effectiveSyncDeliverySql()} AS delivery_date,s.last_success_at,s.last_automatic_attempt_at,s.last_error_code,
 j.id AS job_id,j.kind,j.status,j.requested_at,j.started_at,j.finished_at
 FROM ainuoke_catalog_entries e LEFT JOIN ainuoke_contract_sync_state s USING(source_key,source_id)
 LEFT JOIN LATERAL(SELECT * FROM ainuoke_sync_jobs x WHERE x.source_key=e.source_key AND x.source_id=e.source_id ORDER BY requested_at DESC,attempt_number DESC LIMIT 1) j ON true
 WHERE e.source_key=$1 AND e.visible=true ORDER BY e.sales_contract_no`,[sourceKey])).rows;
 const iso=(v:Date|null)=>v?new Date(v).toISOString():null;
 const orders=rows.map(r=>({...r,reference_date:syncReferenceDate(r.delivery_date,r.contract_date,now),schedule:syncSchedule({deliveryDate:r.delivery_date,contractDate:r.contract_date,now,lastSuccessAt:iso(r.last_success_at),lastAutomaticAttemptAt:iso(r.last_automatic_attempt_at)},control?.policy??DEFAULT_SYNC_POLICY)}));
 const tiers={frequent:0,daily:0,weekly:0,monthly:0},pending={frequent:0,daily:0,weekly:0,monthly:0};let dateReview=0;
 for(const order of orders){const schedule:ReturnType<typeof syncSchedule>=order.schedule;const tier=schedule.tier==='date-review'?'frequent':schedule.tier;tiers[tier]++;if(order.schedule.dateNeedsReview)dateReview++;if(['queued','running','unknown'].includes(order.status))pending[tier]++;}
 const catalog=(await pool.query('SELECT status,created_at,finished_at FROM ainuoke_catalog_requests WHERE source_key=$1 ORDER BY created_at DESC LIMIT 1',[sourceKey])).rows[0];
 return {at:new Date(now).toISOString(),timezone:'Asia/Shanghai',control,total:orders.length,tiers,dateReview,pending,catalog,orders};
}

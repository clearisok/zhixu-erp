import type { Pool, PoolClient } from 'pg';
import { HttpError } from '../http/errors.js';
import { identityUuid } from './identity-model.js';
type Queryable=Pick<Pool|PoolClient,'query'>;
export type EffectiveOrderIdentity={originalOrderId:string;effectiveOrderId:string;attributionChangeId:string|null;attributionVersion:number;historicalDuplicate:boolean};
/** Current metadata only. Never sums, moves or rewrites original business facts. */
export async function resolveEffectiveOrder(client:Queryable,id:string):Promise<EffectiveOrderIdentity>{
 if(!identityUuid.test(id))throw new HttpError(400,'invalid_order_id','Invalid order ID');
 const row=(await client.query<{originalOrderId:string;effectiveOrderId:string;attributionChangeId:string|null;attributionVersion:number}>(`SELECT original_order_id::text AS "originalOrderId",effective_order_id::text AS "effectiveOrderId",attribution_change_id::text AS "attributionChangeId",attribution_version AS "attributionVersion" FROM sales_order_effective_identities WHERE original_order_id=$1`,[id])).rows[0];
 if(!row)throw new HttpError(404,'sales_order_not_found','Sales order not found');
 return {...row,historicalDuplicate:row.originalOrderId!==row.effectiveOrderId};
}
/** Caller must own a BEGIN transaction and authorization; holds lock until COMMIT. */
export async function requireEffectiveOrderForWrite(client:PoolClient,id:string){
 await client.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('order-effective-attribution',0))");
 const identity=await resolveEffectiveOrder(client,id);
 if(identity.historicalDuplicate)throw new HttpError(409,'historical_duplicate_order_read_only','Historical duplicate order cannot receive new execution');
 return identity;
}
export async function readEffectiveOrderGroup(client:Queryable,id:string){
 const identity=await resolveEffectiveOrder(client,id);
 const members=(await client.query<{originalOrderId:string;effectiveOrderId:string;attributionChangeId:string|null;attributionVersion:number}>(`SELECT original_order_id::text AS "originalOrderId",effective_order_id::text AS "effectiveOrderId",attribution_change_id::text AS "attributionChangeId",attribution_version AS "attributionVersion" FROM sales_order_effective_identities WHERE effective_order_id=$1 ORDER BY original_order_id LIMIT 101`,[identity.effectiveOrderId])).rows;
 if(members.length>100)throw new HttpError(409,'attribution_group_limit','Attribution group exceeds review limit');
 return {identity,members};
}

/** Internal persistence primitive. Caller owns transaction, complete evidence and authorization. */
export async function writeAttributionHeadInTransaction(client:PoolClient,changeId:string,id:string){
 const member=(await client.query<{previous_change_id:string|null;previous_version:number}>('SELECT previous_change_id::text,previous_version FROM sales_order_attribution_members WHERE change_id=$1 AND sales_order_id=$2',[changeId,id])).rows[0];
 if(!member)throw new HttpError(409,'attribution_member_missing','Attribution member missing');
 if(member.previous_version===0){
  await client.query('INSERT INTO sales_order_attribution_heads(sales_order_id,current_change_id,version) VALUES($1,$2,1)',[id,changeId]);
 }else{
  const updated=await client.query('UPDATE sales_order_attribution_heads SET current_change_id=$2,version=version+1 WHERE sales_order_id=$1 AND current_change_id=$3 AND version=$4',[id,changeId,member.previous_change_id,member.previous_version]);
  if(updated.rowCount!==1)throw new HttpError(409,'attribution_version_conflict','Attribution version conflict');
 }
}

/** Frozen foundation tools may run before attribution schema. Partial schema is not a fallback. */
export async function supportsEffectiveAttribution(client:Queryable):Promise<boolean>{
 const row=(await client.query<{heads:string|null;members:string|null;changes:string|null;identities:string|null}>("SELECT to_regclass('sales_order_attribution_heads')::text AS heads,to_regclass('sales_order_attribution_members')::text AS members,to_regclass('sales_order_attribution_changes')::text AS changes,to_regclass('sales_order_effective_identities')::text AS identities")).rows[0];
 const present=Object.values(row).filter(Boolean).length;
 if(present===0)return false;
 if(present!==4)throw new HttpError(503,'attribution_schema_incomplete','Attribution schema incomplete');
 return true;
}

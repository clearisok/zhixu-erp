import type {PoolClient} from 'pg';
import {HttpError} from '../http/errors.js';
import {NORMALIZATION_REFERENCES,normalizationReferences} from './normalization-preview.js';
import {normalizationHash,type AttributionProposal} from './normalization-execution-model.js';
import type {CoverageSnapshot} from './normalization-coverage.js';
export const FULL_INVENTORY_LIMITS={maxRows:100000,maxBytes:33554432};
export type FullReferenceDigest={relation:string;column:string;orderId:string;count:number;fingerprint:string};
function fail(code:string):never{throw new HttpError(409,code,code);}
export async function normalizationTargetFingerprint(client:PoolClient){
 const row=(await client.query("SELECT target_id::text,current_database() AS database_name,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS database_oid,inet_server_addr()::text AS server_address,inet_server_port() AS server_port FROM sales_order_normalization_target WHERE singleton=true")).rows[0];
 if(!row)throw new HttpError(503,'normalization_target_identity_missing','Target identity missing');
 return normalizationHash(row);
}
/** Every bounded matching row contributes all its bytes. No first-100 ID approximation. */
export async function collectFullNormalizationEvidence(client:PoolClient,caseId:string,proposal:AttributionProposal,external:CoverageSnapshot,limits=FULL_INVENTORY_LIMITS,freezeRows=false){
 if(!Number.isSafeInteger(limits.maxRows)||limits.maxRows<1||limits.maxRows>100000||!Number.isSafeInteger(limits.maxBytes)||limits.maxBytes<1||limits.maxBytes>33554432)fail('normalization_full_inventory_limit');
 const targetFingerprint=await normalizationTargetFingerprint(client);
 const memberIds=proposal.assignments.map(row=>row.originalOrderId);
 const record=(await client.query('SELECT id::text,first_order_id::text,second_order_id::text FROM sales_order_normalization_cases WHERE id=$1',[caseId])).rows[0];
 if(!record)throw new HttpError(404,'normalization_case_not_found','Case not found');
 const currentCase=(await client.query('SELECT version,event_type FROM sales_order_normalization_case_events WHERE case_id=$1 ORDER BY version DESC LIMIT 1',[caseId])).rows[0];
 if(!currentCase||currentCase.version!==proposal.caseVersion||currentCase.event_type==='withdrawn')fail('normalization_case_version_conflict');
 if(!memberIds.includes(record.first_order_id)||!memberIds.includes(record.second_order_id))fail('attribution_case_members_missing');
 const groups=(await client.query<{original_order_id:string;effective_order_id:string;attribution_change_id:string|null;attribution_version:number}>(`SELECT original_order_id::text,effective_order_id::text,attribution_change_id::text,attribution_version FROM sales_order_effective_identities WHERE effective_order_id IN (SELECT effective_order_id FROM sales_order_effective_identities WHERE original_order_id=ANY($1::uuid[])) ORDER BY original_order_id LIMIT 101`,[memberIds])).rows;
 if(groups.length!==memberIds.length||groups.some(row=>!memberIds.includes(row.original_order_id)))fail('attribution_complete_group_required');
 if(proposal.changeType==='normalize'?groups.some(row=>row.attribution_version>0):groups.every(row=>row.attribution_version===0))fail('attribution_change_type_conflict');
 if(groups.every(row=>proposal.assignments.find(member=>member.originalOrderId===row.original_order_id)!.effectiveOrderId===row.effective_order_id))fail('attribution_no_change');
 const orders=(await client.query(`SELECT id::text,order_no,creation_source,lifecycle_state,version,source_order_id::text,source_quote_id,source_revision_id,source_price_version_id FROM sales_orders WHERE id=ANY($1::uuid[]) ORDER BY id ${freezeRows?'FOR SHARE':''}`,[memberIds])).rows;
 if(orders.length!==memberIds.length)throw new HttpError(404,'sales_order_not_found','Order not found');
 const foreignKeys=(await client.query(`SELECT n.nspname AS schema,c.relname AS relation,a.attname AS column FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL unnest(f.conkey) k(attnum) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum WHERE f.contype='f' AND f.confrelid='sales_orders'::regclass ORDER BY 1,2,3`)).rows as {schema:string;relation:string;column:string}[];
 const unknownReferences=foreignKeys.filter(row=>row.schema!=='public'||!NORMALIZATION_REFERENCES.some(([table,column])=>table===row.relation&&column===row.column)).map(row=>`${row.schema}.${row.relation}.${row.column}`);
 let bytes=0,rowCount=0;const references:FullReferenceDigest[]=[];
 const add=async(relation:string,column:string,sql:string)=>{
  const rows=(await client.query<{order_id:string;payload:string}>(sql,[memberIds,limits.maxRows+1])).rows;
  rowCount+=rows.length;for(const row of rows)bytes+=Buffer.byteLength(row.payload);
  if(rowCount>limits.maxRows||bytes>limits.maxBytes)fail('normalization_full_inventory_limit');
  for(const orderId of memberIds){const content=rows.filter(row=>row.order_id===orderId).map(row=>row.payload).sort();references.push({relation,column,orderId,count:content.length,fingerprint:normalizationHash(content)});}
 };
 const availableReferences=await normalizationReferences(client);
 for(const [table,column] of availableReferences)await add(table,column,`SELECT ref.${column}::text AS order_id,to_jsonb(ref)::text AS payload FROM ${table} ref WHERE ref.${column}=ANY($1::uuid[]) ORDER BY payload LIMIT $2 ${freezeRows?'FOR SHARE OF ref':''}`);
 // A registered command may still be pending with no receipt. Its fixed plan
 // reference must invalidate old evidence too; only digests leave this reader.
 if(availableReferences.some(([table])=>table==='order_sale_adjustment_receipts'))await add('order_sale_adjustment_operations','planned_order',`SELECT item->>'salesOrderId' AS order_id,to_jsonb(op)::text AS payload FROM order_sale_adjustment_operations op CROSS JOIN LATERAL jsonb_array_elements(op.command_plan) item WHERE item->>'salesOrderId'=ANY($1::text[]) ORDER BY payload LIMIT $2 ${freezeRows?'FOR SHARE OF op':''}`);
 if(availableReferences.some(([table])=>table==='production_schedule_assignments')){
  await add('production_schedule_resource_snapshots','adopted_plan',`SELECT a.sales_order_id::text AS order_id,to_jsonb(s)::text AS payload FROM production_schedule_assignments a JOIN production_schedule_resource_snapshots s ON s.hash=a.resource_snapshot_hash WHERE a.sales_order_id=ANY($1::uuid[]) ORDER BY payload LIMIT $2 ${freezeRows?'FOR SHARE OF a,s':''}`);
  await add('production_schedule_resource_snapshots','historical_plan',`SELECT v.sales_order_id::text AS order_id,to_jsonb(s)::text AS payload FROM production_schedule_plan_versions v JOIN production_schedule_resource_snapshots s ON s.hash=v.snapshot->>'resource_snapshot_hash' WHERE v.sales_order_id=ANY($1::uuid[]) ORDER BY payload LIMIT $2 ${freezeRows?'FOR SHARE OF v,s':''}`);
  await add('production_schedule_commands','scoped_plan',`SELECT link.sales_order_id::text AS order_id,to_jsonb(command)::text AS payload FROM production_schedule_command_orders link JOIN production_schedule_commands command ON command.actor_id=link.actor_id AND command.request_id=link.request_id WHERE link.sales_order_id=ANY($1::uuid[]) ORDER BY payload LIMIT $2 ${freezeRows?'FOR SHARE OF link,command':''}`);
  await add('production_group_plan_heads','plan_queue',`SELECT a.sales_order_id::text AS order_id,to_jsonb(h)::text AS payload FROM production_schedule_assignments a JOIN production_group_plan_heads h ON h.production_group_id=a.production_group_id WHERE a.sales_order_id=ANY($1::uuid[]) ORDER BY payload LIMIT $2 ${freezeRows?'FOR SHARE OF a,h':''}`);
 }
 if(availableReferences.some(([table])=>table==='production_schedule_executions'))await add('production_schedule_execution_epochs','execution_fence',`SELECT a.sales_order_id::text AS order_id,to_jsonb(e)::text AS payload FROM production_schedule_assignments a JOIN production_schedule_execution_epochs e ON e.assignment_id=a.id WHERE a.sales_order_id=ANY($1::uuid[]) ORDER BY payload LIMIT $2 ${freezeRows?'FOR SHARE OF a,e':''}`);
 await add('sales_order_preparation_commercial_refs','reference_order',`SELECT p.reference_order_id::text AS order_id,to_jsonb(ref)::text AS payload FROM sales_order_preparation_commercial_refs ref JOIN sales_order_preparations p ON p.id=ref.preparation_id WHERE p.reference_order_id=ANY($1::uuid[]) ORDER BY payload LIMIT $2 ${freezeRows?'FOR SHARE OF ref,p':''}`);
 await add('sales_order_preparation_commercial_refs','adopted_order',`SELECT a.sales_order_id::text AS order_id,to_jsonb(ref)::text AS payload FROM sales_order_preparation_commercial_refs ref JOIN sales_order_preparation_adoptions a ON a.preparation_id=ref.preparation_id WHERE a.sales_order_id=ANY($1::uuid[]) ORDER BY payload LIMIT $2 ${freezeRows?'FOR SHARE OF ref,a':''}`);
 await add('confirmed_commercial_terms','linked_order',`SELECT link.sales_order_id::text AS order_id,to_jsonb(terms)::text AS payload FROM confirmed_commercial_terms_sales_orders link JOIN confirmed_commercial_terms terms ON terms.id=link.confirmed_commercial_terms_id WHERE link.sales_order_id=ANY($1::uuid[]) ORDER BY payload LIMIT $2 ${freezeRows?'FOR SHARE OF terms,link':''}`);
 await add('operation_logs','declared_order_reference',`SELECT COALESCE(CASE WHEN log.entity_id=ANY($1::text[]) THEN log.entity_id END,CASE WHEN log.before_data->>'orderId'=ANY($1::text[]) THEN log.before_data->>'orderId' END,log.after_data->>'orderId') AS order_id,to_jsonb(log)::text AS payload FROM operation_logs log WHERE log.entity_type NOT IN ('OrderNormalizationCase','OrderNormalizationReview','OrderAttributionChange') AND (log.entity_id=ANY($1::text[]) OR log.before_data->>'orderId'=ANY($1::text[]) OR log.after_data->>'orderId'=ANY($1::text[])) ORDER BY payload LIMIT $2 ${freezeRows?'FOR SHARE OF log':''}`);
 const contracts=(await client.query(`SELECT link.sales_order_id::text,link.external_id,link.sales_contract_no,mirror.source_hash FROM sales_order_source_links link JOIN ainuoke_sales_order_contract_mirrors mirror ON mirror.sales_order_id=link.sales_order_id AND mirror.source_id=link.external_id AND mirror.sales_contract_no=link.sales_contract_no WHERE link.sales_order_id=ANY($1::uuid[]) AND link.source_system='ainuoke' AND link.source_entity_type='sales_contract' ORDER BY link.sales_order_id,link.external_id`,[memberIds])).rows;
 const batches=(await client.query('SELECT sales_order_id::text,batch_id::text FROM processing_order_batch_consumptions WHERE sales_order_id=ANY($1::uuid[]) ORDER BY sales_order_id',[memberIds])).rows;
 // Current lineage is recomputed after the proposed effective mapping. No alias may become its own ancestor.
 const lineage=(await client.query('SELECT profile.sales_order_id::text,profile.reference_order_id::text,profile.version FROM sales_order_identity_profiles profile WHERE profile.reference_order_id IS NOT NULL ORDER BY profile.sales_order_id LIMIT 100001')).rows as {sales_order_id:string;reference_order_id:string;version:number}[];
 const currentIdentities=(await client.query('SELECT original_order_id::text,effective_order_id::text,attribution_change_id::text,attribution_version FROM sales_order_effective_identities ORDER BY original_order_id LIMIT 100001')).rows as {original_order_id:string;effective_order_id:string;attribution_change_id:string|null;attribution_version:number}[];
 if(lineage.length>100000||currentIdentities.length>100000)fail('normalization_full_inventory_limit');
 const effective=new Map(currentIdentities.map(row=>[row.original_order_id,row.effective_order_id]));for(const row of proposal.assignments)effective.set(row.originalOrderId,row.effectiveOrderId);
 const edges=new Map(lineage.filter(row=>effective.get(row.sales_order_id)===row.sales_order_id).map(row=>[row.sales_order_id,effective.get(row.reference_order_id)??row.reference_order_id]));
 // Only paths reachable from proposed effective roots can acquire a lineage cycle.
 // Unrelated SO creation must not invalidate every outstanding review. A missing
 // profile is still a dependency, so later adding a relevant leaf edge changes it.
 const identityById=new Map(currentIdentities.map(row=>[row.original_order_id,row]));
 const profileById=new Map(lineage.map(row=>[row.sales_order_id,row]));
 const dependencies=new Map<string,unknown>();
 for(const root of new Set(proposal.assignments.map(row=>row.effectiveOrderId))){
  const visited=new Set<string>();let id:string|undefined=root;
  while(id&&!visited.has(id)){
   visited.add(id);const profile=effective.get(id)===id?profileById.get(id):undefined;
   const reference=profile?.reference_order_id??null;
   dependencies.set(id,{orderId:id,identity:identityById.get(id)??null,lineage:profile??null,referenceIdentity:reference?identityById.get(reference)??null:null,proposedReferenceOrderId:reference?effective.get(reference)??reference:null});
   id=edges.get(id);
  }
 }
 const lineageHash=normalizationHash({scope:'proposed-root-reference-chains-v1',dependencies:[...dependencies].sort(([a],[b])=>a.localeCompare(b)).map(([,row])=>row)});
 const blockers:string[]=[];
 for(const root of new Set(proposal.assignments.map(row=>row.effectiveOrderId))){const visited=new Set<string>();let id:string|undefined=root;while(id&&edges.has(id)){if(visited.has(id)){blockers.push('lineage_cycle_after_attribution');break;}visited.add(id);id=edges.get(id);}}
 if(unknownReferences.length)blockers.push('unclassified_references');
 if(external.coverage==='unavailable')blockers.push('production_finance_coverage_unavailable');
 if(proposal.changeType==='normalize'&&(contracts.length!==1||batches.length))blockers.push('normalization_requires_one_trusted_contract_identity');
 for(const batch of batches)if(effective.get(batch.sales_order_id)!==batch.sales_order_id)blockers.push('independent_processing_batch_cannot_be_aliased');
 for(const root of new Set(proposal.assignments.map(row=>row.effectiveOrderId))){const ids=memberIds.filter(id=>effective.get(id)===root);if(new Set(contracts.filter(row=>ids.includes(row.sales_order_id)).map(row=>row.external_id)).size>1)blockers.push('distinct_contracts_cannot_share_effective_order');if(batches.some(row=>ids.includes(row.sales_order_id))&&contracts.some(row=>ids.includes(row.sales_order_id)))blockers.push('processing_contract_identity_conflict');if(orders.find(row=>row.id===root)?.lifecycle_state==='cancelled')blockers.push('cancelled_effective_order');}
 const executed=external.coverage==='frozen_adapter_inventory'?external.orders.filter(row=>row.executionCount>0):[];
 if(proposal.changeType==='normalize'&&executed.length===1&&effective.get(executed[0].id)!==executed[0].id)blockers.push('executed_order_must_remain_effective');
 if(proposal.changeType==='normalize'&&executed.length===0&&external.coverage==='frozen_adapter_inventory'&&contracts.length===1&&effective.get(contracts[0].sales_order_id)!==contracts[0].sales_order_id)blockers.push('unexecuted_normalization_prefers_trusted_contract');
 const requiredReviews:('production'|'finance')[]=[];
 if(executed.length)requiredReviews.push('production');
 if(orders.some(row=>row.lifecycle_state==='completed')||external.coverage==='frozen_adapter_inventory'&&external.orders.some(row=>row.financialCount>0))requiredReviews.push('finance');
 const content={schemaVersion:'order-normalization-full-evidence.v1',caseId,caseVersion:currentCase.version,targetFingerprint,proposalHash:normalizationHash(proposal),memberIds,orders,currentGroups:groups,contracts,batches,references,unknownReferences,external,requiredReviews,blockers:[...new Set(blockers)],lineageHash,hashScope:'all-bounded-declared-server-reference-rows-and-locked-adapter-inventory'};
 return {...content,evidenceHash:normalizationHash(content),metrics:{rows:rowCount,bytes},executionAuthorized:false as const};
}
export type FullNormalizationEvidence=Awaited<ReturnType<typeof collectFullNormalizationEvidence>>;

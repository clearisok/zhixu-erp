import type {PoolClient} from 'pg';
import {createHash} from 'node:crypto';

// One-off Issue174 schema-0060 selection. This is intentionally not a generic migration platform.
const reduced=new Set(['ainuoke_source_runs','ainuoke_material_source_snapshots','ainuoke_contract_observations','ainuoke_catalog_runs',
 'ainuoke_catalog_capture_evidence','ainuoke_catalog_evidence_chunks','ainuoke_sync_jobs','ainuoke_sync_capture_attempts',
 'ainuoke_sync_audit_batches','ainuoke_sync_audit_tables','ainuoke_sync_audit_events','ainuoke_catalog_diagnostics','ainuoke_catalog_scan_pages']);
export const sqlName=(value:string)=>{if(!/^[a-z][a-z0-9_]*$/.test(value))throw new Error('unexpected SQL identifier');return '"'+value+'"';};
export type SelectionTable={name:string;pk:string[];columns:string[];keep:Set<string>|null};
type ForeignKey={child:string;parent:string;child_columns:string[];parent_columns:string[]};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const key=(table:SelectionTable,alias:string)=>`jsonb_build_array(${table.pk.map(c=>`${alias}.${sqlName(c)}::text`).join(',')})::text`;
const filter=(table:SelectionTable,alias:string,parameter=1)=>table.keep===null?'true':`${key(table,alias)}=ANY($${parameter}::text[])`;
export const selectionFilter=(table:SelectionTable,alias='t')=>({sql:filter(table,alias),values:table.keep===null?[]:[[...table.keep]]});

/** Source connection MUST already own a REPEATABLE READ READ ONLY transaction. */
export async function selectLegacyStorage(source:PoolClient){
 if((await source.query('SHOW transaction_read_only')).rows[0].transaction_read_only!=='on')throw new Error('selection source must be read-only');
 const metadata=(await source.query(`SELECT c.relname AS name,
  ARRAY(SELECT a.attname::text FROM pg_constraint p CROSS JOIN LATERAL unnest(p.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.num WHERE p.conrelid=c.oid AND p.contype='p' ORDER BY k.ord) AS pk,
  ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='' ORDER BY a.attnum) AS columns,
  ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.atttypid='uuid'::regtype AND (a.attname IN ('id','request_id') OR a.attnum=ANY(coalesce((SELECT conkey FROM pg_constraint WHERE conrelid=c.oid AND contype='p'),'{}'::smallint[])))) AS uuid_keys
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`)).rows;
 const unexpectedKeys=metadata.filter(row=>!row.pk.length&&row.name!=='quote_master_default_trim_configs');
 if(metadata.length!==145||unexpectedKeys.length)throw new Error(`expected audited schema-0060 inventory and known keys; actual tables=${metadata.length}, missing keys=${unexpectedKeys.map(row=>row.name).join(',')}; reconcile unknown schema`);
 // Names/columns/keys are also checked against a fresh 0060 migration by the integration test.
 const inventoryHash=createHash('sha256').update(JSON.stringify(metadata.map(row=>[row.name,row.pk,row.columns]))).digest('hex');
 if(inventoryHash!=='28c6a4045851354398fab3c05c77e961c5fad46e4fd36e6fae5e83e5290e2e66')throw new Error('unknown schema columns or identities; hold migration');
 const tables=new Map<string,SelectionTable>(metadata.map(row=>[row.name,{...row,keep:reduced.has(row.name)?new Set<string>():null}]));
 const fks=(await source.query(`SELECT child.relname AS child,parent.relname AS parent,
  ARRAY(SELECT a.attname::text FROM unnest(f.conkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attnum=k.num ORDER BY k.ord) AS child_columns,
  ARRAY(SELECT a.attname::text FROM unnest(f.confkey) WITH ORDINALITY k(num,ord) JOIN pg_attribute a ON a.attrelid=f.confrelid AND a.attnum=k.num ORDER BY k.ord) AS parent_columns
  FROM pg_constraint f JOIN pg_class child ON child.oid=f.conrelid JOIN pg_class parent ON parent.oid=f.confrelid
  JOIN pg_namespace n ON n.oid=child.relnamespace WHERE f.contype='f' AND n.nspname='public'`)).rows as ForeignKey[];
 for(const fk of fks)if(!tables.has(fk.child)||!tables.has(fk.parent))throw new Error('unknown cross-schema foreign key; hold migration');
 let added=0;
 const take=async(name:string,condition:string,values:unknown[]=[])=>{
  const table=tables.get(name);if(!table||table.keep===null)return;
  const rows=(await source.query(`SELECT ${key(table,'t')} AS k FROM public.${sqlName(name)} t WHERE ${condition}`,values)).rows;
  for(const row of rows)if(!table.keep.has(row.k)){table.keep.add(row.k);added++;}
 };
 const takeIds=async(name:string,ids:unknown[])=>{
  const wanted=[...new Set(ids.filter(v=>v!==null&&v!==undefined))];
  if(wanted.some(v=>!uuid(v)))throw new Error('unknown logical reference format; hold migration');
  if(wanted.length){
   const present=(await source.query(`SELECT count(*)::int n FROM public.${sqlName(name)} WHERE id=ANY($1::uuid[])`,[wanted])).rows[0].n;
   if(present!==wanted.length)throw new Error('missing logical source reference; hold migration');
   await take(name,'t.id=ANY($1::uuid[])',[wanted]);
  }
 };
 const selected=async(name:string,projection:string)=>{
  const table=tables.get(name)!;return(await source.query(`SELECT ${projection} FROM public.${sqlName(name)} t WHERE ${filter(table,'t')}`,table.keep===null?[]:[[...table.keep]])).rows;
 };
 await take('ainuoke_sync_jobs',"t.status IN ('queued','running','unknown','failed') OR EXISTS(SELECT 1 FROM public.ainuoke_sync_requests r WHERE r.job_id=t.id)");
 await take('ainuoke_sync_audit_batches',"t.status NOT IN ('success','replayed')");
 // In-flight/unknown publication has no trusted commit receipt: hold its entire
 // contract. Ordinary queued and proven failed attempts retain their exact job,
 // capture, retry chain, result references and current facts through the closure;
 // they do not make every older successful refresh a business dependency.
 await take('ainuoke_material_source_snapshots',`EXISTS(SELECT 1 FROM public.ainuoke_sync_jobs j WHERE j.sales_contract_no=t.sales_contract_no AND j.status IN ('running','unknown'))`);
 await take('ainuoke_contract_observations',`EXISTS(SELECT 1 FROM public.ainuoke_sync_jobs j WHERE j.source_key=t.source_key AND j.source_id=t.source_id AND j.status IN ('running','unknown'))`);
 await take('ainuoke_catalog_scan_pages',`EXISTS(SELECT 1 FROM public.ainuoke_catalog_requests r WHERE r.source_key=t.source_key AND r.request_id=t.request_id AND r.status IN ('running','unknown','failed')) OR EXISTS(SELECT 1 FROM public.ainuoke_catalog_scan_state s WHERE s.source_key=t.source_key AND s.last_request_id=t.request_id)`);
 // Completed formal attribution/review facts retain original evidence sets for their orders.
 const proofOrders=(await source.query(`SELECT DISTINCT jsonb_path_query(proposal,'$.assignments[*].originalOrderId') #>> '{}' AS id FROM public.sales_order_normalization_proofs`)).rows.map(r=>r.id);
 if(proofOrders.some(id=>!uuid(id)))throw new Error('unknown normalization proof scope; hold migration');
 if(proofOrders.length){
  await take('ainuoke_material_source_snapshots','t.sales_order_id=ANY($1::uuid[])',[proofOrders]);
  await take('ainuoke_contract_observations',`EXISTS(SELECT 1 FROM public.sales_order_source_links l WHERE l.sales_order_id=ANY($1::uuid[]) AND l.source_system='ainuoke' AND l.external_id=t.source_id)`,[proofOrders]);
 }
 // Old intake receipts lack observation_id: conservatively preserve the original order contracts' observations.
 await take('ainuoke_contract_observations',`EXISTS(SELECT 1 FROM public.ainuoke_catalog_intake_receipts r CROSS JOIN LATERAL jsonb_array_elements_text(r.result->'orderIds') id JOIN public.sales_order_source_links l ON l.sales_order_id::text=id.value WHERE l.source_system='ainuoke' AND l.external_id=t.source_id)`);
 for(const [name,column] of [['material_arrival_plan_versions','snapshot'],['material_arrival_commands','command'],['material_arrival_commands','result']] as const){
  const refs=(await source.query(`SELECT jsonb_path_query(${sqlName(column)},'$.**.runId') #>> '{}' AS id FROM public.${sqlName(name)}`)).rows.map(r=>r.id);
  await takeIds('ainuoke_source_runs',refs);
 }
 // The archive importer deliberately does not manufacture an observation row.
 // Its paired immutable operation binds the external archive UUID/hash to the saved run.
 // Only that exact known provenance is exempt from a database-observation reference.
 await takeIds('ainuoke_contract_observations',(await source.query(`SELECT l.metadata->>'historicalObservationId' AS id FROM public.operation_logs l
  WHERE l.metadata ? 'historicalObservationId' AND NOT EXISTS(
   SELECT 1 FROM public.operation_logs a WHERE a.entity_type='AinuokeSourceRun' AND l.entity_type=a.entity_type AND a.entity_id=l.entity_id
    AND a.metadata->>'archiveObservationId'=l.metadata->>'historicalObservationId'
    AND a.metadata->>'evidenceHash' ~ '^[a-f0-9]{64}$' AND a.metadata->>'sourceRequests'='0')`)).rows.map(r=>r.id));
 await takeIds('ainuoke_source_runs',(await source.query("SELECT entity_id AS id FROM public.operation_logs WHERE entity_type='AinuokeSourceRun' AND (metadata->>'historicalPublication'='true' OR coalesce(metadata->>'sourceOnly','false')<>'true')")).rows.map(r=>r.id));
 for(let round=0;round<40;round++){
  added=0;
  for(const fk of fks){
   const parent=tables.get(fk.parent)!,child=tables.get(fk.child)!;
   if(parent.keep===null||child.keep?.size===0)continue;
   const join=fk.child_columns.map((col,i)=>`c.${sqlName(col)}=t.${sqlName(fk.parent_columns[i])}`).join(' AND ');
   await take(fk.parent,`EXISTS(SELECT 1 FROM public.${sqlName(fk.child)} c WHERE ${filter(child,'c')} AND ${join})`,child.keep===null?[]:[[...child.keep]]);
  }
  const runs=tables.get('ainuoke_source_runs')!,jobs=tables.get('ainuoke_sync_jobs')!,batches=tables.get('ainuoke_sync_audit_batches')!;
  await take('ainuoke_material_source_snapshots',`EXISTS(SELECT 1 FROM public.ainuoke_source_runs c WHERE ${filter(runs,'c')} AND c.id=t.run_id)`,[[...runs.keep!]]);
  await take('ainuoke_contract_observations',`EXISTS(SELECT 1 FROM public.ainuoke_sync_jobs c WHERE ${filter(jobs,'c')} AND c.id=t.job_id)`,[[...jobs.keep!]]);
  for(const child of ['ainuoke_sync_audit_tables','ainuoke_sync_audit_events','ainuoke_catalog_diagnostics'])await take(child,`EXISTS(SELECT 1 FROM public.ainuoke_sync_audit_batches c WHERE ${filter(batches,'c')} AND c.id=t.batch_id)`,[[...batches.keep!]]);
  const batchRows=await selected('ainuoke_sync_audit_batches','t.capture_ids,t.job_ids');
  await takeIds('ainuoke_sync_capture_attempts',batchRows.flatMap(row=>row.capture_ids));await takeIds('ainuoke_sync_jobs',batchRows.flatMap(row=>row.job_ids));
  const publicationIds:unknown[]=[];
  for(const row of await selected('ainuoke_sync_jobs','t.result')){
   let result=row.result;
   for(let depth=0;result&&depth<8;depth++,result=result.previousResult)publicationIds.push(result.publicationRunId);
  }
  await takeIds('ainuoke_source_runs',publicationIds);
  await takeIds('ainuoke_source_runs',(await source.query('SELECT result FROM public.ainuoke_material_group_requests')).rows.map(row=>row.result?.runId));
  await takeIds('ainuoke_catalog_runs',(await source.query('SELECT result FROM public.ainuoke_catalog_requests')).rows.map(row=>row.result?.runId));
  const captures=await selected('ainuoke_catalog_capture_evidence','t.source_key,t.directory');
  const bySource=new Map<string,Set<string>>();
  for(const capture of captures){
   if(capture.directory.schemaVersion!=='ainuoke-packed-directory.v1')throw new Error('unknown selected directory format; hold migration');
   const hashes=[...capture.directory.discoveryBefore,...capture.directory.discoveryAfter].map((p:{rowsHash:string})=>p.rowsHash);
   if(hashes.some(h=>!/^[a-f0-9]{64}$/.test(h)))throw new Error('invalid selected directory reference');
   const grouped=bySource.get(capture.source_key)??new Set<string>();for(const h of hashes)grouped.add(h);bySource.set(capture.source_key,grouped);
  }
  for(const [sourceKey,hashes]of bySource)await take('ainuoke_catalog_evidence_chunks','t.source_key=$1 AND t.content_hash=ANY($2::text[])',[sourceKey,[...hashes]]);
  // Audit publication IDs use several existing namespaces (orders, requests, runs, observations).
  // Preserve every matching identity in this fixed schema; an unresolved identity blocks selection.
  const auditIds=[...new Set((await selected('ainuoke_sync_audit_tables','t.publication_ids')).flatMap(row=>row.publication_ids))] as unknown[];
  if(auditIds.some(id=>!uuid(id)))throw new Error('unknown audit publication namespace; hold migration');
  const missing=new Set(auditIds as string[]);
  if(missing.size)for(const row of metadata){
   if(!row.uuid_keys.length)continue;
   const columns=row.uuid_keys as string[];
   const matches=(await source.query(`SELECT ${key(tables.get(row.name)!,'t')} AS k,${columns.map(c=>'t.'+sqlName(c)+'::text AS '+sqlName(c)).join(',')} FROM public.${sqlName(row.name)} t WHERE ${columns.map(c=>'t.'+sqlName(c)+'=ANY($1::uuid[])').join(' OR ')}`,[auditIds])).rows;
   for(const match of matches){for(const column of columns)missing.delete(match[column]);const keep=tables.get(row.name)!.keep;if(keep&&!keep.has(match.k)){keep.add(match.k);added++;}}
  }
  if(missing.size)throw new Error('unresolved audit publication identity; hold migration');
  if(added===0)return tables;
 }
 throw new Error('selection closure did not converge; hold migration');
}

/** Opaque PostgreSQL JSON text preserves arbitrary numeric precision; never parse business payloads in JS. */
export async function copySelectedRows(source:PoolClient,target:PoolClient,tables:Map<string,SelectionTable>,onTable?:(name:string,count:number)=>Promise<void>){
 for(const table of tables.values()){
  const destination=(await target.query(`SELECT count(*)::int n FROM public.${sqlName(table.name)}`)).rows[0].n;
  if(destination!==0)throw new Error('target is not an empty pre-data restore');
  const selection=selectionFilter(table);
  await source.query(`DECLARE issue174_copy NO SCROLL CURSOR FOR SELECT to_jsonb(t)::text AS payload FROM public.${sqlName(table.name)} t WHERE ${selection.sql}`,selection.values);
  let count=0;
  try{
   for(;;){
    const rows=(await source.query('FETCH FORWARD 32 FROM issue174_copy')).rows;
    if(!rows.length)break;
    const columns=table.columns.map(sqlName).join(',');
    await target.query(`INSERT INTO public.${sqlName(table.name)}(${columns}) OVERRIDING SYSTEM VALUE SELECT ${table.columns.map(c=>'r.'+sqlName(c)).join(',')} FROM jsonb_populate_recordset(NULL::public.${sqlName(table.name)},$1::jsonb) r`,['['+rows.map(row=>row.payload).join(',')+']']);
    count+=rows.length;
   }
  }finally{await source.query('CLOSE issue174_copy');}
  if(onTable)await onTable(table.name,count);
 }
 const sequences=(await source.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S' ORDER BY c.relname")).rows;
 for(const sequence of sequences){
  const state=(await source.query(`SELECT last_value::text,is_called FROM public.${sqlName(sequence.relname)}`)).rows[0];
  await target.query('SELECT setval($1::regclass,$2::bigint,$3::boolean)',['public.'+sequence.relname,state.last_value,state.is_called]);
 }
}

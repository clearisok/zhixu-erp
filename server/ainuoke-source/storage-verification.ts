import type {PoolClient,QueryResultRow} from 'pg';
import {hash} from './contract.js';
import {hydrateContractEvidence,hydrateSourceDirectory} from './catalog-evidence.js';
import {hydrateSharedPages} from './shared-content.js';
import {selectionFilter,sqlName,type SelectionTable} from './storage-selection.js';

export type SelectedInventory={name:string;columns:string[];pk:string[];sourceCount:number;selectedCount:number;keepKeys:string[]|null};
/** Read-only comparison against the same restored backup, never the live source.
 * PostgreSQL hashes business JSON before it crosses JavaScript's numeric boundary.
 * Only the explicitly converted representation fields are hydrated separately. */
export async function verifySelectedStorage(source:PoolClient,target:PoolClient,inventory:SelectedInventory[]){
 const outcomes=[];
 const representation:Record<string,string[]>={ainuoke_source_runs:['discovery'],ainuoke_material_source_snapshots:['snapshots'],ainuoke_contract_observations:['evidence','content_hash','capture_evidence_id'],ainuoke_catalog_runs:['discovery']};
 for(const table of inventory){
  const chosen:SelectionTable={...table,keep:table.keepKeys===null?null:new Set(table.keepKeys)},filter=selectionFilter(chosen);
  if(table.name==='schema_migrations')filter.sql='t.version<=60';
  const columns=table.columns.filter(c=>!representation[table.name]?.includes(c));
  // MATERIALIZED keeps the sort to 64-byte hashes, not detoasted source rows.
  const sql=`WITH hashes AS MATERIALIZED (SELECT encode(digest(to_jsonb(r)::text,'sha256'),'hex') h FROM (SELECT ${columns.map(c=>'t.'+sqlName(c)).join(',')} FROM public.${sqlName(table.name)} t WHERE ${filter.sql}) r)
   SELECT count(*)::text n,encode(digest(coalesce(string_agg(h,'' ORDER BY h),''),'sha256'),'hex') digest FROM hashes`;
  const expected=(await source.query(sql,filter.values)).rows[0],actual=(await target.query(sql,filter.values)).rows[0];
  if(expected.n!==String(table.selectedCount)||actual.n!==expected.n||actual.digest!==expected.digest)throw new Error('selected row identity/content mismatch: '+table.name);
  if(!['schema_migrations','ainuoke_catalog_capture_evidence','ainuoke_catalog_evidence_chunks'].includes(table.name)){
   const total=(await target.query(`SELECT count(*)::text n FROM public.${sqlName(table.name)}`)).rows[0].n;
   if(total!==actual.n)throw new Error('unexpected extra target rows: '+table.name);
  }
  outcomes.push({table:table.name,rows:Number(actual.n),mode:table.keepKeys===null?'all_business_rows_exact':'selected_rows_exact',representationCheckedSeparately:!!representation[table.name]});
 }
 const scan=async(query:string,visit:(row:QueryResultRow)=>Promise<void>)=>{
  await target.query('DECLARE issue174_verify NO SCROLL CURSOR FOR '+query);
  try{for(;;){const rows=(await target.query('FETCH FORWARD 16 FROM issue174_verify')).rows;if(!rows.length)break;for(const row of rows)await visit(row);}}
  finally{await target.query('CLOSE issue174_verify');}
 };
 let runs=0,snapshots=0,observations=0,catalogs=0;
 await scan('SELECT * FROM public.ainuoke_source_runs ORDER BY id',async r=>{
  if(hash(await hydrateSourceDirectory(target,r.source_key,r.discovery))!==r.discovery_hash)throw new Error('run original directory hash mismatch');runs++;
 });
 await scan('SELECT s.*,r.source_key,p.account_fingerprint FROM public.ainuoke_material_source_snapshots s JOIN public.ainuoke_source_runs r ON r.id=s.run_id JOIN public.ainuoke_source_profiles p USING(source_key) ORDER BY s.run_id,s.sales_order_id',async r=>{
  if(hash(await hydrateSharedPages(target,r.source_key,r.snapshots,{accountFingerprint:r.account_fingerprint,contract:r.sales_contract_no,kind:'materials'}))!==r.content_hash)throw new Error('material original capture hash mismatch');snapshots++;
 });
 await scan('SELECT o.*,p.account_fingerprint FROM public.ainuoke_contract_observations o JOIN public.ainuoke_source_profiles p USING(source_key) ORDER BY o.id',async r=>{
  await hydrateContractEvidence(target,r as Parameters<typeof hydrateContractEvidence>[1]);
  const original=(await source.query('SELECT content_hash,capture_evidence_id FROM public.ainuoke_contract_observations WHERE id=$1',[r.id])).rows[0];
  if(!original||r.evidence.legacyProof?.contentHash!==original.content_hash||original.capture_evidence_id&&r.capture_evidence_id!==original.capture_evidence_id)throw new Error('observation original provenance mismatch');observations++;
 });
 await scan('SELECT * FROM public.ainuoke_catalog_runs WHERE capture_evidence_id IS NULL ORDER BY id',async r=>{
  const pages=await hydrateSourceDirectory(target,r.source_key,r.discovery);
  const original=(await source.query('SELECT discovery FROM public.ainuoke_catalog_runs WHERE id=$1',[r.id])).rows[0];
  if(hash(pages)!==hash(original.discovery))throw new Error('catalog original capture mismatch');catalogs++;
 });
 const sequences=(await source.query("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S' ORDER BY c.relname")).rows;
 for(const row of sequences){const q=`SELECT last_value::text,is_called FROM public.${sqlName(row.relname)}`;if(JSON.stringify((await source.query(q)).rows)!==JSON.stringify((await target.query(q)).rows))throw new Error('sequence value mismatch: '+row.relname);}
 const invalid=(await target.query("SELECT count(*)::int n FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated")).rows[0].n;
 if(invalid)throw new Error('unvalidated target constraints');
 if((await target.query("SELECT 1 FROM pg_roles WHERE rolname='issue174_offline_converter'")).rowCount)throw new Error('temporary converter role remains');
 const cleanup=(await target.query('SELECT count(*)::int n FROM public.ainuoke_sync_controls WHERE storage_cleanup_enabled')).rows[0].n;
 if(cleanup)throw new Error('target cleanup must remain disabled');
 return {state:'SELECTED_BUSINESS_AND_PROVENANCE_VERIFIED',tables:outcomes,sequencesExact:sequences.length,originalCaptureHashes:{runs,snapshots,observations,catalogs},constraintsValidated:true,cleanupEnabled:false,sourceWrites:0,sourceRequests:0};
}

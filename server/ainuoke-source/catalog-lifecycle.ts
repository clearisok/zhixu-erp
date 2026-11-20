import type {PoolClient} from 'pg';
import {previewCatalog} from './catalog.js';
import {loadCatalogEvidence} from './catalog-evidence.js';
import {hash,SourceError} from './contract.js';
import type {AdditionDiscoveryBundle} from './additions.js';

/** Extra lifecycle boundary over the existing full-directory validator. Page
 * size, schema/report and empty query scope must agree in both passes. */
export function lifecycleScope(bundle:AdditionDiscoveryBundle):string {
 const all=[...bundle.discoveryBefore,...bundle.discoveryAfter],first=all[0];
 if(!first)throw new SourceError('catalog_lifecycle_evidence_invalid');
 const scope=(p:typeof first)=>({schema:p.schemaVersion,report:p.reportId,query:p.queryContext,pageSize:p.pageSize});
 const digest=hash(scope(first));
 if(all.some(p=>hash(scope(p))!==digest)||first.reportId!=='6086103'||Object.keys(first.queryContext).length)
  throw new SourceError('catalog_lifecycle_scope_changed');
 return digest;
}

/** Runs in the catalogue publication transaction, under its source lock. Only
 * the authenticated, fresh catalog-discovery path calls this (never materials,
 * selected contracts, failed/resumed captures or migration/backfill).
 * Business matching is exact normalized BillNo; source id only cross-checks it.
 */
export async function reconcileCatalogLifecycle(c:PoolClient,sourceKey:string,fingerprint:string,
 runId:string,current:Awaited<ReturnType<typeof previewCatalog>>) {
 const scope=lifecycleScope(current.bundle);
 const entries=(await c.query(`SELECT e.*,r.account_fingerprint,r.captured_at AS previously_seen_at
  FROM ainuoke_catalog_entries e JOIN ainuoke_catalog_runs r ON r.source_key=e.source_key AND r.id=e.observed_run_id
  WHERE e.source_key=$1 ORDER BY e.sales_contract_no FOR UPDATE OF e`,[sourceKey])).rows;
 const oldProofs=new Map<string,Awaited<ReturnType<typeof previewCatalog>>>();
 const currentByContract=new Map(current.rows.map(r=>[r.salesContractNo,r]));
 let deleted=0,restored=0;
 for(const entry of entries){
  const row=currentByContract.get(entry.sales_contract_no),isDeleted=entry.source_lifecycle_state==='source_deleted';
  if(Boolean(row)===!isDeleted)continue;
  if(row&&row.sourceId!==entry.source_id)throw new SourceError('catalog_identity_changed');
  // Do not confuse a different account, old publication or unproved legacy row
  // with deletion. These rows retain their prior lifecycle, not a default PASS.
  if(entry.account_fingerprint!==fingerprint||Date.parse(current.capturedAt)<new Date(entry.previously_seen_at).getTime())continue;
  let prior=oldProofs.get(entry.observed_run_id);
  if(!prior){
   const run=(await c.query('SELECT * FROM ainuoke_catalog_runs WHERE source_key=$1 AND id=$2',[sourceKey,entry.observed_run_id])).rows[0];
   // A legacy after-only receipt cannot be expanded into two historical reads.
   if(!run.capture_evidence_id)continue;
   const input=await loadCatalogEvidence(c,sourceKey,run.capture_evidence_id,fingerprint);
   prior=await previewCatalog(input,new Date(run.captured_at).getTime());
   if(prior.contentHash!==run.content_hash)throw new SourceError('catalog_lifecycle_evidence_invalid');
   oldProofs.set(entry.observed_run_id,prior);
  }
  if(lifecycleScope(prior.bundle)!==scope)throw new SourceError('catalog_lifecycle_scope_changed');
  if(!prior.rows.some(r=>r.salesContractNo===entry.sales_contract_no&&r.sourceId===entry.source_id))
   throw new SourceError('catalog_lifecycle_evidence_invalid');
  // No local order / ambiguous association means no deletion classification.
  const links=(await c.query(`SELECT sales_order_id,external_id FROM sales_order_source_links
   WHERE source_system='ainuoke' AND source_entity_type='sales_contract' AND sales_contract_no=$1`,[entry.sales_contract_no])).rows;
  if(links.length!==1||links[0].external_id!==entry.source_id)continue;
  const latest=(await c.query(`SELECT confirmed_at FROM ainuoke_contract_lifecycle_events
   WHERE source_key=$1 AND source_id=$2 ORDER BY version DESC LIMIT 1`,[sourceKey,entry.source_id])).rows[0];
  if(latest&&Date.parse(current.capturedAt)<new Date(latest.confirmed_at).getTime())continue;
  const event=row?'source_restored':'source_deleted',version=entry.lifecycle_version+1;
  await c.query(`INSERT INTO ainuoke_contract_lifecycle_events(source_key,source_id,sales_contract_no,account_fingerprint,
   version,event_type,previous_seen_run_id,confirmed_run_id,confirmed_at,evidence)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
   [sourceKey,entry.source_id,entry.sales_contract_no,fingerprint,version,event,entry.observed_run_id,runId,current.capturedAt,
    JSON.stringify({reportId:'6086103',scopeHash:scope,beforePages:current.bundle.discoveryBefore.length,afterPages:current.bundle.discoveryAfter.length,
     contentHash:current.contentHash,previousContentHash:prior.contentHash,presentInBothPasses:Boolean(row)})]);
  await c.query(`UPDATE ainuoke_catalog_entries SET source_lifecycle_state=$3,source_deleted_at=$4,lifecycle_version=$5
   WHERE source_key=$1 AND source_id=$2`,[sourceKey,entry.source_id,row?'present':'source_deleted',row?null:current.capturedAt,version]);
  if(row)restored++;else deleted++;
 }
 return {deleted,restored};
}

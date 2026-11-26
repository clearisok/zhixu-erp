import type {PoolClient,QueryResultRow} from 'pg';
import {hash,SourceError,sourceIdText,type SourceBundle} from './contract.js';
import {hydrateContractEvidence,hydrateSourceDirectory,saveCatalogEvidence,saveLegacyDirectoryAfter} from './catalog-evidence.js';
import {businessDigest,hydrateSharedPages,packContent,saveSharedPages,type ContentScope} from './shared-content.js';
import {normalizeAinuokeSalesContractNo} from '../../features/ainuoke-sync/source/ainuoke-garment-color-size-adapter.js';

const converter='issue174_offline_converter';
/** Only an isolated selected restore; no trigger disabling, replication GUC, source write or business-ID replacement. */
export async function convertSelectedStorage(c:PoolClient,historyStart:Date){
 const database=(await c.query('SELECT current_database() AS name')).rows[0].name;
 if(!/^issue174_selected_[a-z0-9_]+$/.test(database)||!Number.isFinite(historyStart.getTime()))throw new Error('offline conversion target identity rejected');
 const counts={runs:0,snapshots:0,observations:0,catalogDirectories:0};
 await c.query('BEGIN');
 try{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['issue174-offline-conversion']);
  if((await c.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[converter])).rowCount)throw new Error('offline converter role already exists; reconcile partial rehearsal');
  await c.query(`CREATE ROLE ${converter} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  await c.query(`GRANT USAGE ON SCHEMA public TO ${converter}`);
  await c.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${converter}`);
  await c.query(`GRANT INSERT ON ainuoke_contract_contents,ainuoke_catalog_evidence_chunks,ainuoke_catalog_capture_evidence TO ${converter}`);
  await c.query(`GRANT UPDATE ON ainuoke_source_runs,ainuoke_material_source_snapshots,ainuoke_contract_observations,ainuoke_catalog_runs TO ${converter}`);
  await c.query(`GRANT UPDATE(verified_capture_id,verified_material_manifest,last_verified_at) ON ainuoke_material_order_heads TO ${converter}`);
  const originals=[];
  for(const name of ['protect_ainuoke_source_evidence','preserve_catalog_receipt']){
   const definition=(await c.query('SELECT pg_get_functiondef($1::regprocedure) AS definition',[name+'()'])).rows[0].definition as string;
   if(!/\bBEGIN\b/i.test(definition))throw new Error('unexpected immutable guard definition');
   originals.push(definition);
   const branch=`BEGIN
 IF current_user='${converter}' AND TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME='ainuoke_source_runs' AND (to_jsonb(NEW)-ARRAY['discovery','directory_capture_id','business_hash'])=(to_jsonb(OLD)-ARRAY['discovery','directory_capture_id','business_hash']) AND to_jsonb(NEW)#>>'{discovery,0,schemaVersion}'='ainuoke-shared-directory.v1' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='ainuoke_material_source_snapshots' AND (to_jsonb(NEW)-ARRAY['snapshots','material_content_id','business_hash'])=(to_jsonb(OLD)-ARRAY['snapshots','material_content_id','business_hash']) AND to_jsonb(NEW)#>>'{snapshots,0,schemaVersion}'='ainuoke-shared-pages.v1' AND to_jsonb(NEW)#>>'{snapshots,0,captureHash}'=to_jsonb(OLD)->>'content_hash' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='ainuoke_catalog_runs' AND (to_jsonb(NEW)-ARRAY['discovery','legacy_directory_capture_id'])=(to_jsonb(OLD)-ARRAY['discovery','legacy_directory_capture_id']) AND to_jsonb(NEW)#>>'{discovery,0,schemaVersion}'='ainuoke-shared-directory.v1' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME='ainuoke_contract_observations' AND (to_jsonb(NEW)-ARRAY['evidence','content_hash','capture_evidence_id','material_content_id','color_content_id','business_hash','record_kind','permanent_hold'])=(to_jsonb(OLD)-ARRAY['evidence','content_hash','capture_evidence_id','material_content_id','color_content_id','business_hash','record_kind','permanent_hold']) AND to_jsonb(NEW)#>>'{evidence,schemaVersion}'='ainuoke-contract-observation.v3' AND to_jsonb(NEW)#>>'{evidence,legacyProof,contentHash}'=to_jsonb(OLD)->>'content_hash' AND (to_jsonb(NEW)->>'permanent_hold')::boolean AND to_jsonb(NEW)->>'record_kind'='legacy' THEN RETURN NEW; END IF;
 END IF;
`;
   await c.query(definition.replace(/\bBEGIN\b/i,branch));
  }
  await c.query(`SET ROLE ${converter}`);
  const scan=async(query:string,visit:(row:QueryResultRow)=>Promise<void>)=>{
   await c.query('DECLARE issue174_conversion NO SCROLL CURSOR FOR '+query);
   try{for(;;){const rows=(await c.query('FETCH FORWARD 16 FROM issue174_conversion')).rows;if(!rows.length)break;for(const row of rows)await visit(row);}}
   finally{await c.query('CLOSE issue174_conversion');}
  };
  await scan('SELECT r.*,p.account_fingerprint FROM ainuoke_source_runs r JOIN ainuoke_source_profiles p USING(source_key) ORDER BY r.id',async row=>{
   if(hash(row.discovery)!==row.discovery_hash)throw new SourceError('source_snapshot_changed');
   const captureId=await saveLegacyDirectoryAfter(c,row.source_key,row.account_fingerprint,row.discovery);
   const marker=[{schemaVersion:'ainuoke-shared-directory.v1',captureId}];
   if(hash(await hydrateSourceDirectory(c,row.source_key,marker))!==row.discovery_hash)throw new SourceError('conversion_directory_mismatch');
   await c.query('UPDATE ainuoke_source_runs SET discovery=$2::jsonb,directory_capture_id=$3 WHERE id=$1',[row.id,JSON.stringify(marker),captureId]);counts.runs++;
  });
  await scan('SELECT s.*,r.source_key,r.order_scope,r.directory_capture_id,p.account_fingerprint FROM ainuoke_material_source_snapshots s JOIN ainuoke_source_runs r ON r.id=s.run_id JOIN ainuoke_source_profiles p USING(source_key) ORDER BY EXISTS(SELECT 1 FROM ainuoke_material_order_heads h WHERE h.run_id=s.run_id AND h.sales_order_id=s.sales_order_id) DESC,s.run_id,s.sales_order_id',async row=>{
   if(hash(row.snapshots)!==row.content_hash)throw new SourceError('source_snapshot_changed');
   const directory=await hydrateSourceDirectory(c,row.source_key,[{schemaVersion:'ainuoke-shared-directory.v1',captureId:row.directory_capture_id}]);
   const facts=directory.flatMap(p=>p.rows).filter(r=>normalizeAinuokeSalesContractNo(r.values.BillNo)===row.sales_contract_no);
   if(facts.length!==1)throw new SourceError('conversion_source_identity_ambiguous');
   const scope:ContentScope={sourceKey:row.source_key,accountFingerprint:row.account_fingerprint,sourceId:sourceIdText(facts[0].values.id),contract:row.sales_contract_no,kind:'materials'};
   const packed=await saveSharedPages(c,scope,row.snapshots),target=row.order_scope?.find((value:{id:string})=>value.id===row.sales_order_id);
   const directoryFacts=facts.map(({sourceRowIdentity,...value})=>{void sourceRowIdentity;return value;});
   const stateHash=target?businessDigest({schemaVersion:'ainuoke-material-state.v1',target,bodyHash:packContent(scope,row.snapshots).businessHash,directoryFacts}):null;
   if(hash(await hydrateSharedPages(c,row.source_key,[packed],scope))!==row.content_hash)throw new SourceError('conversion_material_mismatch');
   await c.query('UPDATE ainuoke_material_source_snapshots SET snapshots=$3::jsonb,material_content_id=$4,business_hash=$5 WHERE run_id=$1 AND sales_order_id=$2',[row.run_id,row.sales_order_id,JSON.stringify([packed]),packed.contentId,stateHash]);counts.snapshots++;
  });
  await scan('SELECT o.*,e.sales_contract_no,p.account_fingerprint,j.result AS job_result,r.order_scope AS publication_scope FROM ainuoke_contract_observations o JOIN ainuoke_catalog_entries e USING(source_key,source_id) JOIN ainuoke_source_profiles p USING(source_key) JOIN ainuoke_sync_jobs j ON j.id=o.job_id LEFT JOIN ainuoke_source_runs r ON r.id::text=j.result->>\'publicationRunId\' ORDER BY EXISTS(SELECT 1 FROM ainuoke_contract_sync_state s WHERE s.observation_id=o.id) DESC,o.id',async row=>{
   const evidence=await hydrateContractEvidence(c,row as Parameters<typeof hydrateContractEvidence>[1]);
   const format=row.capture_evidence_id?'v2':'inline';
   if(format==='v2'&&row.evidence.schemaVersion!=='ainuoke-contract-observation.v2'||format==='inline'&&Object.keys(row.evidence).sort().join(',')!=='addition,materials')throw new SourceError('conversion_legacy_format_unsupported');
   const scope={sourceKey:row.source_key,accountFingerprint:row.account_fingerprint,sourceId:row.source_id,contract:row.sales_contract_no};
   const colors=await saveSharedPages(c,{...scope,kind:'colors'},evidence.addition.colors[row.sales_contract_no]),materials=await saveSharedPages(c,{...scope,kind:'materials'},evidence.materials);
   const captureId=row.capture_evidence_id??await saveCatalogEvidence(c,row.source_key,row.account_fingerprint,{...evidence.addition,schemaVersion:'ainuoke-order-addition-discovery.v1'});
   const next={schemaVersion:'ainuoke-contract-observation.v3',captureId,sourceId:row.source_id,contract:row.sales_contract_no,colors,materials,legacyProof:{format,contentHash:row.content_hash}};
   const target=row.publication_scope?.find((value:{id:string})=>value.id===row.job_result?.orderId)??null;
   const stateHash=businessDigest({schemaVersion:'ainuoke-contract-state.v1',scope,materials:materials.contentId,colors:colors.contentId,
    directory:evidence.addition.discoveryAfter.flatMap(p=>p.rows).filter(r=>sourceIdText(r.values.id)===row.source_id).map(r=>r.values),target});
   const originalHash=row.content_hash;
   await hydrateContractEvidence(c,{source_key:row.source_key,account_fingerprint:row.account_fingerprint,capture_evidence_id:captureId,evidence:next,content_hash:hash(next)});
   await c.query(`UPDATE ainuoke_contract_observations SET evidence=$2::jsonb,content_hash=$3,capture_evidence_id=$4,material_content_id=$5,color_content_id=$6,business_hash=$7,record_kind='legacy',permanent_hold=true WHERE id=$1`,[row.id,JSON.stringify(next),hash(next),captureId,materials.contentId,colors.contentId,stateHash]);
   if(next.legacyProof.contentHash!==originalHash)throw new Error('original observation hash changed');counts.observations++;
  });
  await scan('SELECT * FROM ainuoke_catalog_runs WHERE capture_evidence_id IS NULL ORDER BY id',async row=>{
   if(!Array.isArray(row.discovery))throw new SourceError('conversion_legacy_catalog_unsupported');
   const originalHash=hash(row.discovery),captureId=await saveLegacyDirectoryAfter(c,row.source_key,row.account_fingerprint,row.discovery as SourceBundle['discoveryAfter']);
   const marker=[{schemaVersion:'ainuoke-shared-directory.v1',captureId}];
   if(hash(await hydrateSourceDirectory(c,row.source_key,marker))!==originalHash)throw new SourceError('conversion_directory_mismatch');
   await c.query('UPDATE ainuoke_catalog_runs SET discovery=$2::jsonb,legacy_directory_capture_id=$3 WHERE id=$1',[row.id,JSON.stringify(marker),captureId]);counts.catalogDirectories++;
  });
  await c.query(`UPDATE ainuoke_material_order_heads h SET verified_capture_id=r.directory_capture_id,verified_material_manifest=s.snapshots->0,last_verified_at=r.captured_at
   FROM ainuoke_material_source_snapshots s JOIN ainuoke_source_runs r ON r.id=s.run_id WHERE h.run_id=s.run_id AND h.sales_order_id=s.sales_order_id AND h.source_key=r.source_key`);
  await c.query('RESET ROLE');
  for(const definition of originals)await c.query(definition);
  await c.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${converter}`);
  await c.query(`REVOKE UPDATE(verified_capture_id,verified_material_manifest,last_verified_at) ON ainuoke_material_order_heads FROM ${converter}`);
  await c.query(`REVOKE USAGE ON SCHEMA public FROM ${converter}`);
  await c.query(`DROP ROLE ${converter}`);
  await c.query('UPDATE ainuoke_source_profiles SET source_history_started_at=$1 WHERE source_history_started_at IS NULL',[historyStart]);
  await c.query('COMMIT');return {state:'SELECTED_STORAGE_CONVERTED',...counts,sourceWrites:0,sourceRequests:0};
 }catch(error){await c.query('ROLLBACK').catch(()=>undefined);throw error;}
}

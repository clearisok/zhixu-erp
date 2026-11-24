import {readFile,writeFile,appendFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {selectLegacyStorage,copySelectedRows,sqlName} from './storage-selection.js';
import {convertSelectedStorage} from './storage-conversion.js';
import {runMigrations} from '../db/migration-runner.js';
import {verifySelectedStorage,type SelectedInventory} from './storage-verification.js';
import {verifyMigrationsCurrent} from '../db/migration-runner.js';

async function main(){
 const phase=process.argv[2];
 if(process.env.ISSUE174_ISOLATED_REHEARSAL!=='true'||!['select-copy','convert','verify'].includes(phase))throw new Error('isolated selection command required');
 const sourceUrl=new URL(process.env.ISSUE174_SOURCE_URL??''),targetUrl=new URL(process.env.ISSUE174_TARGET_URL??'');
 if(sourceUrl.hostname!=='issue174-v2-pg-20261124'||targetUrl.hostname!==sourceUrl.hostname||sourceUrl.pathname!=='/issue174_original'||!/^\/issue174_selected_[a-z0-9_]+$/.test(targetUrl.pathname))throw new Error('target identity is outside the authorized isolated rehearsal');
 const directory=process.env.ISSUE174_EVIDENCE_DIR??'/evidence';
 const original=JSON.parse(await readFile(join(directory,'original-verification.json'),'utf8'));
 if(original.state!=='ORIGINAL_RESTORE_VERIFIED'||original.tableCount!==145||!original.sequenceMetadataExact)throw new Error('original paired restore gate has not passed');
 const objects=JSON.parse(await readFile(join(directory,'attachment-verification.json'),'utf8'));
 const expectedBackup=process.env.ISSUE174_EXPECTED_BACKUP_SHA??'0a2f9c372571ef3e81a1df681fa7b28d5752fb491a1ce4ac193f6466361bb796';
 if(!/^[a-f0-9]{64}$/.test(expectedBackup)||original.manifestSha256!==expectedBackup||objects.state!=='PAIRED_OBJECTS_VERIFIED'||!objects.databaseReferencesMatched||objects.manifestSha256!==expectedBackup)throw new Error('paired object restore gate has not passed');
 const sourcePool=new pg.Pool({connectionString:sourceUrl.toString(),max:1}),targetPool=new pg.Pool({connectionString:targetUrl.toString(),max:1});
 if(phase==='verify'){
  try{
   await verifyMigrationsCurrent(targetPool,process.env.ISSUE174_MIGRATIONS??'/database');
   const source=await sourcePool.connect(),target=await targetPool.connect(),started=Date.now();
   try{
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await target.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const selection=JSON.parse(await readFile(join(directory,'selection-private.json'),'utf8')) as {inventory:SelectedInventory[]};
    const result=await verifySelectedStorage(source,target,selection.inventory);
    await source.query('COMMIT');await target.query('COMMIT');
    await writeFile(join(directory,'business-verification.json'),JSON.stringify({...result,seconds:(Date.now()-started)/1000},null,2));
    process.stdout.write(JSON.stringify({state:result.state,tables:result.tables.length})+'\n');
   }catch(error){await source.query('ROLLBACK').catch(()=>undefined);await target.query('ROLLBACK').catch(()=>undefined);await writeFile(join(directory,'verification-failure-private.txt'),error instanceof Error?error.stack??error.message:'unknown verification failure');throw error;}
   finally{source.release();target.release();}
  }finally{await sourcePool.end();await targetPool.end();}
  return;
 }
 if(phase==='convert'){
  try{
   await runMigrations(targetPool,process.env.ISSUE174_MIGRATIONS??'/database');
   const c=await targetPool.connect(),started=Date.now();
   try{const result=await convertSelectedStorage(c,new Date());await writeFile(join(directory,'conversion-summary.json'),JSON.stringify({...result,seconds:(Date.now()-started)/1000},null,2));process.stdout.write(JSON.stringify(result)+'\n');}
   catch(error){await writeFile(join(directory,'conversion-failure-private.txt'),error instanceof Error?error.stack??error.message:'unknown conversion failure');throw error;}
   finally{c.release();}
  }finally{await sourcePool.end();await targetPool.end();}
  return;
 }
 const source=await sourcePool.connect(),target=await targetPool.connect();const started=Date.now();
 try{
  await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const tables=await selectLegacyStorage(source),inventory=[];
  for(const table of tables.values()){
   const count=Number((await source.query(`SELECT count(*)::text n FROM public.${sqlName(table.name)}`)).rows[0].n);
   inventory.push({name:table.name,columns:table.columns,pk:table.pk,sourceCount:count,keepKeys:table.keep===null?null:[...table.keep],selectedCount:table.keep===null?count:table.keep.size});
  }
  await writeFile(join(directory,'selection-private.json'),JSON.stringify({schemaVersion:'issue174-selection.v2',sourceDatabase:'issue174_original',targetDatabase:targetUrl.pathname.slice(1),startedAt:new Date(started).toISOString(),inventory},null,2));
  await copySelectedRows(source,target,tables,async(name,count)=>{await appendFile(join(directory,'copy-checkpoints.jsonl'),JSON.stringify({table:name,count,at:new Date().toISOString()})+'\n');});
  await source.query('COMMIT');
  const summary={state:'SELECTED_ROWS_COPIED',seconds:(Date.now()-started)/1000,tables:inventory.map(t=>({table:t.name,source:t.sourceCount,selected:t.selectedCount,omitted:t.sourceCount-t.selectedCount})),sourceWrites:0,sourceRequests:0};
  await writeFile(join(directory,'selection-summary.json'),JSON.stringify(summary,null,2));
  process.stdout.write(JSON.stringify({state:summary.state,seconds:summary.seconds,tables:summary.tables.length})+'\n');
 }catch(error){await source.query('ROLLBACK').catch(()=>undefined);await writeFile(join(directory,'selection-failure-private.txt'),error instanceof Error?error.stack??error.message:'unknown selection failure');throw new Error('selection failed; partial isolated target retained for review');}
 finally{source.release();target.release();await sourcePool.end();await targetPool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{process.stderr.write('issue174_isolated_selection_failed\n');process.exitCode=1;});

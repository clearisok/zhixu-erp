import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import pg from 'pg';
import {startDisposablePostgres} from './postgres-container.js';
import {runMigrations} from '../db/migration-runner.js';
import {synchronizePermissionCatalog} from '../auth/permissions.js';
import {bootstrapAdmin} from '../auth/bootstrap.js';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.js';
import {bindOrders} from '../ainuoke-source/binding.js';
import {captureCatalogOnce} from '../ainuoke-source/catalog-capture.js';
import {accountFingerprint} from '../ainuoke-source/collector.js';
import {validateSelectedSourceOnce} from '../ainuoke-source/selected-source-once.js';
import {selectedConfig,selectedContracts,selectedWorkerFixture} from './selected-source-fixture.js';
import {configureSync} from '../ainuoke-source/sync-queue.js';
import {DEFAULT_SYNC_POLICY} from '../ainuoke-source/sync-schedule.js';
import {runSyncTick} from '../ainuoke-source/sync-worker.js';
import {catalogScanDue,loadCatalogScanResume,finishCatalogScan} from '../ainuoke-source/catalog-checkpoints.js';
import {getFoundationSalesOrderById} from '../sales-orders/repository.js';
import {createOrderMaterialReader} from '../../features/ainuoke-material-progress/read-service.js';
import {createPersistedMaterialPorts} from '../ainuoke-source/reader.js';

async function setup(label:string){
 const db=await startDisposablePostgres(),pool=new pg.Pool({connectionString:await db.createDatabase(label),max:5});
 try{
  await runMigrations(pool,resolve('database/migrations'));await synchronizePermissionCatalog(pool);
  await bootstrapAdmin(pool,{username:selectedConfig.operatorUsername,displayName:'Synthetic discovery operator',password:'synthetic-discovery'});
  const actor=await loadExistingBootstrapActor(pool,selectedConfig.operatorUsername),fp=accountFingerprint(selectedConfig);
  const checked=await validateSelectedSourceOnce(selectedWorkerFixture('selected-bindings'),selectedConfig,{mode:'selected-bindings',contracts:selectedContracts});
  assert.ok(checked.result==='complete'&&checked.mode==='selected-bindings');
  await bindOrders(pool,actor,{sourceKey:selectedConfig.sourceKey,accountFingerprint:fp,selected:selectedContracts,expectedPreview:checked.preview.reviewHash,collect:async()=>checked.bundle});
  await configureSync(pool,actor,{sourceKey:selectedConfig.sourceKey,enabled:true,expectedVersion:0,policy:{...DEFAULT_SYNC_POLICY}});
  return {pool,actor,fp,close:async()=>{await pool.end();await db.stop();}};
 }catch(e){await pool.end();await db.stop();throw e;}
}

test('automatic directory adoption retains incomplete headers, same-style contracts and successful empty material',{timeout:180000},async t=>{
 const f=await setup('new_contracts'),{pool,actor}=f,sourceKey=selectedConfig.sourceKey;
 try{
  const original=(await pool.query('SELECT id,order_no,version FROM sales_orders ORDER BY id')).rows;
  const mutation=`if report == 6086103:
        mutate_rows(payload, lambda rows: [row.update(InsideOrderNo='',GoodsDesc='',Num=None,Status='',ContractDate='',DeliveryDate='',CustomerName='') if row['id']=='3' else row.update(InsideOrderNo='SYN-IN-1',GoodsDesc='SYN-STYLE-1') if row['id']=='4' else None for row in rows])`;
  const raw=()=>selectedWorkerFixture('catalog-discovery',mutation,[],4);
  const id=randomUUID();
  const result=await captureCatalogOnce(pool,actor,selectedConfig,id,async()=>raw(),undefined,true);
  assert.equal(result.status,'complete');
  const successBefore=(await pool.query('SELECT last_success_at,next_scan_at FROM ainuoke_catalog_scan_state WHERE source_key=$1',[sourceKey])).rows[0];
  await finishCatalogScan(pool,sourceKey,id,{replayed:true},(raw() as {bundle:import('../ainuoke-source/additions.js').AdditionDiscoveryBundle}).bundle).then(
   ()=>assert.fail('different page times cannot replace an immutable receipt'),()=>undefined);
  await finishCatalogScan(pool,sourceKey,id,{replayed:true});
  assert.deepEqual((await pool.query('SELECT last_success_at,next_scan_at FROM ainuoke_catalog_scan_state WHERE source_key=$1',[sourceKey])).rows[0],successBefore);
  assert.ok((await pool.query('SELECT result FROM ainuoke_catalog_requests WHERE source_key=$1 AND request_id=$2',[sourceKey,id])).rows[0].result.createdOrders>0);
  const links=(await pool.query("SELECT sales_contract_no,sales_order_id::text,external_id FROM sales_order_source_links ORDER BY sales_contract_no")).rows;
  assert.equal(links.length,4);assert.equal(new Set(links.map(l=>l.sales_order_id)).size,4);
  const missing=links.find(l=>l.external_id==='3')!,sameStyle=links.find(l=>l.external_id==='4')!;
  const detail=await getFoundationSalesOrderById(pool,missing.sales_order_id);
  assert.equal(detail?.quantity,null);assert.equal(detail?.styleNo,'');assert.equal(detail?.colorCount,0);
  const mirror=(await pool.query('SELECT quantity,inside_order_no,source_metadata FROM ainuoke_sales_order_contract_mirrors WHERE sales_order_id=$1',[missing.sales_order_id])).rows[0];
  assert.equal(mirror.quantity,null);assert.equal(mirror.inside_order_no,'');assert.ok(mirror.source_metadata.missingFields.includes('quantity'));
  assert.equal((await getFoundationSalesOrderById(pool,sameStyle.sales_order_id))?.styleNo,'SYN-STYLE-1');
  const jobs=(await pool.query("SELECT source_id,kind,status FROM ainuoke_sync_jobs WHERE source_id IN ('3','4')")).rows;
  assert.equal(jobs.length,2);assert.ok(jobs.every(j=>j.kind==='automatic'&&j.status==='queued'));
  await captureCatalogOnce(pool,actor,selectedConfig,id,async()=>{throw Error('replay must not collect');},undefined,true);
  await captureCatalogOnce(pool,actor,selectedConfig,randomUUID(),async()=>raw(),undefined,true);
  assert.equal((await pool.query('SELECT count(*)::int n FROM sales_orders')).rows[0].n,4);
  assert.equal((await pool.query("SELECT count(*)::int n FROM ainuoke_sync_jobs WHERE source_id IN ('3','4')")).rows[0].n,2);
  assert.deepEqual((await pool.query('SELECT id,order_no,version FROM sales_orders WHERE id=ANY($1::uuid[]) ORDER BY id',[original.map(r=>r.id)])).rows,original);
  await t.test('unknown headers do not prevent BillNo-based colour/material empty capture and formal publication',async()=>{
   const tick=await runSyncTick(pool,actor,{...selectedConfig,materialReport:'6087051'},{automatic:false,sourceIds:['3'],collect:async(_cfg,r)=>{
    assert.equal(r.mode,'catalog-contracts');
    const empty=mutation+`\n    elif report != 6086103:\n        payload['dataCount']=0\n        payload['dataList']='{"rows":[]}'`;
    return selectedWorkerFixture('catalog-contracts',empty,['SYN-SALES-3'],4,'6087051');
   }});
   assert.equal(tick.status,'processed');assert.equal(tick.jobs[0].status,'complete',JSON.stringify(tick.jobs));
   const row=(await pool.query("SELECT result FROM ainuoke_sync_jobs WHERE source_id='3'")).rows[0];
   assert.equal(row.result.publicationStatus,'published');assert.equal(row.result.materialRows,0);
   const reader=createOrderMaterialReader(createPersistedMaterialPorts(pool,{sourceKey,maxAgeMs:600000}));
   const read=await reader(actor,{salesOrderId:missing.sales_order_id});
   assert.equal(read.status,200);if(read.status===200){assert.equal(read.body.progress.sourceStatus,'ready');assert.equal(read.body.progress.rows.length,0);}
   assert.equal((await getFoundationSalesOrderById(pool,missing.sales_order_id))?.quantity,null);
  });
  await t.test('a new contract with an approved blank colour placeholder publishes a complete empty result',async()=>{
   const empty=mutation+`\n    elif report == 6087105:\n        payload['dataCount']=1\n        payload['dataList']='{"rows":[{"id":"synthetic-blank-color","BillNo":"SYN-SALES-4","CnColor":"","SizeNum":"","Size1":""}]}'\n    elif report != 6086103:\n        payload['dataCount']=0\n        payload['dataList']='{"rows":[]}'`;
   const tick=await runSyncTick(pool,actor,{...selectedConfig,materialReport:'6087051'},{automatic:false,sourceIds:['4'],collect:async()=>selectedWorkerFixture('catalog-contracts',empty,['SYN-SALES-4'],4,'6087051')});
   assert.equal(tick.status,'processed',JSON.stringify(tick));assert.equal(tick.jobs[0].status,'complete',JSON.stringify(tick.jobs));
   const reader=createOrderMaterialReader(createPersistedMaterialPorts(pool,{sourceKey,maxAgeMs:600000}));
   const read=await reader(actor,{salesOrderId:sameStyle.sales_order_id});
   assert.equal(read.status,200);if(read.status===200){assert.equal(read.body.progress.sourceStatus,'ready');assert.equal(read.body.progress.rows.length,0);}
   assert.equal((await getFoundationSalesOrderById(pool,sameStyle.sales_order_id))?.colorCount,0);
  });
  const state=(await pool.query('SELECT last_success_at,next_scan_at,watermark,status FROM ainuoke_catalog_scan_state WHERE source_key=$1',[sourceKey])).rows[0];
  assert.equal(state.status,'complete');assert.equal(state.watermark.contracts,4);
  assert.equal(state.watermark.strategy,'complete-directory-overlap');
  assert.equal(await catalogScanDue(pool,sourceKey,30,new Date(state.last_success_at).getTime()+29*60000),false);
  assert.equal(await catalogScanDue(pool,sourceKey,30,new Date(state.last_success_at).getTime()+30*60000),true);
  await t.test('one failed initial intake does not block another contract and the ordinary worker recovers it',async()=>{
   await pool.query(`CREATE FUNCTION synthetic_intake_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
    IF NEW.sales_contract_no='SYN-SALES-5' THEN RAISE EXCEPTION 'synthetic order intake unavailable'; END IF; RETURN NEW; END$$;
    CREATE TRIGGER synthetic_intake_failure BEFORE INSERT ON ainuoke_sales_order_contract_mirrors FOR EACH ROW EXECUTE FUNCTION synthetic_intake_failure()`);
   const scan=await captureCatalogOnce(pool,actor,selectedConfig,randomUUID(),async()=>selectedWorkerFixture('catalog-discovery',mutation,[],6),undefined,true);
   assert.ok('pendingOrders' in scan.result);assert.equal(scan.result.pendingOrders,1);
   assert.equal((await pool.query("SELECT count(*)::int n FROM sales_order_source_links WHERE sales_contract_no='SYN-SALES-6'")).rows[0].n,1);
   assert.equal((await pool.query("SELECT count(*)::int n FROM sales_order_source_links WHERE sales_contract_no='SYN-SALES-5'")).rows[0].n,0);
   assert.equal((await pool.query("SELECT count(*)::int n FROM ainuoke_sync_jobs WHERE source_id='5' AND status='queued'")).rows[0].n,1);
   await pool.query('DROP TRIGGER synthetic_intake_failure ON ainuoke_sales_order_contract_mirrors; DROP FUNCTION synthetic_intake_failure()');
   const tick=await runSyncTick(pool,actor,{...selectedConfig,materialReport:'6087051'},{automatic:false,sourceIds:['5'],adoptNewOrders:true,collect:async()=>{
    const empty=mutation+`\n    elif report != 6086103:\n        payload['dataCount']=0\n        payload['dataList']='{"rows":[]}'`;
    return selectedWorkerFixture('catalog-contracts',empty,['SYN-SALES-5'],6,'6087051');
   }});
   assert.equal(tick.status,'processed');assert.equal(tick.jobs[0].status,'complete',JSON.stringify(tick.jobs));
   const result=(await pool.query("SELECT result FROM ainuoke_sync_jobs WHERE source_id='5'")).rows[0].result;
   assert.equal(result.publicationStatus,'published');assert.ok(result.orderId);
   assert.equal((await pool.query("SELECT count(*)::int n FROM sales_order_source_links WHERE sales_contract_no='SYN-SALES-5'")).rows[0].n,1);
  });
 }finally{await f.close();}
});

test('failed catalogue page keeps accepted directory, durable recovery position and last successful watermark',{timeout:180000},async()=>{
 const f=await setup('catalog_checkpoint'),{pool,actor,fp}=f,sourceKey=selectedConfig.sourceKey;
 try{
  await captureCatalogOnce(pool,actor,selectedConfig,randomUUID(),async()=>selectedWorkerFixture('catalog-discovery','',[]));
  const before=(await pool.query('SELECT last_success_at,next_scan_at,watermark FROM ainuoke_catalog_scan_state WHERE source_key=$1',[sourceKey])).rows[0];
  const fixture=selectedWorkerFixture('catalog-discovery','',[],101) as {bundle:{discoveryBefore:unknown[]};metrics:Record<string,unknown>};
  const failed=randomUUID();
  await assert.rejects(captureCatalogOnce(pool,actor,selectedConfig,failed,async(_cfg,_r,options)=>{
   for(const p of fixture.bundle.discoveryBefore.slice(0,2))await options!.onPage!('before',p);
   return {...fixture,result:'failed',code:'selected_source_timeout',bundle:null};
  }),/selected_source_timeout/);
  const state=(await pool.query('SELECT last_success_at,next_scan_at,watermark,status,cursor FROM ainuoke_catalog_scan_state WHERE source_key=$1',[sourceKey])).rows[0];
  assert.equal(state.status,'failed');assert.equal(state.cursor.nextPage,3);
  assert.deepEqual({last_success_at:state.last_success_at,next_scan_at:state.next_scan_at,watermark:state.watermark},before);
  assert.equal((await pool.query('SELECT count(*)::int n FROM ainuoke_catalog_entries')).rows[0].n,3);
  const prefix=await loadCatalogScanResume(pool,sourceKey,fp);assert.equal(prefix.length,2);
  assert.deepEqual(await loadCatalogScanResume(pool,sourceKey,'0'.repeat(64)),[]);
  assert.deepEqual(await loadCatalogScanResume(pool,sourceKey,fp,Date.now()+301000),[]);
  await assert.rejects(pool.query("UPDATE ainuoke_catalog_scan_pages SET metadata=metadata WHERE request_id=$1",[failed]),/immutable/);
  await captureCatalogOnce(pool,actor,selectedConfig,randomUUID(),async(_cfg,_r,options)=>{assert.equal(options!.resumePages!.length,2);return fixture;});
  assert.equal((await pool.query('SELECT count(*)::int n FROM ainuoke_catalog_entries')).rows[0].n,101);
  assert.equal((await pool.query('SELECT status FROM ainuoke_catalog_scan_state WHERE source_key=$1',[sourceKey])).rows[0].status,'complete');
 }finally{await f.close();}
});

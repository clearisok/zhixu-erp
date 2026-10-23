/** Local synthetic acceptance only. No existing database, source login or scheduler. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {startContinuousFixture} from '../server/integration/ainuoke-continuous-fixture.js';
import {loadExistingBootstrapActor} from '../server/sales-orders/bootstrap-runner.js';
import {createQuoteMasterService} from '../server/quote-masters/service.js';
import {createQuoteDraft} from '../features/quote-center/model/quote-view-model.js';
import {quoteSnapshotFromBrowser} from '../server/quotes/model.js';
import {createQuoteService} from '../server/quotes/service.js';
import {createAinuokeSalesOrder} from '../server/sales-orders/service.js';
import {previewOrderBusinessSource,adoptOrderBusinessSource} from '../server/sales-orders/business-source-service.js';
import {readPricingColors} from '../server/sales-orders/color-commercial.js';
import {previewSaleAdjustment,commitSaleAdjustment} from '../server/sales-orders/sale-adjustment-service.js';
import {createProcessingBatch,previewProcessingBatch,confirmProcessingBatch,consumeProcessingBatches} from '../server/sales-orders/processing-batch-service.js';

const command=(program:string,args:string[])=>execFileSync(program,args,{encoding:'utf8',windowsHide:true,timeout:15000}).trim();
assert.equal(process.argv[2],'--new-synthetic','Explicit --new-synthetic is required');
assert.equal(process.env.DATABASE_URL,undefined,'An existing database must never be supplied');
const context=JSON.parse(command('docker',['context','inspect'])) as {Endpoints:{docker:{Host:string}}}[];
assert.ok(context.length===1&&/^(npipe:\/\/|unix:\/\/)/u.test(context[0].Endpoints.docker.Host),'Local Docker daemon required');
assert.ok(!process.env.DOCKER_HOST,'Docker host overrides are not accepted');
assert.equal(command('git',['status','--porcelain']),'','Commit the reviewed candidate first');
const sourceSha=command('git',['rev-parse','HEAD']),build=JSON.parse(await readFile('dist/client/build-info.json','utf8'));
assert.equal(build.gitCommit,sourceSha,'Build must match this exact candidate');
assert.equal(build.quoteAuthority,'server');assert.equal(build.identityMode,'session');assert.equal(build.orderRead,'snapshot');
const directory=resolve('outputs','price-source-acceptance-'+randomUUID());
await mkdir(directory);await cp(resolve('dist/client'),resolve(directory,'site'),{recursive:true,errorOnExist:true});
const fixture=await startContinuousFixture(resolve(directory,'site'),{materialDisplay:true,excessWarehouse:true});
let stopping=false;
const stop=async()=>{if(stopping)return;stopping=true;await fixture.close();};
try{
 const {pool}=fixture,actor=await loadExistingBootstrapActor(pool,'demo.admin'),masters=createQuoteMasterService(pool);
 // These seven accounts were just created in this new disposable database.
 assert.equal((await pool.query('SELECT count(*)::int n FROM app_users')).rows[0].n,7);
 await pool.query("UPDATE app_users SET display_name='本机验收管理员（全合成数据）' WHERE username='demo.admin'");
 const defaults={defaultUsdCnyRate:null,defaultOtherCost:null,defaultTrims:[]};
 const brand=await masters.createBrand(actor,{name:'验收品牌（合成）',status:'active',defaults});
 const person=await masters.createSalesperson(actor,{name:'验收客户业务员（合成）',brandId:brand.id,status:'active',defaults});
 const preset=await masters.createPreset(actor,{name:'验收国内制作',country:'中国',laborCurrency:'CNY',markupRate:'15',includeFreight:false,freightName:'运费',freightAmount:null,status:'active'});
 const settings=await masters.getGlobalSettings();
 await masters.updateGlobalSettings(actor,settings?.version??0,{defaultQuoteType:'distribution',defaultManufacturingCountry:'中国',defaultUsdCnyRate:null,defaultMarkupRate:'15',defaultLaborCurrency:'CNY',defaultLaborDescription:'裁剪、车缝、整烫、质检包装',defaultOtherCost:null,defaultManufacturingPresetId:preset.id});
 const quote=async(id:string,type:'distribution'|'processing',confirmed=true)=>{
  const q=createQuoteDraft(id,'QT-ACCEPT-'+id,'2026-10-19'),r=q.revisions[0],p=r.priceVersions[0];
  r.baseInfo={...r.baseInfo,brandId:brand.id,brandName:brand.name,salespersonId:person.id,salespersonName:person.name,quoteType:type,quoteStyleNo:id,styleName:type==='processing'?'合成加工卫衣':'合成衬衫',garmentLeadDate:'2026-12-01',note:'本机隔离合成验收；不是客户实际报价。'};
  p.name='素色';p.quantity=400;p.labor={value:20,description:'裁剪、车缝、整烫、包装'};
  p.pricingParameters={...p.pricingParameters,manufacturingCountry:'中国',manufacturingPresetId:preset.id,manufacturingPresetName:preset.name,laborCurrency:'CNY',usdCnyRate:null,markupRate:15,includeFreight:false,configuration:{schemaVersion:1,status:'configured',sources:[{field:'manufacturingCountry',source:'preset'},{field:'laborCurrency',source:'preset'}]}};
  if(confirmed){p.confirmation={quotedGarmentPrice:type==='processing'?0:120,quotedLaborPrice:20,confirmedGarmentPrice:type==='processing'?null:120,confirmedLaborPrice:20,note:'合成客户确认',confirmedAt:'2026-10-19T00:00:00Z'};q.aggregateStatus='confirmed';}
  if(type==='distribution'&&confirmed){const print=structuredClone(p);print.id=randomUUID();print.name='印花';print.description='合成印花方案';print.confirmation!.confirmedGarmentPrice=130;print.confirmation!.quotedGarmentPrice=130;r.priceVersions.push(print);}
  r.confirmationSummary={confirmedCount:confirmed?r.priceVersions.length:0,totalCount:r.priceVersions.length};
  await createQuoteService(pool).createAggregate(quoteSnapshotFromBrowser(q));return q;
 };
 const distribution=await quote('SYN-COLOR-SHIRT','distribution'),processing=await quote('SYN-PROCESS-HOODIE','processing');
 const unconfirmed=await quote('SYN-UNCONFIRMED','distribution',false);
 const orders=[];
 for(const label of ['多色不同价','统一成交价','待维护来源']){
  const result=await createAinuokeSalesOrder(pool,actor,{source:{sourceId:'ACCEPT-'+label,sourceRowIdentity:'ACCEPT-ROW-'+label,salesContractNo:'SYN-'+label,insideOrderNo:'SYN-'+label,styleNo:'SYN-COLOR-SHIRT',lifecycleStatusRaw:'生效',contractDate:'2026-10-19',contractDeliveryDate:'2026-12-01',companyNameSnapshot:'验收公司（合成）',customerNameSnapshot:'验收客户（合成）',brandNameSnapshot:brand.name,quantity:400,sourceHash:'synthetic-'+label,fetchedAt:new Date().toISOString()},colors:['黑','白','蓝','红'].map((colorName,i)=>({sourceLineIdentity:'color-'+i,colorName,quantity:100,deliveryDate:null,sourceHash:'synthetic-color-'+i}))});
  const id=result.salesOrder.id;orders.push({id,orderNo:result.salesOrder.orderNo,label});
  if(label==='待维护来源')continue;
  const r=distribution.revisions[0],colors=await readPricingColors(pool,id),selection={kind:'quote',quoteId:distribution.id,revisionId:r.revisionId,assignments:colors.map(c=>({colorId:c.id,priceVersionId:r.priceVersions[c.colorName==='红'?1:0].id}))};
  const p=await previewOrderBusinessSource(pool,actor,id,selection);
  await adoptOrderBusinessSource(pool,actor,id,{selection,requestId:randomUUID(),expectedVersion:p.version,fingerprint:p.fingerprint,reason:'合成验收报价依据'});
  const rule={kind:'set',value:'128'},overrides=colors.map(c=>({colorId:c.id,price:label==='多色不同价'&&c.colorName==='白'?'120':'128'}));
  const preview=await previewSaleAdjustment(pool,actor,{rule,items:[{salesOrderId:id,overrides}]}),item=preview.items[0];assert.equal(item.status,'ready');if(item.status!=='ready')throw Error('Synthetic price preview failed');
  const receipt=await commitSaleAdjustment(pool,actor,{requestId:randomUUID(),reason:'合成验收颜色议价',rule,items:[{salesOrderId:id,expectedVersion:item.expectedVersion,fingerprint:item.fingerprint,overrides}]});
  assert.equal(receipt.items[0].status,'updated');
 }
 const batches=[],r=processing.revisions[0];
 for(let i=0;i<2;i++){
  const b=await createProcessingBatch(pool,actor,{requestId:randomUUID(),quoteId:processing.id,revisionId:r.revisionId,priceVersionId:r.priceVersions[0].id,customerName:'验收加工客户（合成）',businessStyleNo:'SYN-PROCESS-HOODIE',quantity:'400',orderDate:'2026-10-19',deliveryDate:'2026-12-01',customerReference:'SYN-PO-'+i,deliveryRequirements:'合成下单批次',referenceOrderId:null});
  const p=await previewProcessingBatch(pool,actor,b.batchId),confirmed=await confirmProcessingBatch(pool,actor,b.batchId,{requestId:randomUUID(),expectedVersion:b.version,sourceFingerprint:p.candidate.fingerprint});
  batches.push({id:b.batchId,version:confirmed.version,consumed:i===0});
  if(i===0){const receipt=await consumeProcessingBatches(pool,actor,{requestId:randomUUID(),items:[{batchId:b.batchId,expectedVersion:confirmed.version}]});assert.equal(receipt.results[0].status,'created');}
 }
 assert.deepEqual(fixture.errors,[]);
 const receipt={result:'LOCAL_SYNTHETIC_ACCEPTANCE_READY',sourceSha,baseSha:'996dfedc12da3527343cd3ff2aa5eea35497e10e',buildId:build.buildId,pid:process.pid,url:fixture.base+'/order-center',login:fixture.base+'/login?returnTo=%2Forder-center',username:'demo.admin',password:fixture.password,users:fixture.users,container:fixture.containerName,orders,quotes:[distribution.id,processing.id,unconfirmed.id],batches,sourceRequests:0,scheduler:false,persistence:'temporary; discarded when this owned fixture is stopped',directory};
 await writeFile(resolve(directory,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(receipt));
 process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
}catch(error){await stop();throw error;}

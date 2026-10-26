import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import pg from "pg";
import { startDisposablePostgres } from "./postgres-container.js";
import { runMigrations } from "../db/migration-runner.js";
import { synchronizePermissionCatalog } from "../auth/permissions.js";
import { bootstrapAdmin } from "../auth/bootstrap.js";
import { loadExistingBootstrapActor } from "../sales-orders/bootstrap-runner.js";
import { executeTeamCommand } from "../auth/team-access.js";
import { TEAM_ROLES } from "../auth/team-roles.js";
import { createApp } from "../app.js";
import { bindOrders,previewBindings } from "../ainuoke-source/binding.js";
import { captureSource } from "../ainuoke-source/service.js";
import { createPersistedMaterialHistoryReader } from "../ainuoke-source/history.js";
import { createPersistedMaterialPorts } from "../ainuoke-source/reader.js";
import { bindingBundle,freshMaterialBundle } from "./ainuoke-binding-fixture.js";
import { createQuoteDraft } from "../../features/quote-center/model/quote-view-model.js";
import { quoteSnapshotFromBrowser } from "../quotes/model.js";
import { createQuoteService } from "../quotes/service.js";
import { MemoryAttachmentStorage } from "../attachments/storage.js";
import { createPaymentSnapshotReader, preparePaymentPublication, publishPaymentSnapshot } from '../ainuoke-source/payment-request-store.js';
import { hash } from '../ainuoke-source/contract.js';
import { createGarmentShipmentReader, prepareGarmentPublication, publishGarmentObservation } from '../ainuoke-source/garment-shipment-store.js';
/** Always generates its own loopback tmpfs PostgreSQL; never reads DATABASE_URL or source credentials. */
import type { NormalizationExecutionOptions } from '../sales-orders/normalization-execution-service.js';
export async function startContinuousFixture(staticDirectory:string,options: NormalizationExecutionOptions & {orderAlerts?:boolean;excessWarehouse?:boolean;materialDisplay?:boolean;paymentRequests?:boolean;materialArrivals?:boolean;garmentShipments?:boolean} = {}) {
 const normalizationExecution:NormalizationExecutionOptions=options;
 const db=await startDisposablePostgres();const pool=new pg.Pool({connectionString:await db.createDatabase("continuous_demo")});
 const server=createServer();const origins:string[]=[];const errors:unknown[]=[];
 const close=async()=>{if(server.listening)await new Promise<void>(done=>server.close(()=>done()));await pool.end();await db.stop();};
 try{
  await runMigrations(pool,resolve("database/migrations"));await synchronizePermissionCatalog(pool);
  const password="Synthetic-Demo-2026";const users=["demo.admin","demo.manager","demo.quote","demo.material","demo.production","demo.finance","demo.merchandising"];
  await bootstrapAdmin(pool,{username:users[0],displayName:"合成演示管理员",password});
  const actor=await loadExistingBootstrapActor(pool,users[0]);
  for(let i=1;i<TEAM_ROLES.length;i++)await executeTeamCommand(pool,actor,{action:"create",requestId:randomUUID(),account:users[i],name:"合成演示"+TEAM_ROLES[i].name,password,roleIds:[TEAM_ROLES[i].id]});
  const source={sourceKey:"synthetic-demo",accountFingerprint:"a".repeat(64)};
  const b=bindingBundle();
  if(options.orderAlerts){const page=Object.values(b.colors)[0][0];const pending=structuredClone(page.rows[0]);pending.sourceRowIdentity='synthetic-pending-color';pending.values.CnColor='合成待定颜色';pending.values.SizeNum=null;pending.values.Size1=null;pending.values.Size2=null;page.rows.push(pending);page.total++;}
  const p=await previewBindings(b);
  const bound=await bindOrders(pool,actor,{...source,expectedPreview:p.reviewHash,collect:async()=>b});
  const quote=createQuoteDraft("synthetic-unified-demo","QT-SYNTHETIC-DEMO","2026-10-12");
  quote.revisions[0].baseInfo.quoteStyleNo="SYNTHETIC-TEE-001";
  quote.revisions[0].baseInfo.styleName="合成演示T恤";
  quote.revisions[0].baseInfo.note="仅本机合成演示；制作方案未配置时保留待完善，不猜测真实参数。";
  quote.revisions[0].priceVersions[0].quantity=100;
  await createQuoteService(pool).createAggregate(quoteSnapshotFromBrowser(quote));
  let generation=0;let mode:"ready"|"failed"|"stale"="ready";
  const capture=async()=>{
   const result=await captureSource(pool,actor,{...source,maxAgeMs:600000,collect:async()=>{
    if(mode==="failed")throw Error("synthetic failure");
    const b=freshMaterialBundle();
    if(options.materialDisplay)for(const pages of Object.values(b.materials)){
     const page=pages[0],template=page.rows[0];
     const examples=[['fabric-high','面料','合成排序面料大','米',800,'合成规格A'],['fabric-low','面料','合成排序面料小','千克',10,'合成规格B'],['thread','辅料','合成缝纫线','个',20,'合成规格C'],['button','辅料','合成纽扣','个',20,'合成规格D'],['thread-variant','辅料','合成缝纫线','条',2,'合成规格E']] as const;
     for(const [key,type,name,unit,number,specification] of examples){const row=structuredClone(template);row.sourceRowIdentity='6087050:sha256:synthetic-display-'+key;Object.assign(row.values,{id:'SYNTHETIC-DISPLAY-'+key,GoodsNo:'SYNTHETIC-DISPLAY-'+key,lx:type,CnName:name,cgcnname:name,actualname:name,CnComposition:specification,cgCnComposition:specification,QtyUnit:unit,TotalNum:number,cgnum:number,rknum:number,cgdh:'PO-DISPLAY-'+key,rkdh:'IN-DISPLAY-'+key,cydh:'SHIP-DISPLAY-'+key,ckdh:'OUT-DISPLAY-'+key,CYNum:number,OutStoreNum:number});page.rows.push(row);}
     page.total=page.rows.length;
    }
    for(const pages of Object.values(b.materials))for(const p of pages)for(const row of p.rows) {
     if(options.orderAlerts && row.values.GoodsNo==='SYNTHETIC-MAT-ready')row.values.QtyUnit=null;
     if(options.excessWarehouse && row.values.GoodsNo==='SYNTHETIC-MAT-ready') {
      Object.assign(row.values,{TotalNum:32,cgnum:32,rknum:31,QtyUnit:'条'});
      if(generation===2)delete row.values.num_dyc;
      else row.values.num_dyc=generation===0?1:generation===1?2:0;
     }
     if(row.values.cgdh)row.values.cgdh=String(row.values.cgdh)+"-G"+generation;
    }
    generation++;return b;
   }});return result;
  };
  await capture();
  let paymentOffset=0,paymentDelay=0,paymentReads=0;
  const readPayments=createPaymentSnapshotReader(pool,{sourceKey:source.sourceKey},()=>Date.now()+paymentOffset);
  const publishPayments=async()=>{
    const orderId=bound.orderIds[0],context=await preparePaymentPublication(pool,actor,source.sourceKey,orderId,Date.now()-5000);
    const total=127,page=(pass:number,n:number)=>({schemaVersion:'ainuoke-payment-observation-page.v2',reportId:'6086941',sourceFingerprint:source.accountFingerprint,
      capturedAt:new Date(context.preparedAt+pass*1000+n).toISOString(),page:n,pageSize:100,reportedTotal:total,rawResponseSha256:hash([pass,n,context.preparedAt]),
      rows:Array.from({length:Math.min(100,total-(n-1)*100)},(_,i)=>({id:'SYN-PAY-'+((n-1)*100+i),BillNo:'SYN-PAY-APP',Status:'草拟',ExpContractNo:context.salesContractNo,PurContractNo:'SYN-PAY-PUR',
        CnName:'合成合同来源标签<&>',CnColor:'合成颜色',CnComposition:'合成规格',QtyUnit:i===1?null:'个',Num:'115.50',OutStoreNum:'118',Price:'9007199254740993.12345678901234567890',
        cgGoodsAmount:'87654321.1234567890123456',PayAmount:'87654321.1234567890123456',GoodsAmount:'87654321.1234567890123456',tzamount:'-80.00',kpNum:'0',YFAmount:null}))});
    const input={schemaVersion:'ainuoke-payment-contract-snapshot-input.v1',firstPass:[page(1,1),page(1,2)],secondPass:[page(2,1),page(2,2)]};
    return publishPaymentSnapshot(pool,actor,context,input,{sourceFingerprint:source.accountFingerprint,salesContractNo:context.salesContractNo,
      witness:{id:'SYN-PAY-0',BillNo:'SYN-PAY-APP',PurContractNo:'SYN-PAY-PUR'}},Date.now());
  };
  if(options.paymentRequests){
    await pool.query('INSERT INTO ainuoke_payment_source_targets(source_key,sales_order_id,account_fingerprint,enabled,verification_sha256) VALUES($1,$2,$3,true,$4)',
      [source.sourceKey,bound.orderIds[0],source.accountFingerprint,hash('synthetic-financial-query-proof')]);
    await publishPayments();
  }
  let garmentOffset=0;
  const garments=createGarmentShipmentReader(pool,{sourceKey:source.sourceKey},()=>Date.now()+garmentOffset);
  const publishGarments=async(total=127)=>{
    const context=await prepareGarmentPublication(pool,actor,source.sourceKey,bound.orderIds[0],Date.now()-5000);
    const color=(await pool.query('SELECT color_name FROM ainuoke_sales_order_color_mirrors WHERE sales_order_id=$1 ORDER BY color_name LIMIT 1',[bound.orderIds[0]])).rows[0].color_name as string;
    const page=(pass:number,n:number)=>({schemaVersion:'ainuoke-garment-shipment-page.v1',reportId:'6086979',sourceFingerprint:source.accountFingerprint,
      queryContext:{match:'exact',salesContractNo:context.salesContractNo},capturedAt:new Date(context.preparedAt+pass*1000+n).toISOString(),page:n,pageSize:100,reportedTotal:total,rawResponseSha256:hash(['garment',context.preparedAt,pass,n]),
      rows:Array.from({length:Math.min(100,Math.max(0,total-(n-1)*100))},(_,i)=>({id:'SYN-GARMENT-'+((n-1)*100+i),ExpContractNo:context.salesContractNo,billno:'SYN-OUT-1',CnColor:color,QtyUnit:'件',Num:i===1?'0':i===2?'-2.5':i===3?null:i===4?'not-a-number':'9007199254740993.000000000001',outdate:i===3?'':i===4?'2026-02-30':'2026-10-11',FDate:'2026-10-07',indate:'2026-10-07',wxprice:'PRIVATE-GARMENT-PRICE',remark:'PRIVATE-GARMENT-NOTES'}))});
    const pages=Math.max(1,Math.ceil(total/100)),input={schemaVersion:'ainuoke-garment-shipment-input.v1',firstPass:Array.from({length:pages},(_,i)=>page(1,i+1)),secondPass:Array.from({length:pages},(_,i)=>page(2,i+1))};
    return publishGarmentObservation(pool,actor,context,input,{sourceFingerprint:source.accountFingerprint,salesContractNo:context.salesContractNo},Date.now());
  };
  if(options.garmentShipments){
    await pool.query('INSERT INTO ainuoke_garment_shipment_targets(source_key,sales_order_id,account_fingerprint,freshness_ms,enabled,verification_sha256) VALUES($1,$2,$3,60000,true,$4)',[source.sourceKey,bound.orderIds[0],source.accountFingerprint,hash('synthetic-garment-filter-proof')]);
    await publishGarments();
  }
  let materialReads=0;
  const ports=createPersistedMaterialPorts(pool,{sourceKey:source.sourceKey,maxAgeMs:1800000},()=>Date.now()+(mode==="stale"?1800001:0));
  server.on("request",(req,res)=>{if(req.url?.includes("/material-progress"))materialReads++;app(req,res);});
  const app=createApp({pool,staticDirectory,normalizationExecution,attachmentStorage:new MemoryAttachmentStorage(),allowedOrigins:origins,security:{secureCookies:false,sessionTtlSeconds:7200},logger:{error:e=>errors.push(e)},orderMaterialRead:ports,orderMaterialHistory:createPersistedMaterialHistoryReader(pool,{sourceKey:source.sourceKey,maxAgeMs:1800000}),
    ...(options.materialArrivals?{materialArrivalSource:{sourceKey:source.sourceKey,maxAgeMs:1800000}}:{}),
    ...(options.garmentShipments?{orderGarmentShipmentRead:garments}:{}),
    ...(options.paymentRequests?{orderPaymentRead:async(identity:Parameters<typeof readPayments>[0],id:string)=>{paymentReads++;const result=await readPayments(identity,id);if(paymentDelay)await new Promise(done=>setTimeout(done,paymentDelay));return result;}}:{})});
  await new Promise<void>(done=>server.listen(0,"127.0.0.1",done));
  const address=server.address();if(!address||typeof address!=="object")throw Error("loopback fixture failed");
  const base="http://127.0.0.1:"+address.port;origins.push(base);
  return{pool,base,orderId:bound.orderIds[0],users,password,errors,capture,generation:()=>generation,materialReads:()=>materialReads,
    garments:{publish:publishGarments,setOffset:(value:number)=>{garmentOffset=value;},setEnabled:async(enabled:boolean)=>{await pool.query('UPDATE ainuoke_garment_shipment_targets SET enabled=$2,version=version+1 WHERE source_key=$1',[source.sourceKey,enabled]);}},
    payments:{reads:()=>paymentReads,publish:publishPayments,setOffset:(value:number)=>{paymentOffset=value;},setDelay:(value:number)=>{paymentDelay=value;},
      setEnabled:async(enabled:boolean)=>{await pool.query('UPDATE ainuoke_payment_source_targets SET enabled=$2,version=version+1 WHERE source_key=$1',[source.sourceKey,enabled]);}},
    setMode:(value:typeof mode)=>{mode=value;},containerName:db.containerName,
    login:async(username:string)=>{
     const response=await fetch(base+"/api/v1/auth/login",{method:"POST",headers:{"Content-Type":"application/json",Origin:base,"X-Zhixu-Request":"1"},body:JSON.stringify({username,password})});
     if(response.status!==200)throw Error("synthetic login failed");
     return response.headers.get("set-cookie")!.split(";")[0];
    },close};
 }catch(error){await close();throw error;}
}

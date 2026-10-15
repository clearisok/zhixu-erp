import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildPaymentContractSnapshot } from '../../../server/ainuoke-source/payment-request-snapshot';
import { CANDIDATE_FIELDS } from '../../../server/ainuoke-source/payment-request-fields';
import { createPaymentRequestClient, parsePaymentView, PaymentReadError } from '../client';
import { PAYMENT_SOURCE_FIELDS } from '../model';

const id='5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',contract='SYN-PANEL-CONTRACT';
const sha=(input:unknown)=>createHash('sha256').update(JSON.stringify(input)).digest('hex');
const captured=Date.parse('2026-10-15T00:00:00.000Z');
function fixture(total=127){
  const page=(pass:number,n:number)=>({schemaVersion:'ainuoke-payment-observation-page.v2',reportId:'6086941',sourceFingerprint:'a'.repeat(64),capturedAt:new Date(captured+pass*1000+n).toISOString(),
    page:n,pageSize:100,reportedTotal:total,rawResponseSha256:sha([pass,n]),rows:Array.from({length:Math.min(100,total-(n-1)*100)},(_,i)=>({
      id:'SYN-ROW-'+((n-1)*100+i),BillNo:'SYN-APP',ExpContractNo:contract,PurContractNo:'SYN-PUR',CnName:'合成物料',Num:'115.50',OutStoreNum:'118',
      Price:'9007199254740993.12345678901234567890',QtyUnit:i===1?null:'个',tzamount:'-80.00',kpNum:'0'}))});
  const snapshot=buildPaymentContractSnapshot({schemaVersion:'ainuoke-payment-contract-snapshot-input.v1',firstPass:Array.from({length:Math.ceil(total/100)},(_,i)=>page(1,i+1)),secondPass:Array.from({length:Math.ceil(total/100)},(_,i)=>page(2,i+1))},
    {sourceFingerprint:'a'.repeat(64),salesContractNo:contract,witness:{id:'SYN-ROW-0',BillNo:'SYN-APP',PurContractNo:'SYN-PUR'}},captured+5000);
  return {schemaVersion:'order-payment-requests.v1',salesOrderId:id,sourceReportId:'6086941',sourceStatus:'observed',snapshotId:snapshot.snapshotId,generation:1,
    observedFrom:snapshot.observedFrom,observedThrough:snapshot.observedThrough,evaluatedAt:new Date(captured+5000).toISOString(),expiresAt:snapshot.expiresAt,
    completeness:snapshot.completeness,rows:snapshot.rows,aggregation:snapshot.aggregation,bankPaymentStatus:snapshot.bankPaymentStatus,mappingVerified:snapshot.mappingVerified,consistency:'as_of_observed_time_not_live'};
}
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const errorCode=(expected:string)=>(error:unknown)=>error instanceof PaymentReadError&&error.code===expected;

test('shared field catalogue preserves every existing field and original ordering',()=>{
  const old='Status BillNo lx Brand CustomerName UserName FSingleName ExpContractNo StyleNo InsideOrderNo SupplierName PurContractNo companyname CnName actualname CateGoryName CnComposition CnColor MenFu KeZhong QtyUnit Price Num OutStoreNum cgGoodsAmount AdditionalPrice tzamount PayAmount YFAmount GoodsAmount gnsk gwsk kpsupplier InvoiceNo itemno InvoiceDate bgNum BGAmount bgQtyUnit BGName kpprice kpNum kpamount CYDate zzrkrq jldate PayDate fppmrq cwdate id'.split(' ');
  assert.deepEqual(PAYMENT_SOURCE_FIELDS,old);assert.deepEqual(CANDIDATE_FIELDS,old);
});
test('contract reader preserves exact source numbers, missing/zero/unit facts and real page identities',()=>{
  const data=parsePaymentView(fixture(),id,contract);assert.equal(data.sourceStatus,'observed');if(data.sourceStatus!=='observed')return;
  assert.equal(data.rows.length,127);assert.equal(data.rows[100].trace.page,2);assert.equal(data.rows[100].trace.rowIndex,0);
  assert.deepEqual(data.rows[0].quantities.Num,{state:'known',raw:'115.50'});assert.deepEqual(data.rows[0].quantities.OutStoreNum,{state:'known',raw:'118'});
  assert.deepEqual(data.rows[0].quantities.kpNum,{state:'known',raw:'0'});assert.equal(data.rows[0].amounts.tzamount.state,'known');
  assert.deepEqual(data.rows[0].amounts.Price,{state:'known',raw:'9007199254740993.12345678901234567890'});
  assert.equal(data.rows[0].amounts.YFAmount.state,'unknown');assert.equal(data.rows[1].sourceUnits.purchase.state,'unknown');
  assert.equal(data.rows[0].amountCurrencies.Price.state,'unknown');assert.equal(data.rows[0].allocatedShipmentUnit.state,'unknown');
});
test('malformed authority, scope, completeness, numbers and tracing fail closed',async t=>{
  for(const kind of ['schema','order','contract','count','pages','duplicate','unit','decimal','quantity','paid','mapping','CCT','row-id','scope','trace','time','ttl','meaning','amount-qualifier'] as const)await t.test(kind,()=>{
    const data=fixture();
    switch(kind){
      case 'schema':data.schemaVersion='other';break;case 'order':data.salesOrderId='other';break;
      case 'contract':data.rows[0].sourceFields.ExpContractNo={state:'known',raw:'SYN-OTHER'};break;
      case 'count':data.completeness.reportedRows++;break;case 'pages':data.completeness.pagesPerPass=1;break;
      case 'duplicate':data.rows[1].observationId=data.rows[0].observationId;break;
      case 'unit':data.rows[1].sourceUnits.purchase={state:'known',raw:'个'};break;
      case 'decimal':data.rows[0].amounts.Price={state:'known',raw:'not-a-number'};break;
      case 'quantity':data.rows[0].quantities.OutStoreNum={state:'known',raw:'119'};break;
      case 'paid':Object.assign(data,{bankPaymentStatus:'paid'});break;case 'mapping':Object.assign(data,{mappingVerified:true});break;
      case 'CCT':Object.assign(data.rows[0].sourceFields,{confirmedSalePrice:{state:'known',raw:'999'}});break;
      case 'row-id':data.rows[100].trace.rowIndex=100;break;case 'scope':data.rows[0].trace.sourceFingerprint='b'.repeat(64);break;
      case 'trace':data.rows[0].trace.jsonPath='elsewhere';break;case 'time':data.evaluatedAt=data.expiresAt;break;
      case 'ttl':data.expiresAt=new Date(Date.parse(data.expiresAt)+1).toISOString();break;
      case 'meaning':Object.assign(data.rows[0].quantityMeanings,{OutStoreNum:'outbound'});break;
      case 'amount-qualifier':Object.assign(data.rows[0].amountCurrencies.GoodsAmount,{state:'known',value:'CNY',evidenceSha256:[]});break;
    }
    assert.throws(()=>parsePaymentView(data,id,contract),errorCode('invalid_response'));
  });
});
test('all empty statuses contain no rows and never fall back to client data',()=>{
  for(const sourceStatus of ['not_connected','not_captured','stale','identity_changed','not_applicable']){
    const value={schemaVersion:'order-payment-requests.v1',salesOrderId:id,sourceReportId:'6086941',sourceStatus,rows:[],bankPaymentStatus:'not_inferred'};
    assert.equal(parsePaymentView(value,id,contract).sourceStatus,sourceStatus);
    assert.throws(()=>parsePaymentView({...value,rows:fixture(1).rows},id,contract));
  }
});
test('only the normalized SO UUID is sent, using bounded no-store same-origin GET',async()=>{
  const data=fixture(),calls:Array<{url:unknown;options:RequestInit|undefined}>=[];let clock=100;
  const controller=new AbortController();
  const read=createPaymentRequestClient(async(url,options)=>{calls.push({url,options});clock+=20;return json(data);},()=>clock);
  const result=await read(id.toUpperCase(),contract,controller.signal);assert.equal(result.status,'observed');
  assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/v1/sales-orders/'+id+'/payment-requests');
  assert.equal(calls[0].options?.method,'GET');assert.equal(calls[0].options?.cache,'no-store');assert.equal(calls[0].options?.credentials,'same-origin');
  assert.equal(calls[0].options?.redirect,'error');assert.equal(calls[0].options?.signal,controller.signal);assert.equal(calls[0].options?.body,undefined);
  const invalid=createPaymentRequestClient(async()=>{throw Error('must not fetch');});
  await assert.rejects(()=>invalid('bad',contract),errorCode('invalid_response'));await assert.rejects(()=>invalid(id,contract+' '));
});
test('receipt lifetime uses server age and entire monotonic latency, not browser wall time',async()=>{
  const data=fixture(1);data.evaluatedAt=new Date(Date.parse(data.expiresAt)-10).toISOString();let clock=100;
  const read=createPaymentRequestClient(async()=>{clock=111;return json(data);},()=>clock);
  assert.deepEqual(await read(id,contract),{status:'expired',model:null});
  clock=100;const fresh=createPaymentRequestClient(async()=>{clock=105;return json(data);},()=>clock);const result=await fresh(id,contract);
  assert.equal(result.status,'observed');if(result.status==='observed')assert.equal(result.deadline,110);
  clock=100;const rollback=createPaymentRequestClient(async()=>{clock=99;return json(data);},()=>clock);
  await assert.rejects(()=>rollback(id,contract),errorCode('clock_unavailable'));
});
test('session/permission/integrity failures are closed and do not expose response details or retry',async()=>{
  for(const [status,code,expected] of [[401,'private','authentication_required'],[403,'private','forbidden'],[404,'private','order_unavailable'],[503,'payment_read_not_connected','not_connected'],[503,'payment_snapshot_integrity_failed','unavailable']] as const){
    let calls=0;const read=createPaymentRequestClient(async()=>{calls++;return json({error:{code,message:'synthetic-do-not-leak'}},status);});
    await assert.rejects(()=>read(id,contract),errorCode(expected));assert.equal(calls,1);
  }
});
test('oversized stream is cancelled; invalid UTF8/JSON and aborted transport cannot return facts',async()=>{
  let cancelled=false,calls=0;
  const stream=new ReadableStream<Uint8Array>({pull(c){c.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}});
  const read=createPaymentRequestClient(async()=>{calls++;return new Response(stream);});
  await assert.rejects(()=>read(id,contract),errorCode('too_large'));assert.equal(cancelled,true);assert.equal(calls,1);
  await assert.rejects(()=>createPaymentRequestClient(async()=>new Response(new Uint8Array([255])))(id,contract),errorCode('invalid_response'));
  await assert.rejects(()=>createPaymentRequestClient(async()=>new Response('not-json'))(id,contract),errorCode('invalid_response'));
  await assert.rejects(()=>createPaymentRequestClient(async()=>{throw new DOMException('synthetic','AbortError');})(id,contract),{name:'AbortError'});
});

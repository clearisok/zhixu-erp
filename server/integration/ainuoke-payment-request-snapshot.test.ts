import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildPaymentContractSnapshot as build, paymentSnapshotFreshness as freshness, PAYMENT_SNAPSHOT_LIMITS} from '../ainuoke-source/payment-request-snapshot.js';
import {projectPaymentRequestObservations as firstPage, projectPaymentRequestContractPage as contractPage} from '../ainuoke-source/payment-request-observations.js';

const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const base=Date.parse('2026-10-15T10:00:00Z'),now=base+5000;
const scope={sourceFingerprint:sha('synthetic-account'),salesContractNo:'SYN-CONTRACT',witness:{id:'0',BillNo:'SYN-APPLICATION',PurContractNo:'SYN-PURCHASE'}};
type Row=Record<string,string|null>;
function page(pass:number,n:number,total:number){
 const rows:Row[]=Array.from({length:Math.max(0,Math.min(100,total-(n-1)*100))},(_,i)=>({id:String((n-1)*100+i),BillNo:'SYN-APPLICATION',PurContractNo:'SYN-PURCHASE',ExpContractNo:scope.salesContractNo,CnName:'SYN-MATERIAL-'+((n-1)*100+i),QtyUnit:'个',Num:'115.50',OutStoreNum:'118',Price:'12345678901234567890.12345678901234567890',tzamount:'-1.00',YFAmount:null}));
 return {schemaVersion:'ainuoke-payment-observation-page.v2',reportId:'6086941',sourceFingerprint:scope.sourceFingerprint,capturedAt:new Date(base+(pass-1)*2000+(n-1)*500).toISOString(),page:n,pageSize:100,reportedTotal:total,rawResponseSha256:sha([pass,n,total]),rows};
}
function input(total=127){return {schemaVersion:'ainuoke-payment-contract-snapshot-input.v1',firstPass:Array.from({length:Math.max(1,Math.ceil(total/100))},(_,i)=>page(1,i+1,total)),secondPass:Array.from({length:Math.max(1,Math.ceil(total/100))},(_,i)=>page(2,i+1,total))};}

test('complete two-pass contract keeps actual pages and independent exact observations',()=>{
 const snapshot=build(input(),scope,now);
 assert.equal(snapshot.rows.length,127);assert.equal(snapshot.completeness.selectedContractComplete,true);
 assert.equal(snapshot.completeness.allCompanyRecordsRead,false);assert.equal(snapshot.completeness.pagesPerPass,2);
 assert.equal(snapshot.rows[100].trace.page,2);assert.equal(snapshot.rows[100].trace.rowIndex,0);assert.equal(snapshot.rows[100].trace.jsonPath,'dataList.rows[0]');
 assert.equal(snapshot.rows[100].trace.sourceRecordId.state,'known');assert.equal(new Set(snapshot.rows.map(r=>r.observationId)).size,127);
 assert.deepEqual(snapshot.rows[0].quantities.Num,{state:'known',raw:'115.50'});assert.deepEqual(snapshot.rows[0].quantities.OutStoreNum,{state:'known',raw:'118'});
 assert.deepEqual(snapshot.rows[0].amounts.Price,{state:'known',raw:'12345678901234567890.12345678901234567890'});
 assert.equal(snapshot.rows[0].purchaseContractCurrency.state,'unknown');assert.equal(snapshot.rows[0].allocatedShipmentUnit.state,'unknown');
 assert.equal(snapshot.mappingVerified,false);assert.equal(snapshot.bankPaymentStatus,'not_inferred');assert.equal(snapshot.aggregation,'none');assert.equal(snapshot.sourceActivation,'not_activated');
 assert.equal(build(input(),scope,now).snapshotId,snapshot.snapshotId);
});

test('old first-page contract stays bounded and cannot be relabelled as a full contract',()=>{
 const old={...page(1,1,100),schemaVersion:'ainuoke-payment-observation-page.v1',reportedTotal:1000};
 assert.equal(firstPage(old).scope,'fixed_first_page_observations');assert.equal(firstPage(old).completeness.orderComplete,false);
 assert.throws(()=>firstPage({...old,page:2}),/invalid_page/);assert.throws(()=>contractPage(old),/invalid_page/);
 assert.throws(()=>contractPage({...old,schemaVersion:'ainuoke-payment-observation-page.v2'}),/invalid_page/);
});

test('missing page, extra page, wrong page order and incomplete row counts fail closed',async t=>{
 for(const kind of ['missing','extra','order','short','wrong-page'] as const)await t.test(kind,()=>{
  const value=input();if(kind==='missing')value.firstPass.pop();if(kind==='extra')value.firstPass.push(page(1,3,127));if(kind==='order')value.secondPass.reverse();if(kind==='short')value.secondPass[1].rows.pop();if(kind==='wrong-page')value.secondPass[1].page=1;
  assert.throws(()=>build(value,scope,now));
 });
});

test('contract and source account must match every row and every page',async t=>{
 for(const kind of ['foreign-row','missing-contract','account','different-scope'] as const)await t.test(kind,()=>{
  const value=input();if(kind==='foreign-row')value.secondPass[1].rows[0].ExpContractNo='SYN-OTHER';if(kind==='missing-contract')delete value.firstPass[0].rows[0].ExpContractNo;if(kind==='account')value.secondPass[1].sourceFingerprint=sha('another-account');
  assert.throws(()=>build(value,kind==='different-scope'?{...scope,salesContractNo:'SYN-OTHER'}:scope,now));
 });
});

test('known witness uses all three source identities rather than matching quantity or name',()=>{
 for(const key of ['id','BillNo','PurContractNo'] as const)assert.throws(()=>build(input(),{...scope,witness:{...scope.witness,[key]:'SYN-WRONG'}},now),/witness_missing/);
});

test('two-pass changes in values, ordering, total or missing second pass are rejected',async t=>{
 for(const kind of ['value','order','total','missing'] as const)await t.test(kind,()=>{
  const value=input();if(kind==='value')value.secondPass[1].rows[0].OutStoreNum='119';if(kind==='order')value.secondPass[0].rows.reverse();if(kind==='total')value.secondPass=[page(2,1,128),page(2,2,128)];if(kind==='missing')value.secondPass=[];
  assert.throws(()=>build(value,scope,now));
 });
});

test('replayed capture and repeated whole pages are rejected; duplicates within a page are retained',()=>{
 const replay=input(1);replay.secondPass=structuredClone(replay.firstPass);assert.throws(()=>build(replay,scope,now),/replayed_pass/);
 const repeated=input(200);for(const pass of [repeated.firstPass,repeated.secondPass])pass[1].rows=structuredClone(pass[0].rows);assert.throws(()=>build(repeated,scope,now),/repeated_page/);
 const repeatedRow=input(3);for(const pass of [repeatedRow.firstPass,repeatedRow.secondPass]){pass[0].rows[1]=structuredClone(pass[0].rows[0]);pass[0].rows[2]=structuredClone(pass[0].rows[0]);}
 const snapshot=build(repeatedRow,scope,now);assert.equal(snapshot.rows.length,3);assert.equal(new Set(snapshot.rows.map(r=>r.observationId)).size,3);assert.equal(snapshot.deduplication,'none_unverified_event_identity');
});

test('positive complete scope and row bound are mandatory, without silently clipping',()=>{
 assert.throws(()=>build(input(0),scope,now),/empty_unverified/);assert.throws(()=>build(input(201),scope,now));
 assert.equal(build(input(200),scope,now).rows.length,200);assert.equal(PAYMENT_SNAPSHOT_LIMITS.maxRows,200);
});

test('unknown, zero, negative adjustment and units remain independent without default currency',()=>{
 const value=input(2);for(const pass of [value.firstPass,value.secondPass]){pass[0].rows[0].Num='0';pass[0].rows[1].QtyUnit='米';pass[0].rows[1].OutStoreNum='';delete pass[0].rows[1].YFAmount;}
 const snapshot=build(value,scope,now);assert.deepEqual(snapshot.rows[0].quantities.Num,{state:'known',raw:'0'});assert.deepEqual(snapshot.rows[1].quantities.OutStoreNum,{state:'unknown',reason:'blank'});
 assert.deepEqual(snapshot.rows[0].amounts.YFAmount,{state:'unknown',reason:'null'});assert.deepEqual(snapshot.rows[1].amounts.YFAmount,{state:'unknown',reason:'missing'});
 assert.deepEqual(snapshot.rows[0].amounts.tzamount,{state:'known',raw:'-1.00'});assert.deepEqual(snapshot.rows[1].sourceUnits.purchase,{state:'known',raw:'米'});
 for(const row of snapshot.rows)for(const field of Object.values(row.amountCurrencies))assert.equal(field.state,'unknown');
});

test('future, reversed and stale captures stop; an invalid clock never claims freshness',()=>{
 assert.throws(()=>build(input(),scope,NaN),/clock_unavailable/);assert.throws(()=>build(input(),scope,base-1),/capture_time_invalid/);
 const reversed=input();reversed.secondPass[0].capturedAt=new Date(base-1).toISOString();assert.throws(()=>build(reversed,scope,now),/capture_time_invalid/);
 assert.throws(()=>build(input(),scope,base+600000),/stale/);
});

test('read freshness expires from the oldest page and fails after scope or clock changes',()=>{
 const snapshot=build(input(),scope,now);assert.deepEqual(freshness(snapshot,scope,base+599999),{readable:true,reason:'fresh'});
 assert.deepEqual(freshness(snapshot,scope,base+600000),{readable:false,reason:'stale'});
 assert.equal(freshness(snapshot,{...scope,sourceFingerprint:sha('new')},now).reason,'source_scope_changed');assert.equal(freshness(snapshot,{...scope,salesContractNo:'OTHER'},now).readable,false);
 assert.equal(freshness(snapshot,scope,NaN).reason,'clock_unavailable');assert.equal(freshness({...snapshot,expiresAt:new Date(base+999999).toISOString()},scope,now).reason,'invalid_snapshot');
});

test('extra authority, unknown source fields and non-exact numbers cannot enter a snapshot',()=>{
 assert.throws(()=>build({...input(),enabled:true},scope,now),/invalid_shape/);
 const unknown=input();unknown.firstPass[0].rows[0].Authorization='synthetic';assert.throws(()=>build(unknown,scope,now),/unknown_field/);
 const inexact=input();inexact.firstPass[0].rows[0].Price=0.1 as unknown as string;assert.throws(()=>build(inexact,scope,now),/exact_strings_required/);
 assert.throws(()=>build(input(),{...scope,witness:{...scope.witness,id:''}},now),/invalid_scope/);
});

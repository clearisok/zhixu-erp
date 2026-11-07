import test from "node:test";
import assert from "node:assert/strict";
import { classifyQuantity,purchaseUnitCrossStats,validateQualityRequest,analyzeQuality,type QualityRequest } from "../ainuoke-source/quality-diagnostic.js";
import { inspect } from "../ainuoke-source/contract.js";
import { bindingBundle,freshMaterialBundle } from "./ainuoke-binding-fixture.js";
const stamp=Date.now();
function fixture(){
 const binding=bindingBundle(stamp),material=freshMaterialBundle(stamp),contract=Object.keys(binding.colors)[0];
 const request:QualityRequest={schemaVersion:"ainuoke-quality-request.v1",preflightSha256:"a".repeat(64),targets:[{label:"R0001",salesContractNo:contract,insideOrderNo:"SYNTHETIC-IN-OLD",colors:true,materials:true,reason:"quantity-sample"}]};
 return {request,bundle:{schemaVersion:"ainuoke-quality-diagnostic.v1",discoveryBefore:binding.discoveryBefore,discoveryAfter:binding.discoveryAfter,colors:binding.colors,materials:material.materials,reportRequests:4,authRenewals:0}};
}
test("zero, blank, malformed, negative and missing-document observations are distinct",()=>{
 assert.deepEqual([classifyQuantity(0,null),classifyQuantity(null,null),classifyQuantity("", "PO"),classifyQuantity("abc","PO"),classifyQuantity(-2,"PO"),classifyQuantity(118,null),classifyQuantity("1,234","PO")],
 ["literal-zero","blank-no-event-unverified","blank-with-document","invalid","negative","positive-without-document","positive-with-document"]);
 assert.equal(classifyQuantity(false,"PO"),"invalid");
});
test("equal totals do not collapse missing unit into unknown purchase",()=>{
 const unknown="采购来源数量缺失或无效，不能按零采购判定";
 const stats=purchaseUnitCrossStats([{unitStatus:"known",issues:[]},{unitStatus:"missing",issues:[]},{unitStatus:"known",issues:[unknown]},{unitStatus:"missing",issues:[unknown]},{unitStatus:"conflict",issues:[]}]);
 assert.deepEqual(Object.values(stats),[1,1,1,1,1]);assert.throws(()=>purchaseUnitCrossStats([{unitStatus:"bogus",issues:[]}]),/quality_unit_status_invalid/);
});
test("bounded scope rejects duplicate, foreign, extra fields and more than six color targets",()=>{
 const {request}=fixture();assert.equal(validateQualityRequest(request).targets.length,1);
 for(const change of [{targets:[]},{targets:[...request.targets,...request.targets]},{password:"never-print"},{targets:[{...request.targets[0],salesContractNo:""}]},
 {targets:Array.from({length:7},(_,i)=>({...request.targets[0],label:"R"+String(i+1).padStart(4,"0"),salesContractNo:"SC-"+i}))}])assert.throws(()=>validateQualityRequest({...request,...change}));
});
test("analysis reuses actual color and material adapters and public receipt omits identities",async()=>{
 const {request,bundle}=fixture();const result=await analyzeQuality(bundle,request,stamp);
 assert.equal(result.summary.contracts,1);assert.equal(result.summary.databaseAccess,"none");
 inspect(result.privateReport); assert.ok(!JSON.stringify(result.privateReport).includes("sizeRuleTokens"));
 const material=result.privateReport.orders[0].material;
 assert.ok(material?.rows.some(row=>row.business?.flows.purchase.parts.length));
 assert.ok(material?.groups.every(group=>group.rows.every(row=>!('business' in row))));
 assert.equal(material?.groups.reduce((n,group)=>n+group.rows.length,0),material?.rows.length);
 const text=JSON.stringify(result.summary);for(const value of [request.targets[0].salesContractNo,"SYNTHETIC-IN-OLD","protected-commercial-sentinel"])assert.ok(!text.includes(value));
 assert.ok(result.privateReport.orders[0].materialRawPages?.length);assert.equal(result.privateReport.orders[0].insideIdentityChanged,false);
});
test("invalid color is a local enrichment issue, not deletion of main order",async()=>{
 const {request,bundle}=fixture();bundle.colors[request.targets[0].salesContractNo][0].rows[0].values.CnColor="";
 const result=await analyzeQuality(bundle,request,stamp);assert.equal(result.summary.contracts,1);assert.equal(result.summary.problems[0].colors?.status,"invalid");assert.deepEqual(result.summary.problems[0].colors?.issueCodes,["BLANK_COLOR"]);
});
test("partial/foreign pages, request scope changes and discovery drift fail closed",async t=>{
 for(const name of ["partial","foreign","drift","scope","stale"])await t.test(name,async()=>{
  const {request,bundle}=fixture();if(name==="partial")Object.values(bundle.materials)[0][0].total++;
  if(name==="foreign")Object.values(bundle.materials)[0][0].queryContext.insideOrderNo="FOREIGN";
  if(name==="drift")bundle.discoveryAfter[0].rows[0].values.InsideOrderNo="CHANGED";
  if(name==="scope")delete bundle.colors[request.targets[0].salesContractNo];
  if(name==="stale")bundle.discoveryBefore[0].fetchedAt=new Date(stamp-600001).toISOString();
  if(name==="partial"){const result=await analyzeQuality(bundle,request,stamp);assert.equal(result.summary.problems[0].materials?.status,"incomplete");}
  else await assert.rejects(analyzeQuality(bundle,request,stamp));
 });
});

// No live source reads in these lineage regressions.
import {createHash} from "node:crypto";
import {verifyQualityPreflight,collectVerifiedQuality} from "../ainuoke-source/quality-diagnostic.js";
import {readinessFingerprint} from "../ainuoke-source/readiness.js";
const config={sourceKey:"synthetic",baseUrl:"https://synthetic.invalid",username:"synthetic",password:"synthetic",operatorUsername:"synthetic"};
function lineage(){const {request}=fixture();const t=request.targets[0];const report={schemaVersion:"ainuoke-live-preflight.v1",result:"READ_ONLY_FULL_PREFLIGHT_RECORDED",collectionValidation:"complete",sourceFingerprint:readinessFingerprint(config),databaseAccess:"none",sourceActivation:"not-activated",visibilityScope:"current_account_visible",stages:[{stage:"bindings",status:"validated"},{stage:"materials",status:"validated"}],discovery:{complete:true,stableAcrossStages:true,contracts:1},materials:{allVisibleContracts:true,contracts:1},orders:[{label:t.label,salesContractNo:t.salesContractNo,insideOrderNo:t.insideOrderNo}]};return {request,report};}
const encode=(report:unknown,request:QualityRequest)=>{const bytes=Buffer.from(JSON.stringify(report));request.preflightSha256=createHash("sha256").update(bytes).digest("hex");return bytes;};
test("actual preflight bytes and historical identity are verified before collector",async()=>{const {request,report}=lineage();const bytes=encode(report,request);let calls=0;await collectVerifiedQuality(config,request,bytes,async()=>{calls++;return {}});assert.equal(calls,1);assert.equal(verifyQualityPreflight(bytes,request,report.sourceFingerprint).preflightLineageVerified,true);});
test("forged hash, wrong run/account, incomplete and foreign identities never collect",async t=>{
 for(const name of ["fake-hash","modified-bytes","failed","partial","wrong-account","missing-orders","count","duplicate","label","contract","inside","stage","malformed"])await t.test(name,async()=>{
  const {request,report}=lineage();let bytes=encode(report,request);
  if(name==="failed")report.result="READ_ONLY_FULL_PREFLIGHT_INCOMPLETE";
  if(name==="partial")report.materials.allVisibleContracts=false;
  if(name==="wrong-account")report.sourceFingerprint="f".repeat(64);
  if(name==="missing-orders")report.orders=[];
  if(name==="count")report.discovery.contracts=2;
  if(name==="duplicate"){report.orders.push({...report.orders[0]});report.discovery.contracts=2;report.materials.contracts=2;}
  if(name==="label")request.targets[0].label="R9999";
  if(name==="contract")request.targets[0].salesContractNo="FOREIGN";
  if(name==="inside")request.targets[0].insideOrderNo="FOREIGN";
  if(name==="stage")report.stages[1].status="failed";
  bytes=encode(report,request);
  if(name==="fake-hash")request.preflightSha256="a".repeat(64);
  if(name==="modified-bytes")bytes=Buffer.concat([bytes,Buffer.from(" ")]);
  if(name==="malformed"){bytes=Buffer.from("{");request.preflightSha256=createHash("sha256").update(bytes).digest("hex");}
  let calls=0;await assert.rejects(collectVerifiedQuality(config,request,bytes,async()=>{calls++;return {}}));assert.equal(calls,0);
 });
});

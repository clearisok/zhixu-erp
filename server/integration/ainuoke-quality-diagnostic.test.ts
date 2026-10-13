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

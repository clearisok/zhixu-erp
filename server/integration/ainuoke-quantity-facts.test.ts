import test from "node:test";import assert from "node:assert/strict";
import {compareMaterialQuantityFacts} from "../../features/ainuoke-material-progress/quantity-facts.js";
import {projectMaterialProgress} from "../../features/ainuoke-material-progress/projection.js";
import {freshMaterialBundle} from "./ainuoke-binding-fixture.js";
import {syntheticOrder} from "./ainuoke-source-fixture.js";
test("confirmed sample arithmetic and actual purchase are separate legal facts",()=>{
 const result=compareMaterialQuantityFacts([{plannedConsumption:.021,lossRate:10,garmentQuantity:5000}],118,"known");
 for(const [usage,loss,theory,actual] of [[.021,10,115.5,118],[.067,5,351.75,356],[.0008,10,4.4,6]]){const r=compareMaterialQuantityFacts([{plannedConsumption:usage,lossRate:loss,garmentQuantity:5000}],actual,"known");assert.equal(r.theoreticalUsageCandidate,theory);assert.equal(r.relativeDifference,Number((actual-theory).toFixed(9)));}
 assert.equal(result.theoreticalUsageCandidate,115.5);assert.equal(result.actualPurchase,118);assert.equal(result.relativeDifference,2.5);assert.equal(result.interpretation,"observation-only");
 assert.equal(result.verification,"source-calculation-unverified");
});
test("unknown, zero, inconsistent inputs and unit issues never invent a theory",()=>{
 for(const value of [null,"",false,-1,"invalid"])assert.equal(compareMaterialQuantityFacts([{plannedConsumption:value,lossRate:0,garmentQuantity:5000}],118,"known").theoreticalUsageCandidate,null);
 assert.equal(compareMaterialQuantityFacts([{plannedConsumption:0,lossRate:0,garmentQuantity:5000}],0,"known").theoreticalUsageCandidate,0);
 for(const status of ["missing","conflict"] as const)assert.equal(compareMaterialQuantityFacts([{plannedConsumption:.021,lossRate:10,garmentQuantity:5000}],118,status).relativeDifference,null);
 assert.equal(compareMaterialQuantityFacts([{plannedConsumption:1,lossRate:0,garmentQuantity:1},{plannedConsumption:2,lossRate:0,garmentQuantity:1}],118,"known").theoreticalUsageCandidate,null);
});
test("formal requirement, four streams and two-row purchase dedup remain unchanged",()=>{
 const b=freshMaterialBundle();const pages=Object.values(b.materials)[0];
 for(const page of pages)for(const row of page.rows){row.values.QtyUnit="个";row.values.Num=.021;row.values.Lost=10;row.values.StyleNum=5000;}
 const view=projectMaterialProgress(syntheticOrder,pages);assert.equal(view.sourceStatus,"ready");
 assert.ok(view.rows.some(r=>r.quantityComparison?.theoreticalUsageCandidate===115.5));
 assert.ok(view.duplicateEvents>0);assert.equal(view.rows[0].demand.requiredQuantity,100);
 assert.equal(view.rows[0].purchaseShortfall,Math.max(0,100-view.rows[0].purchased!));
});

test("empty loss, overflow, unknown actual and negative observed difference are explicit",()=>{
 for(const lossRate of [null,"",false,-1])assert.equal(compareMaterialQuantityFacts([{plannedConsumption:1,lossRate,garmentQuantity:1}],1,"known").theoreticalUsageCandidate,null);
 assert.equal(compareMaterialQuantityFacts([{plannedConsumption:Number.MAX_VALUE,lossRate:100,garmentQuantity:5000}],1,"known").theoreticalUsageCandidate,null);
 assert.equal(compareMaterialQuantityFacts([{plannedConsumption:1,lossRate:0,garmentQuantity:10}],null,"known").relativeDifference,null);
 assert.equal(compareMaterialQuantityFacts([{plannedConsumption:1,lossRate:0,garmentQuantity:10}],6,"known").relativeDifference,-4);
});
test("356 from two distinct source rows remains one event and all formal quantities retain their meanings",()=>{
 const b=freshMaterialBundle();const page=Object.values(b.materials)[0][0];const row=structuredClone(page.rows.find(r=>r.values.id==="SYNTHETIC-ready")!);
 Object.assign(row.values,{TotalNum:100,Num:.067,Lost:5,StyleNum:5000,cgnum:356,rknum:200,CYNum:150,OutStoreNum:100});
 const second=structuredClone(row);second.sourceRowIdentity+='-second';page.rows=[row,second];page.total=2;
 const r=projectMaterialProgress(syntheticOrder,[page]).rows[0];
 assert.equal(r.purchases.length,1);assert.equal(r.purchases[0].quantity,356);
 assert.deepEqual({required:r.demand.requiredQuantity,purchased:r.purchased,inbound:r.inbound,shipped:r.shipped,outbound:r.outbound,shortfall:r.purchaseShortfall,excess:r.purchaseExcess,pending:r.pendingInbound,status:r.status},{required:100,purchased:356,inbound:200,shipped:150,outbound:100,shortfall:0,excess:256,pending:156,status:'ready'});
 assert.equal(r.quantityComparison?.theoreticalUsageCandidate,351.75);assert.equal(r.quantityComparison?.relativeDifference,4.25);assert.deepEqual(r.issues,[]);
});

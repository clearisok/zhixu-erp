import test from "node:test";
import assert from "node:assert/strict";
import {previewSelectedBindings,previewBindings} from "../ainuoke-source/binding.js";
import {previewAdditions} from "../ainuoke-source/additions.js";
import {parseSourceArguments} from "../ainuoke-source/cli.js";
import {additionBundle,bindingBundle} from "./ainuoke-binding-fixture.js";

test("selected first binding keeps full discovery and domain separates the review",async()=>{
 const b=additionBundle(1000000,3,[0,2]);const selected=Object.keys(b.colors);
 const p=await previewSelectedBindings(b,selected,1000000);
 assert.equal(p.visibleContracts,3);assert.equal(p.preview.candidates.length,2);
 assert.deepEqual(p.preview.candidates.map(c=>c.source.sourceId),["synthetic-1","synthetic-3"]);
 assert.equal(p.reviewHash,(await previewSelectedBindings(additionBundle(1001000,3,[0,2]),selected.reverse(),1001000)).reviewHash);
 assert.notEqual(p.reviewHash,(await previewAdditions(b,selected,[],1000000)).reviewHash);
 const all=additionBundle(1000000,3,[0,1,2]);
 assert.notEqual((await previewSelectedBindings(all,Object.keys(all.colors),1000000)).reviewHash,(await previewBindings(bindingBundle(1000000,3),1000000)).reviewHash);
});
test("selection, full discovery and exact detail evidence cannot be bypassed",async t=>{
 const cases:Record<string,(b:ReturnType<typeof additionBundle>,s:string[])=>void>={
  empty:(_,s)=>{s.length=0;},duplicate:(_,s)=>{s.push(s[0]);},unknown:(_,s)=>{s[0]="NOT-VISIBLE";},
  comma:(_,s)=>{s[0]+=",OTHER";},oversize:(_,s)=>{s.push(...Array.from({length:25},(_,i)=>"X"+i));},
  missing:b=>{b.colors={};},extra:b=>{b.colors.OTHER=Object.values(b.colors)[0];},
  partial:b=>{b.discoveryBefore[0].total=4;},changed:b=>{b.discoveryAfter[0].rows[2].values.Num=42;},
  stale:b=>{b.discoveryBefore[0].fetchedAt=new Date(1).toISOString();},
  wrongContract:b=>{Object.values(b.colors)[0][0].queryContext.salesContractNo="WRONG";},
  unknownQuantity:b=>{b.discoveryBefore[0].rows[0].values.Num=null;b.discoveryAfter=structuredClone(b.discoveryBefore);},
 };
 for(const [name,change]of Object.entries(cases))await t.test(name,async()=>{const b=additionBundle(1000000,3,[0]);const s=Object.keys(b.colors);change(b,s);await assert.rejects(previewSelectedBindings(b,s,1000000));});
});
test("selected CLI requires explicit target, selection and write review; never falls into full bind",()=>{
 const cfg="--config=/private/source.json",target="--expected-target="+"a".repeat(64),review="--expected-preview="+"b".repeat(64),contracts="--contracts=SYNTHETIC-A";
 for(const action of ["preview-bind-selected","bind-selected"]){
  const args=[cfg,target,contracts,"--"+action+"=demo-team",...(action==="bind-selected"?[review]:[])];
  assert.equal(parseSourceArguments(args).action,action);
  for(const remove of [cfg,target,contracts,...(action==="bind-selected"?[review]:[])])assert.throws(()=>parseSourceArguments(args.filter(a=>a!==remove)));
  assert.throws(()=>parseSourceArguments([...args,"--schedule=demo-team"]));
 }
 assert.throws(()=>parseSourceArguments([cfg,target,review,contracts,"--bind=demo-team"]));
});

test("color InsideOrderNo drift stays evidence; discovery identity is never replaced",async()=>{
 const b=additionBundle(1000000,3,[0]);Object.values(b.colors)[0][0].rows[0].values.insideorderno="COLOR-OLD-IDENTITY";
 const p=await previewSelectedBindings(b,Object.keys(b.colors),1000000);
 assert.equal(p.preview.candidates[0].source.insideOrderNo,"SYNTHETIC-IN-OLD");
 assert.match(JSON.stringify(p.preview.candidates[0]),/insideOrderNoDrift/);
});

test("selected preview preserves pending zero colors and raw missing quantity",async()=>{
 const b=additionBundle(1000000,2,[0]);const raw=Object.values(b.colors)[0][0].rows[0];
 raw.values.SizeNum=null;raw.values.Size1=null;raw.values.Size2=null;
 const result=await previewSelectedBindings(b,Object.keys(b.colors),1000000);
 const color=result.preview.candidates[0].colors[0];assert.equal(color.quantity,0);
 assert.match(JSON.stringify(color),/quantityPendingConfirmation/);assert.equal(raw.values.SizeNum,null);
});

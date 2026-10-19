import test from "node:test";
import assert from "node:assert/strict";
import { previewBindings } from "../ainuoke-source/binding.js";
import { SourceError } from "../ainuoke-source/contract.js";
import { runSchedule,schedulePolicy } from "../ainuoke-source/scheduler.js";
import { parseSourceArguments } from "../ainuoke-source/cli.js";
import { bindingBundle } from "./ainuoke-binding-fixture.js";

test("binding uses every lifecycle, formal colors, stable digest across fetch times and exact source fields",async()=>{
 const first=await previewBindings(bindingBundle(1000000,2),1000000);
 assert.equal(first.preview.candidates.length,2);assert.equal(first.preview.coverage.usable,2);
 assert.equal(first.preview.candidates[0].colors[0].quantity,100);
 const second=await previewBindings(bindingBundle(1001000,2),1001000);assert.equal(first.reviewHash,second.reviewHash);
 const b=bindingBundle(1000000);b.discoveryBefore[0].rows[0].values.CustomerName="变更客户";b.discoveryAfter=structuredClone(b.discoveryBefore);
 assert.notEqual(first.reviewHash,(await previewBindings(b,1000000)).reviewHash);
});
test("missing/invalid color enrichment never invents colors or removes the main order",async()=>{
 for(const invalid of [false,true]){
  const b=bindingBundle();const p=Object.values(b.colors)[0][0];
  if(invalid)p.rows[0].values.CnColor="";else{p.rows=[];p.total=0;}
  const r=await previewBindings(b);assert.equal(r.preview.candidates.length,1);assert.equal(r.preview.candidates[0].colors.length,0);
  assert.equal(r.preview.candidates[0].colorDetailStatus,invalid?"invalid":"missing");
 }
});
test("preview rejects unknown quantity, invalid date, partial colors, wrong scope, stale/future and changed discovery",async t=>{
 const cases:Record<string,(b:ReturnType<typeof bindingBundle>)=>void>={
  "null quantity":b=>{b.discoveryBefore[0].rows[0].values.Num=null;b.discoveryAfter=structuredClone(b.discoveryBefore);},
  "blank quantity":b=>{b.discoveryBefore[0].rows[0].values.Num=" ";b.discoveryAfter=structuredClone(b.discoveryBefore);},
  "invalid calendar date":b=>{b.discoveryBefore[0].rows[0].values.DeliveryDate="2026-02-30";b.discoveryAfter=structuredClone(b.discoveryBefore);},
  "missing colors":b=>{b.colors={};},
  "partial color page":b=>{Object.values(b.colors)[0][0].total=2;},
  "foreign query":b=>{Object.values(b.colors)[0][0].queryContext.salesContractNo="FOREIGN";},
  "future":b=>{b.discoveryBefore[0].fetchedAt=new Date(Date.now()+100000).toISOString();},
  "stale":b=>{b.discoveryBefore[0].fetchedAt="2000-01-01T00:00:00Z";},
  "raw quantity changed with unchanged row identity":b=>{b.discoveryAfter[0].rows[0].values.Num=200;},
  "changed discovery":b=>{b.discoveryAfter[0].rows[0].values.Status="变更";},
  "secret field":b=>{b.discoveryBefore[0].rows[0].values.password="not-real";},
 };
 for(const [name,change]of Object.entries(cases))await t.test(name,async()=>{const b=bindingBundle();change(b);await assert.rejects(previewBindings(b),SourceError);});
});
test("scheduler serializes cycles, backs off, recovers and aborts without another capture",async()=>{
 const signal=new AbortController();const waits:number[]=[];const states:string[]=[];let calls=0,active=0;
 await runSchedule({signal:signal.signal,policy:schedulePolicy(60000,240000),capture:async()=>{
  assert.equal(++active,1);const n=++calls;await Promise.resolve();active--;if(n===1||n===2)throw new SourceError("source_unavailable");
 },emit:e=>states.push(e.state),wait:async ms=>{waits.push(ms);if(waits.length===3)signal.abort();}});
 assert.equal(calls,3);assert.deepEqual(waits,[120000,240000,60000]);assert.deepEqual(states,["retrying","retrying","captured"]);
});
test("invalid credentials and revoked operator stop instead of retrying; disabled never runs",async()=>{
 for(const code of ["invalid_credential","source_actor_unavailable","forbidden"]){
 let calls=0;await assert.rejects(runSchedule({signal:new AbortController().signal,policy:schedulePolicy(),capture:async()=>{calls++;throw new SourceError(code);},emit:()=>{},wait:async()=>{throw Error("must not retry");}}),SourceError);assert.equal(calls,1);
 }
 const c=new AbortController();c.abort();await runSchedule({signal:c.signal,policy:schedulePolicy(),capture:async()=>{throw Error("must not run");},emit:()=>{}});
 for(const n of [0,59999,Infinity,NaN])assert.throws(()=>schedulePolicy(n),SourceError);
});
test("CLI disallows implicit actions, duplicates, extra switches and binding without reviewed hash",()=>{
 const sha="a".repeat(64);const cfg="--config=/private/source.json";const target="--expected-target="+sha;
 assert.equal(parseSourceArguments(["--schedule=first-team",target,cfg]).action,"schedule");
 assert.equal(parseSourceArguments(["--bind=first-team",target,cfg,"--expected-preview="+sha]).action,"bind");
 for(const args of [[],[cfg],[cfg,"--check","--execute=first-team"],[cfg,"--bind=first-team",target],[cfg,"--check","--check"],[cfg,"--check","--migrate"],[cfg,"--execute=first-team",target,"--interval-ms=1"]])assert.throws(()=>parseSourceArguments(args),SourceError);
});


test("binding preview excludes only approved empty placeholders and retains exclusion evidence", async()=>{
 const b=bindingBundle();const page=Object.values(b.colors)[0][0];
 const empty=structuredClone(page.rows[0]);empty.sourceRowIdentity="6087105:sha256:synthetic-empty";
 empty.values.CnColor="";empty.values.SizeNum=null;
 for(let slot=1;slot<=26;slot++)empty.values[`Size${slot}`]=null;
 page.rows.push(empty,structuredClone(empty));page.total=page.rows.length;
 const result=await previewBindings(b);
 assert.equal(result.preview.candidates[0].colorDetailStatus,"usable");
 assert.equal(result.preview.candidates[0].colors.length,1);
 assert.match(JSON.stringify(result.preview.candidates[0]),/EMPTY_PLACEHOLDER_EXCLUDED/);
 empty.values.CnColor="Synthetic named unknown";
 const changed=await previewBindings(b);
 assert.equal(changed.preview.candidates[0].colorDetailStatus,"invalid");
 assert.notEqual(result.reviewHash,changed.reviewHash);
});

import assert from "node:assert/strict";
import test from "node:test";
import { createSyntheticQuoteFixture } from "../../../../server/integration/quote-fixture.js";
import { quoteSnapshotFromBrowser } from "../../../../server/quotes/model.js";
import { projectQuoteResponse, costRestrictedQuote } from "../../../../server/quotes/quote-response.js";
import { restoreRestrictedQuoteCosts } from "../../../../server/quotes/restricted-save.js";
import { editableRecord } from "../quote-server-editor-adapter.js";
import { createQuoteServerClient } from "../quote-server-client.js";
import type { TrustedIdentity } from "../../../../server/auth/session.js";
const actor:TrustedIdentity={internalUserId:"1",userId:"synthetic",username:"synthetic",userName:"Synthetic",permissions:["quote.view"]};
const full=()=>({quote:quoteSnapshotFromBrowser(createSyntheticQuoteFixture("restricted-cost-unit")),version:4});
test("allowlist drops future nested/derived costs from every Revision/PV without mutating the saved aggregate",()=>{
 const record=full();Object.assign(record.quote.revisions[0].priceVersions[0],{futureCalculatedCost:"SECRET-FUTURE-COST"});
 const before=structuredClone(record);const projected=projectQuoteResponse(actor,record);
 assert.equal(projected.costVisibility,"restricted");assert.equal(JSON.stringify(projected).includes("SECRET-FUTURE-COST"),false);assert.deepEqual(record,before);
 assert.throws(()=>editableRecord(projected),/restricted/);
});
test("restricted metadata roundtrip restores exact costs/null/zero and immutable historical rows",()=>{
 const record=full(),view=costRestrictedQuote(record.quote);view.revisions.at(-1)!.baseInfo.styleName="SAFE-NAME";
 const next=restoreRestrictedQuoteCosts(view,record.quote);assert.deepEqual(next.revisions[0],record.quote.revisions[0]);
 assert.deepEqual(next.revisions.at(-1)!.priceVersions,record.quote.revisions.at(-1)!.priceVersions);assert.deepEqual(next.activeEstimateCost,record.quote.activeEstimateCost);
 assert.equal(next.revisions[0].priceVersions[0].fabrics[0].unitPrice,"0");assert.equal(next.revisions[0].priceVersions[0].fabrics[0].segmentLengthCm,null);
});
test("restricted client sends metadata only, no visibility authority; no-store and no Browser cache access",async()=>{
 const projected=projectQuoteResponse(actor,full());assert.ok(projected.costVisibility==="restricted");
 const original=Object.getOwnPropertyDescriptor(globalThis,"window");let calls=0;
 Object.defineProperty(globalThis,"window",{configurable:true,get(){throw new Error("Browser cache forbidden");}});
 try {
  const client=createQuoteServerClient({fetchImpl:async(_url,init)=>{calls++;assert.equal(init?.cache,"no-store");
   if(init?.body){const body=JSON.parse(String(init.body));assert.equal(Object.hasOwn(body.quote,"costVisibility"),false);assert.equal(JSON.stringify(body).includes('"labor":'),false);}
   return new Response(JSON.stringify({quote:projected}),{status:200,headers:{"Content-Type":"application/json"}});
  }});
  const read=await client.getById(projected.quote.id);assert.ok(read.costVisibility==="restricted");await client.save(read.quote,read.version);assert.equal(calls,2);
 }finally{if(original)Object.defineProperty(globalThis,"window",original);else Reflect.deleteProperty(globalThis,"window");}
});
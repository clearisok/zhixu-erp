import assert from "node:assert/strict";
import test from "node:test";
import { startCommercialSecurityFixture } from "./commercial-security-fixture.js";

test("Actual session HTTP: Quote cost and both shared CCT routes deny amount disclosure",async t=> {
 const x=await startCommercialSecurityFixture(); t.after(x.close);
 const cookie=await x.user("commercial-viewer",["quote.view","order.view"]);
 await t.test("quote.view without quote.cost.view cannot read aggregate internal cost",async()=> {
  const result=await x.request(x.quotePath,cookie); assert.equal(result.response.status,200); assert.equal(result.text.includes("98765"),false); assert.equal(result.body.quote.costVisibility,"restricted");
 });
 await t.test("order.view cannot read shared sale/labor amounts",async()=> {
  const result=await x.request(x.orderPath,cookie); assert.equal(result.response.status,200);
  assert.deepEqual(result.body.confirmedCommercialTerms.current.sale,{visibility:"restricted"}); assert.deepEqual(result.body.confirmedCommercialTerms.current.labor,{visibility:"restricted"});
  assert.equal(/12345|67890/.test(result.text),false);
 });
 await t.test("quote.view cannot read linked shared sale/labor amounts",async()=> {
  const result=await x.request(x.quoteTermsPath,cookie); assert.equal(result.response.status,200);
  assert.deepEqual(result.body.confirmedCommercialTerms.current.sale,{visibility:"restricted"}); assert.deepEqual(result.body.confirmedCommercialTerms.current.labor,{visibility:"restricted"});
  assert.equal(/12345|67890/.test(result.text),false);
 });
});

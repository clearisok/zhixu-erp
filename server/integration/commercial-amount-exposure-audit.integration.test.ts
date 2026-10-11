import assert from "node:assert/strict";
import test from "node:test";
import { startCommercialSecurityFixture } from "./commercial-security-fixture.js";

test("Gate0: actual session HTTP reproduces three commercial amount exposures",async t=> {
 const x=await startCommercialSecurityFixture(); t.after(x.close);
 const cookie=await x.user("commercial-viewer",["quote.view","order.view"]);
 await t.test("quote.view without quote.cost.view reads aggregate internal cost",async()=> {
  const result=await x.request(x.quotePath,cookie); assert.equal(result.response.status,200); assert.ok(result.text.includes("98765"));
 });
 await t.test("order.view reads shared sale/labor amounts (SECURITY PENDING)",async()=> {
  const result=await x.request(x.orderPath,cookie); assert.equal(result.response.status,200);
  assert.equal(result.body.confirmedCommercialTerms.current.customerConfirmedPrice,"12345"); assert.equal(result.body.confirmedCommercialTerms.current.confirmedLaborPrice,"67890");
 });
 await t.test("quote.view reads linked shared sale/labor amounts (SECURITY PENDING)",async()=> {
  const result=await x.request(x.quoteTermsPath,cookie); assert.equal(result.response.status,200);
  assert.equal(result.body.confirmedCommercialTerms.current.customerConfirmedPrice,"12345"); assert.equal(result.body.confirmedCommercialTerms.current.confirmedLaborPrice,"67890");
 });
});
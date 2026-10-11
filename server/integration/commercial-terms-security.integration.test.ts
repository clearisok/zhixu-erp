import assert from "node:assert/strict";
import test from "node:test";
import type { PermissionKey } from "../../features/permissions/model/permissions.js";
import { startCommercialSecurityFixture } from "./commercial-security-fixture.js";

const keys: PermissionKey[] = ["commercial.sale.view","commercial.sale.edit","commercial.labor.view","commercial.labor.edit"];
test("actual HTTP commercial fields: all grants, partial writes, null/zero, CAS and rollback", async t => {
  const x=await startCommercialSecurityFixture(); t.after(x.close);
  const base:PermissionKey[]=["quote.view","quote.confirm","order.view","order.edit","audit_log.view"];
  const readRow=async()=> (await x.pool.query("SELECT * FROM confirmed_commercial_terms ORDER BY id")).rows;
  for(let mask=0;mask<16;mask++) await t.test(`four-key combination ${mask}`,async()=> {
    const grants=keys.filter((_,i)=>mask & (1<<i));
    const cookie=await x.user(`combination-${mask}`,[...base,...grants]);
    for(const path of [x.orderPath,x.quoteTermsPath]) {
      const result=await x.request(path,cookie); assert.equal(result.response.status,200);
      const current=result.body.confirmedCommercialTerms.current;
      assert.equal(current.sale.visibility,mask&1?"allowed":"restricted");
      assert.equal(current.labor.visibility,mask&4?"allowed":"restricted");
      assert.equal(result.text.includes('"12345"'),Boolean(mask&1));
      assert.equal(result.text.includes('"67890"'),Boolean(mask&4));
      assert.equal(Object.hasOwn(current,"customerConfirmedPrice"),false);
    }
    // No-op values still require permissions for every explicitly submitted field.
    for(const [body,permitted] of [
      [{customerConfirmedPrice:"12345"},(mask&3)===3],
      [{confirmedLaborPrice:"67890"},(mask&12)===12],
      [{customerConfirmedPrice:"12345",confirmedLaborPrice:"67890",laborCurrency:"USD"},mask===15],
    ] as const) {
      const before=await readRow(); const result=await x.request(x.orderPath,cookie,{expectedVersion:1,...body},"PATCH");
      assert.equal(result.response.status,permitted?200:403,result.text);
      assert.deepEqual(await readRow(),before);
    }
  });
  const sale=await x.user("sale-only",[...base,"commercial.sale.view","commercial.sale.edit"]);
  const labor=await x.user("labor-only",[...base,"commercial.labor.view","commercial.labor.edit"]);
  await t.test("single-field null/zero preserves hidden counterpart, audit and stale CAS",async()=> {
    let result=await x.request(x.orderPath,sale,{expectedVersion:1,customerConfirmedPrice:null},"PATCH");
    assert.equal(result.response.status,200,result.text); assert.equal(result.text.includes("67890"),false);
    let rows=await readRow();assert.equal(rows[0].customer_confirmed_price,null);assert.equal(rows[0].confirmed_labor_price,"67890");
    result=await x.request(x.orderPath,sale,{expectedVersion:2,customerConfirmedPrice:"0"},"PATCH");
    assert.equal(result.response.status,200);assert.equal(result.body.confirmedCommercialTerms.current.sale.value.price,"0");
    result=await x.request(x.orderPath,labor,{expectedVersion:3,confirmedLaborPrice:"0"},"PATCH");
    assert.equal(result.response.status,200);assert.equal(result.body.confirmedCommercialTerms.current.labor.value.price,"0");
    rows=await readRow();assert.equal(rows[0].customer_confirmed_price,"0");assert.equal(rows[0].labor_currency,"USD");
    assert.equal((await x.request(x.orderPath,sale,{expectedVersion:1,customerConfirmedPrice:"9"},"PATCH")).response.status,409);
    assert.equal((await x.request(x.orderPath,sale,{expectedVersion:4,customerConfirmedPrice:"9",confirmedLaborPrice:null,laborCurrency:null},"PATCH")).response.status,403);
    assert.deepEqual(await readRow(),rows);
    const logs=(await x.pool.query("SELECT * FROM operation_logs WHERE entity_type='ConfirmedCommercialTerms'")).rows;
    assert.equal(logs.length,3);assert.ok(logs.some(row=>JSON.stringify(row.before_data).includes("67890")));
  });
  await t.test("unlinked order supports explicit currency; linked order cannot change it",async()=> {
    const id=(await x.pool.query("INSERT INTO sales_orders(creation_source) VALUES ('manual') RETURNING id")).rows[0].id;
    const path=`/api/v1/sales-orders/${id}/confirmed-commercial-terms`;
    assert.equal((await x.request(path,labor,{expectedVersion:0,confirmedLaborPrice:"1"},"PATCH")).response.status,400);
    const result=await x.request(path,labor,{expectedVersion:0,confirmedLaborPrice:"1.23456789123456789",laborCurrency:"CNY"},"PATCH");
    assert.equal(result.response.status,200,result.text); assert.equal(result.body.confirmedCommercialTerms.current.labor.value.price,"1.23456789123456789");
    assert.equal((await x.request(x.orderPath,labor,{expectedVersion:4,laborCurrency:"CNY"},"PATCH")).response.status,409);
  });
  await t.test("late audit failure rolls back amount and version",async()=> {
    const before=await readRow();
    await x.pool.query("CREATE FUNCTION reject_commercial_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='ConfirmedCommercialTerms' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$");
    await x.pool.query("CREATE TRIGGER reject_commercial_audit BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION reject_commercial_audit()");
    const result=await x.request(x.orderPath,sale,{expectedVersion:4,customerConfirmedPrice:"99"},"PATCH");
    assert.equal(result.response.status,500); assert.equal(result.text.includes("synthetic audit failure"),false);
    assert.deepEqual(await readRow(),before);
  });
});

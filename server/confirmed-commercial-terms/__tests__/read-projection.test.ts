import assert from "node:assert/strict";
import test from "node:test";
import { createCommercialReadProjection } from "../read-projection.js";
import type { TrustedIdentity } from "../../auth/session.js";
import type { ConfirmedCommercialTermsDto } from "../../../features/confirmed-commercial-terms/model.js";
const actor:TrustedIdentity={internalUserId:"1",userId:"synthetic",username:"synthetic",userName:"Synthetic",permissions:["quote.view","order.view","quote.cost.view"]};
const dto:ConfirmedCommercialTermsDto={linkage:"linked",scope:"quote",quoteProvenance:{quoteId:"q",revisionId:"r",priceVersionId:"p"},associatedSalesOrderIds:["A","B"],current:{id:"terms",customerConfirmedPrice:"12345",customerConfirmedPriceCurrency:"CNY",confirmedLaborPrice:"67890",laborCurrency:"USD",version:3,createdAt:"2026-01-01",updatedAt:"2026-01-02"}};
test("commercial read projection default-denies each field even to cost reader; immutable input",()=>{
 const before=structuredClone(dto);const value=createCommercialReadProjection()(actor,dto);
 assert.deepEqual(value.current?.sale,{visibility:"restricted"});assert.deepEqual(value.current?.labor,{visibility:"restricted"});
 for(const secret of ["12345","67890"])assert.equal(JSON.stringify(value).includes(secret),false);assert.deepEqual(dto,before);
});
test("sale/labor independently injected; Quote/Order share same id/version and exact current facts",()=>{
 for(const sale of [false,true])for(const labor of [false,true]){
  const read=createCommercialReadProjection(()=>({sale,labor}));
  const q=read(actor,dto),o=read(actor,{...dto,scope:"sales_order"});assert.deepEqual(q.current,o.current);
  assert.equal(JSON.stringify(q).includes("12345"),sale);assert.equal(JSON.stringify(q).includes("67890"),labor);
 }
});
test("null and zero remain distinct from restricted; linked/unlinked/absent retain metadata",()=>{
 const read=createCommercialReadProjection(()=>({sale:true,labor:true}));
 for(const value of [null,"0","0.000000000000000001"]){const x=read(actor,{...dto,linkage:"unlinked",quoteProvenance:null,current:{...dto.current!,customerConfirmedPrice:value,confirmedLaborPrice:value}});
 assert.deepEqual(x.current?.sale,{visibility:"allowed",value:{price:value,currency:"CNY"}});assert.deepEqual(x.current?.labor,{visibility:"allowed",value:{price:value,currency:"USD"}});}
 assert.equal(read(actor,{...dto,current:null}).current,null);
});
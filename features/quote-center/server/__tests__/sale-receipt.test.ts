import test from 'node:test';import assert from 'node:assert/strict';import{saleReceipt,saleReceiptComplete}from'../sale-receipt';
const requestId='00000000-0000-4000-8000-000000000001',operationId='00000000-0000-4000-8000-000000000002',order='00000000-0000-4000-8000-000000000003',version='00000000-0000-4000-8000-000000000004';
test('not_found, pending and failed receipts cannot release an original on POST success',()=>{
 for(const value of [{state:'not_found',requestId,items:[]},{state:'pending',requestId,operationId,items:[{salesOrderId:order,status:'pending'}]},
  {state:'recorded',requestId,operationId,items:[{salesOrderId:order,status:'failed',code:'sale_adjustment_failed',commercialVersionId:null}]}])assert.equal(saleReceiptComplete(saleReceipt(value,requestId)),false);
});
test('terminal success must match original request, operation, complete physical targets and versions',()=>{
 const receipt={state:'recorded',requestId,operationId,items:[{salesOrderId:order,status:'updated',code:null,commercialVersionId:version}]},expected={operationId,orderIds:[order]};
 assert.equal(saleReceiptComplete(saleReceipt(receipt,requestId,expected)),true);
 for(const value of [{...receipt,requestId:version},{...receipt,operationId:version},{...receipt,items:[]},{...receipt,items:[{...receipt.items[0],commercialVersionId:null}]},{...receipt,items:[...receipt.items,...receipt.items]},{...receipt,state:'pending'},{...receipt,price:'100'}])assert.throws(()=>saleReceipt(value,requestId,expected));
 assert.throws(()=>saleReceipt(receipt,requestId,{operationId,orderIds:[version]}));
});

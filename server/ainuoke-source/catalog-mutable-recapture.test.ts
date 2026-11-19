import test from 'node:test';
import assert from 'node:assert/strict';
import {selectedConfig,selectedWorkerFixture} from '../integration/selected-source-fixture.js';
import {previewCatalog} from './catalog.js';
import {CatalogConsistencyError} from './catalog-consistency.js';
import {validateCatalogDiagnostic} from './sync-diagnostics.js';
import {recapturePagesFor} from './catalog-diagnostics.js';
import type {AdditionDiscoveryBundle} from './additions.js';

const raw=selectedWorkerFixture('catalog-discovery','',[],630) as {bundle:AdditionDiscoveryBundle};
const absent=Symbol('absent');
function pair(before:unknown,after:unknown){
 const bundle=structuredClone(raw.bundle);
 for(const [pages,value] of [[bundle.discoveryBefore,before],[bundle.discoveryAfter,after]] as const){
  const row=pages[12].rows[0];if(value!==absent)row.values.Price=value as string|number|null;
 }
 return bundle;
}
test('630 rows / 13 pages: identical Price stays exact and publishable',async()=>{
 const b=pair('12.000','12.000'),checked=await previewCatalog(b);
 assert.equal(checked.rows.length,630);assert.equal(checked.bundle.discoveryAfter[12].rows[0].values.Price,'12.000');
});
for(const [label,before,after,classification] of [
 ['value',12,13,'value_changed'],['appearance',absent,12,'field_appeared'],['disappearance',12,absent,'field_disappeared'],
 ['null',null,12,'null_to_value'],['to null',12,null,'value_to_null'],['empty','',12,'empty_to_value'],
 ['type','12',12,'type_changed'],['format','012.0','12.00','numeric_format_or_precision_changed'],
 ['precision','12.00001','12.00002','value_changed'],['decimals','12.000','12.0','numeric_format_or_precision_changed'],
] as const)test(`630 rows / 13 pages Price ${label} is mutable, with exact field states and page`,async()=>{
 const b=pair(before,after);
 await assert.rejects(previewCatalog(b),error=>{
  assert.ok(error instanceof CatalogConsistencyError);assert.equal(error.code,'catalog_business_content_changed');
  assert.deepEqual(error.catalogChange,{beforeRows:630,afterRows:630,added:0,removed:0,identityChanges:0,changedFields:['Price'],scopeChanged:false});
  const d=error.differences[0];assert.equal(d.page,13);assert.equal(d.rowId,'601');assert.equal(d.salesContractNo,'SYN-SALES-601');
  assert.equal(d.classification,classification);assert.equal(d.beforeExists,before!==absent);assert.equal(d.afterExists,after!==absent);
  assert.deepEqual(d.beforeValue,before===absent?null:before);assert.deepEqual(d.afterValue,after===absent?null:after);
  assert.notEqual(d.beforeHash,d.afterHash);assert.deepEqual(recapturePagesFor(error.differences),[13]);return true;
 });
});
test('unknown structures, stable identities and pagination stay strictly blocked',async()=>{
 for(const [field,value] of Object.entries({id:'other',BillNo:'OTHER',InsideOrderNo:'OTHER',Unrecognized:{x:1},Price:{amount:12}})){
  const b=pair(12,13);b.discoveryAfter[12].rows[0].values[field]=value as string;
  await assert.rejects(previewCatalog(b),{code:'catalog_identity_or_scope_changed'});
 }
 for(const mutation of [(b:AdditionDiscoveryBundle)=>b.discoveryAfter.pop(),(b:AdditionDiscoveryBundle)=>{b.discoveryAfter[1]=b.discoveryAfter[0];}]){
  const b=pair(12,13);mutation(b);await assert.rejects(previewCatalog(b));
 }
});
test('targeted actual SDK reread followed by NEW complete double pass validates; pages alone cannot publish',async()=>{
 const r=selectedWorkerFixture('catalog-discovery',`if report == 6086103:
        mutate_rows(payload, lambda rows: [row.update(Price='12.000') for row in rows])`,[],630,undefined,[13]);
 const checked=await validateCatalogDiagnostic(r,selectedConfig,{mode:'catalog-discovery',contracts:[]},Date.now(),[],[13]);
 assert.equal(checked.capture.result,'complete');assert.equal(checked.capture.metrics.reportRequests,27);
 assert.equal(checked.diagnostics.filter(d=>d.page===13).length,3);
 await assert.rejects(validateCatalogDiagnostic(r,selectedConfig,{mode:'catalog-discovery',contracts:[]},Date.now()),/selected_source_scope_mismatch/);
 const corrupted=structuredClone(r) as {capture:{bundle:AdditionDiscoveryBundle}};corrupted.capture.bundle.discoveryAfter.pop();
 await assert.rejects(validateCatalogDiagnostic(corrupted,selectedConfig,{mode:'catalog-discovery',contracts:[]},Date.now(),[],[13]));
});

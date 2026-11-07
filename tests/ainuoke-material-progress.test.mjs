import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { projectMaterialProgress, filterProgressRows } from '../features/ainuoke-material-progress/projection.ts';
import { createSyntheticMaterialSource, syntheticOrder } from '../features/ainuoke-material-progress/synthetic-source.ts';
import { deriveMaterialStatuses } from '../features/style-progress/service/style-progress-service.ts';
import { buildAinuokeMaterialApiPreview } from '../features/style-progress/service/ainuoke-material-api-preview.ts';

const complete = () => createSyntheticMaterialSource();
const byCode = (view, code) => view.rows.find(row => row.demand.materialCode === `SYNTHETIC-MAT-${code}`);
const project = pages => projectMaterialProgress(syntheticOrder, pages);
test('synthetic complete Source reuses canonical groups, Source/event dedup and child variants', () => {
  const view = project(complete());
  assert.equal(view.sourceStatus, 'ready');
  assert.equal(view.groups.length, 4); assert.equal(view.rows.length, 6);
  assert.equal(view.factoryExcluded, 1); assert.equal(view.duplicateSourceRows, 1); assert.equal(view.duplicateEvents, 1);
  const cotton = view.groups.find(group => group.name === '合成棉布');
  assert.equal(cotton.rows.length, 3);
  assert.equal(new Set(cotton.rows.map(row => row.demand.materialColor)).size, 2);
  assert.equal(new Set(cotton.rows.map(row => row.demand.specification)).size, 2);
  assert.equal(cotton.rows.find(row => row.purchased === 40).purchases.length, 2);
});
test('four readiness states use the existing sole domain function', () => {
  const view = project(complete());
  const expected = [['unbought',0,0,'not_purchased'],['pending',100,0,'pending_inbound'],['ready',100,100,'ready']];
  for (const [code, purchased, inbound, status] of expected) {
    const row = byCode(view, code); assert.equal(row.status, status);
    assert.equal(row.status, deriveMaterialStatuses(row.demand.requiredQuantity,purchased,inbound,0,0).readinessStatus);
  }
  const partial = view.rows.find(row => row.purchased === 40);
  assert.equal(partial.status, 'purchasing'); assert.equal(partial.purchaseShortfall,60); assert.equal(partial.pendingInbound,40);
  assert.equal(byCode(view,'pending').pendingInbound,100); assert.equal(byCode(view,'ready').pendingInbound,0);
});
test('zero demand follows existing ready semantics while missing purchase never becomes zero/not_purchased', () => {
  const view = project(complete());
  assert.equal(byCode(view,'zero').demand.requiredQuantity,0); assert.equal(byCode(view,'zero').status,'ready');
  const unknown = byCode(view,'unknown'); assert.equal(unknown.purchased,null); assert.equal(unknown.purchaseShortfall,null); assert.equal(unknown.status,null);
  assert.match(unknown.issues.join(' '), /不能按零采购/);
  assert.equal(byCode(view,'unbought').purchased,0);
});
test('known purchase and unknown inbound cannot imply ready', () => {
  const pages=complete();pages[0].rows.find(row=>row.values.GoodsNo==='SYNTHETIC-MAT-ready').values.rknum=null;
  const row=byCode(project(pages),'ready');assert.equal(row.purchased,100);assert.equal(row.inbound,null);assert.equal(row.status,null);
});
test('positive quantities without document identities and negative quantities fail state evidence', () => {
  for (const values of [{cgnum:20,cgdh:null},{cgnum:-1,cgdh:'PO-SYNTHETIC'}, {rknum:1,rkdh:null}]) {
    const pages=complete();Object.assign(pages[0].rows[0].values,values);assert.equal(byCode(project(pages),'unbought').status,null);
  }
});
test('boolean and whitespace purchase quantities are unknown, not explicit zero', () => {
  for (const cgnum of [false, true, '   ']) { const pages=complete();pages[0].rows[0].values.cgnum=cgnum;assert.equal(byCode(project(pages),'unbought').purchased,null); }
});
test('factory-supplied Source stays excluded even without events', () => {
  const view=project(complete());assert.equal(view.factoryExcluded,1);
  assert.ok(view.rows.every(row=>row.demand.supplyMethod!=='厂供'));assert.ok(view.groups.every(group=>group.name!=='合成厂供标'));
});
test('not fetched and empty source never claim not_purchased', () => {
  for(const input of [null,[]]) { const view=project(input);assert.equal(view.sourceStatus,'not_fetched');assert.equal(view.rows.length,0); }
});
test('complete zero-row snapshot is empty without invented procurement state', () => {
  const pages=complete();pages[0].rows=[];pages[0].total=0;
  const view=project(pages);assert.equal(view.sourceStatus,'ready');assert.equal(view.rows.length,0);
});
test('stable contract association survives changed InsideOrderNo transport query', () => {
  const pages=complete();const before=project(pages);
  for(const page of pages) page.queryContext.insideOrderNo='SYNTHETIC-IN-NEW';
  for(const page of pages) for(const row of page.rows) row.values.insideorderno='SYNTHETIC-IN-NEW';
  const after=project(pages);assert.equal(after.sourceStatus,'ready');assert.equal(after.insideOrderDrift,true);
  assert.deepEqual(after.rows.map(row=>row.demand.id),before.rows.map(row=>row.demand.id));
  assert.deepEqual(after.groups.map(group=>group.key),before.groups.map(group=>group.key));
});
test('formal existing BillNo normalizer is reused for target contract casing/whitespace', () => {
  const view=projectMaterialProgress({...syntheticOrder,salesContractNo:' sc-synthetic-001 '},complete());assert.equal(view.sourceStatus,'ready');
});
test('matching query or style cannot override a mismatched stable contract', () => {
  const view=project(createSyntheticMaterialSource('identity_mismatch'));assert.equal(view.sourceStatus,'identity_mismatch');assert.equal(view.rows.length,0);
});
test('same source identity with conflicting row content blocks projection', () => {
  const view=project(createSyntheticMaterialSource('collision'));assert.equal(view.sourceStatus,'incomplete');assert.match(view.message,/来源身份、分页或字段校验失败/);assert.equal(view.rows.length,0);
});
test('incomplete paging cannot claim zero purchase even when trailing page is empty', () => {
  const pages=complete();pages[0].total=20;pages.push({...structuredClone(pages[0]),page:2,rows:[]});
  const view=project(pages);assert.equal(view.sourceStatus,'incomplete');assert.equal(view.rows.length,0);
});
test('changed total, skipped page, inconsistent query and excess source rows fail closed', () => {
  const mutations=[pages=>{pages.push({...structuredClone(pages[0]),page:2,total:50,rows:[]});},pages=>{pages[0].page=2;},pages=>{pages.push({...structuredClone(pages[0]),page:2,queryContext:{insideOrderNo:'DIFFERENT'},rows:[]});},pages=>{pages[0].total=1;}];
  for(const mutate of mutations) {const pages=complete();mutate(pages);const view=project(pages);assert.equal(view.sourceStatus,'incomplete');assert.equal(view.rows.length,0);}
});
test('invalid required quantity or material identity blocks the existing normalization validator', () => {
  for(const change of [{TotalNum:null},{CnName:''},{GoodsNo:''}]) {const pages=complete();Object.assign(pages[0].rows[0].values,change);assert.equal(project(pages).sourceStatus,'incomplete');}
});
test('invalid source timestamp is incomplete rather than a valid zero-source claim', () => {
  const pages=complete();pages[0].fetchedAt='invalid';assert.equal(project(pages).sourceStatus,'incomplete');
});
test('event dedup and child demands are deterministic across reordered source rows', () => {
  const pages=complete();const before=project(pages);pages[0].rows.reverse();const after=project(pages);
  assert.deepEqual(after.rows,before.rows);assert.deepEqual(after.groups,before.groups);
});
test('verified source unit is per demand and does not change actual purchase or theoretical usage', () => {
  const pages=complete();
  const ready=pages[0].rows.find(row=>row.values.GoodsNo==='SYNTHETIC-MAT-ready');
  ready.values.Num=1.5;
  const view=project(pages);const row=byCode(view,'ready');
  const sourceDemand=buildAinuokeMaterialApiPreview({snapshots:pages}).pipeline.demands.find(item=>item.materialCode==='SYNTHETIC-MAT-ready');
  assert.equal(sourceDemand.plannedConsumption,1.5);
  assert.equal(row.unit,'个');assert.equal(row.unitStatus,'known');
  assert.equal(row.demand.requiredQuantity,100);assert.equal(row.purchased,100);
  assert.equal(row.inbound,100);assert.equal(row.status,'ready');
  assert.equal(view.summary.quantitiesAggregatedAcrossDemands,false);
});
test('missing or malformed units remain unknown without inventing 个 or turning quantities into zero', () => {
  for(const missing of [null,'',42]) {
    const pages=complete();pages[0].rows.find(row=>row.values.GoodsNo==='SYNTHETIC-MAT-ready').values.QtyUnit=missing;
    const row=byCode(project(pages),'ready');
    assert.equal(row.unit,null);assert.equal(row.unitStatus,'missing');
    assert.equal(row.purchased,100);assert.equal(row.inbound,100);
    assert.match(row.issues.join(' '),/来源计量单位未知/);
  }
  const pages=complete();pages[0].rows.find(row=>row.sourceRowIdentity==='6087050:sha256:synthetic-partial-b').values.QtyUnit=null;
  const row=project(pages).rows.find(item=>item.purchases.some(event=>event.purchaseOrderNo==='PO-SYNTHETIC-partial-b'));
  assert.equal(row.unit,null);assert.equal(row.purchased,40);
});
test('different units in separate child demands stay separate without cross-unit group totals', () => {
  const pages=complete();pages[0].rows.find(row=>row.values.GoodsNo==='SYNTHETIC-MAT-pending').values.QtyUnit='米';
  const view=project(pages);const cotton=view.groups.find(group=>group.name==='合成棉布');
  assert.deepEqual(new Set(cotton.rows.map(row=>row.unit)),new Set(['个','米']));
  assert.equal(view.summary.quantitiesAggregatedAcrossDemands,false);
  assert.equal(byCode(view,'pending').purchased,100);
});
test('conflicting units within one demand block aggregate, shortage and readiness', () => {
  const pages=complete();pages[0].rows.find(row=>row.sourceRowIdentity==='6087050:sha256:synthetic-partial-b').values.QtyUnit='米';
  const row=project(pages).rows.find(item=>item.purchases.some(event=>event.purchaseOrderNo==='PO-SYNTHETIC-partial-b'));
  assert.equal(row.unit,null);assert.equal(row.unitStatus,'conflict');
  assert.equal(row.purchased,null);assert.equal(row.inbound,null);assert.equal(row.shipped,null);assert.equal(row.outbound,null);
  assert.equal(row.purchaseShortfall,null);assert.equal(row.pendingInbound,null);assert.equal(row.status,null);
  assert.equal(row.purchases.length,2);assert.match(row.issues.join(' '),/计量单位冲突/);
});
test('duplicate source rows and duplicate purchase events retain one purchase quantity with one unit', () => {
  const view=project(complete());const partial=view.rows.find(row=>row.purchased===40);
  assert.equal(partial.unit,'个');assert.equal(partial.unitStatus,'known');
  assert.equal(partial.purchases.length,2);assert.equal(view.duplicateSourceRows,1);assert.equal(view.duplicateEvents,1);
});
test('two synthetic 356 source rows merge into one purchase event without double counting', () => {
  const pages=complete();const source=pages[0].rows.find(row=>row.values.GoodsNo==='SYNTHETIC-MAT-ready');
  source.values.TotalNum=356;source.values.cgnum=356;source.values.rknum=0;source.values.rkdh=null;
  const joined=structuredClone(source);joined.sourceRowIdentity='6087050:sha256:synthetic-356-second-source';
  pages[0].rows.push(joined);pages[0].total++;
  const row=byCode(project(pages),'ready');
  assert.equal(row.unit,'个');assert.equal(row.purchased,356);
  assert.equal(row.purchases.length,1);assert.equal(row.purchases[0].quantity,356);
  assert.equal(row.status,'pending_inbound');
});
test('a changed source unit changes source identity but preserves demand and event identities', () => {
  const before=project(complete());const pages=complete();
  const row=pages[0].rows.find(item=>item.values.GoodsNo==='SYNTHETIC-MAT-ready');
  row.sourceRowIdentity='6087050:sha256:synthetic-unit-changed';row.values.QtyUnit='米';
  const after=project(pages);const old=byCode(before,'ready');const changed=byCode(after,'ready');
  assert.equal(changed.unit,'米');assert.equal(changed.demand.id,old.demand.id);
  assert.deepEqual(changed.purchases.map(event=>event.id),old.purchases.map(event=>event.id));
  assert.deepEqual(changed.inbounds.map(event=>event.id),old.inbounds.map(event=>event.id));
  assert.equal(changed.purchased,old.purchased);assert.equal(changed.status,old.status);
});
test('existing redacted fixture is supported with unknown fields retained as unknown', () => {
  const pages=JSON.parse(readFileSync(new URL('./fixtures/ainuoke-api-material-6087050.redacted.json',import.meta.url),'utf8'));
  const view=projectMaterialProgress({salesContractNo:'SC-REDACTED-001',styleNo:'STYLE-REDACTED',insideOrderNo:'D1935'},pages);
  assert.equal(view.sourceStatus,'ready');assert.equal(view.factoryExcluded,1);assert.equal(view.rows.length,2);
  assert.ok(view.rows.some(row=>row.status===null));
});
test('search supports material/color/specification/purchase order/supplier plus type/state filters', () => {
  const view=project(complete());
  assert.equal(filterProgressRows(view,'棉','fabric','all').length,3);
  assert.equal(filterProgressRows(view,'160cm','all','pending_inbound').length,1);
  assert.equal(filterProgressRows(view,'PO-SYNTHETIC-partial-b','all','all').length,1);
  assert.equal(filterProgressRows(view,'','all','unknown').length,1);
  assert.equal(filterProgressRows(view,'not present','all','all').length,0);
});
test('pure refresh has stable IDs and never mutates its source', () => {
  const pages=complete();const snapshot=structuredClone(pages);const a=project(pages);const b=project(pages);
  assert.deepEqual(a,b);assert.deepEqual(pages,snapshot);
});
test('5000 demands projection/search is indexed, bounded by a measured generous 10s ceiling', () => {
  const start=performance.now();const view=project(createSyntheticMaterialSource('large'));
  assert.equal(view.sourceStatus,'ready');assert.equal(view.rows.length,5000);assert.equal(view.groups.length,5000);
  assert.equal(filterProgressRows(view,'05000','all','all').length,1);
  const duration=performance.now()-start;assert.ok(duration<10_000,`5000-demand projection/search took ${duration.toFixed(0)}ms`);
  console.log(`SYNTHETIC 5000-demand projection/search: ${duration.toFixed(1)}ms`);
});
test('preview module contains no storage/Bridge/client/writer wiring or cross-unit totals', () => {
  for(const file of ['projection.ts','synthetic-source.ts','material-progress-page.tsx']) {
    const source=readFileSync(new URL(`../features/ainuoke-material-progress/${file}`,import.meta.url),'utf8');
    assert.doesNotMatch(source,/localStorage|indexedDB|commitAinuokeMaterialApiPreview\(|commitImport\(|fetch\(|ainuoke-api-client/);
  }
});

test('two paid repeat purchases with equal quantities remain distinct events; unit aliases are not guessed', () => {
  const pages=complete(); const first=pages[0].rows.find(row=>row.values.GoodsNo==='SYNTHETIC-MAT-ready');
  first.values.cgnum=100; first.values.QtyUnit='只';
  const second=structuredClone(first);
  second.sourceRowIdentity='6087050:sha256:synthetic-repurchase';
  Object.assign(second.values,{cgdh:'PO-SYNTHETIC-repurchase',QtyUnit:'个',rkdh:'IN-SYNTHETIC-repurchase',cydh:'SHIP-SYNTHETIC-repurchase',ckdh:'OUT-SYNTHETIC-repurchase'});
  pages[0].rows.push(second); pages[0].total++;
  const conflict=byCode(project(pages),'ready');
  assert.equal(conflict.purchases.length,2);
  assert.deepEqual(conflict.purchases.map(event=>event.quantity),[100,100]);
  assert.equal(conflict.unitStatus,'conflict'); assert.equal(conflict.purchased,null);
  second.values.QtyUnit='只';
  const sameUnit=byCode(project(pages),'ready');
  assert.equal(sameUnit.purchases.length,2); assert.equal(sameUnit.purchased,200);
  assert.equal(sameUnit.demand.requiredQuantity,100);
});

test('Server summary counts only self-purchase and retains factory independently with canonical plans unchanged',()=>{
 const pages=complete(),legacy=project(pages),view=projectMaterialProgress(syntheticOrder,pages,[],{retainSourceDemands:true});
 assert.equal(view.sourceStatus,'ready');assert.equal(view.rows.length,7);assert.equal(view.factoryExcluded,0);
 assert.equal(view.summary.fabric.demands+view.summary.trim.demands,6);
 for(const old of legacy.rows){const row=view.rows.find(r=>r.demand.id===old.demand.id);assert.equal(row.canonicalKey,old.canonicalKey);assert.equal(row.purchaseShortfall,old.purchaseShortfall);}
 const factory=view.rows.find(r=>r.demand.supplyMethod==='厂供');assert.ok(factory);assert.equal(factory.purchaseShortfall,null);assert.equal(factory.purchaseExcess,null);assert.equal(factory.status,null);
 assert.equal(byCode(view,'unbought').status,'not_purchased');assert.equal(byCode(view,'unknown').purchased,null);
});

import test from 'node:test';import assert from 'node:assert/strict';import {validateDemoManifest,assertDatabaseOwnership,type DemoManifest} from '../isolated-demo/guard.js';import {demoBundles} from '../isolated-demo/fixtures.js';import {previewBindings} from '../ainuoke-source/binding.js';import {validateBundle} from '../ainuoke-source/contract.js';import {projectMaterialProgress} from '../../features/ainuoke-material-progress/projection.js';
const m:DemoManifest={version:1,project:'zhixu-local-abcdef123456',owner:'sha256:'+'a'.repeat(64),sourceSha:'b'.repeat(40),database:'demo_abcdef123456',user:'demo_abcdef123456',databasePassword:'c'.repeat(64),buildId:'fixture',buildTime:new Date().toISOString(),port:62200,workbookHash:'d'.repeat(64),workbookPayloadHash:'d'.repeat(64),fixtureOnly:true};
test('new owned empty DB only; foreign identity, tables, marker and incomplete seed block before mutation',()=>{
 assert.equal(validateDemoManifest(m).fixtureOnly,true);assert.equal(assertDatabaseOwnership({database:m.database,user:m.user,tables:0},m),'initialize');
 for(const change of [{database:'existing'},{user:'existing'},{tables:1},{marker:{owner:'wrong',source_sha:m.sourceSha,workbook_hash:m.workbookHash,state:'ready'}},{marker:{owner:m.owner,source_sha:m.sourceSha,workbook_hash:m.workbookHash,state:'initializing'}}])assert.throws(()=>assertDatabaseOwnership({database:m.database,user:m.user,tables:0,...change},m));
 assert.throws(()=>validateDemoManifest(m,{DATABASE_URL:'existing'}));assert.throws(()=>validateDemoManifest(m,{AINUOKE_PASSWORD:'secret'}));assert.throws(()=>validateDemoManifest({...m,fixtureOnly:false} as unknown as DemoManifest));
});
test('six labelled fixtures pass actual binding and pipeline without global blockage by one invalid color',async()=>{
 const b=demoBundles();const p=await previewBindings(b.binding);assert.equal(p.preview.candidates.length,6);
 const targets=b.binding.discoveryBefore[0].rows.map((r,i)=>({id:String(i),version:1,salesContractNo:String(r.values.BillNo),styleNo:String(r.values.GoodsDesc),insideOrderNo:String(r.values.InsideOrderNo)}));await validateBundle(b.materials,targets,Date.now(),600000);
 const views=targets.map(t=>projectMaterialProgress(t,b.materials.materials[t.salesContractNo]));assert.ok(views.every(v=>v.sourceStatus==='ready'));
 assert.equal(views[1].rows[0].unitStatus,'missing');assert.equal(views[1].rows[0].purchased,100);
 assert.equal(views[2].rows[0].unitStatus,'conflict');assert.equal(views[2].rows[0].purchased,null);assert.equal(views[2].rows[0].status,null);
 assert.equal(views[4].rows[0].quantityComparison?.theoreticalUsageCandidate,115.5);assert.equal(views[4].rows[0].purchased,118);assert.equal(views[4].rows[0].issues.length,0);
 assert.equal(views[5].rows[0].purchases.length,1);assert.equal(views[5].rows[0].purchased,356);assert.ok(views[5].duplicateEvents>0);
 for(const key of ['purchased','inbound','shipped','outbound'] as const)assert.equal(views[0].rows[0][key],100);
});
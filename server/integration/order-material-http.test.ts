import { createServer } from 'node:http';
import { createApp } from '../app.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { startOrderMaterialFixture } from './order-material-fixture.js';
test('Material HTTP real trusted session, scope, fixed Source and failure isolation',async t=>{
  const f=await startOrderMaterialFixture();t.after(()=>f.close());const a=await f.login('tracker-a');const b=await f.login('tracker-b');const denied=await f.login('denied');
  const path=(i=0)=>`/api/v1/sales-orders/${f.orders[i].id}/material-progress`;
  const read=async(cookie?:string,i=0,suffix='')=>fetch(f.base+path(i)+suffix,{headers:cookie?{Cookie:cookie}:{}});
  await t.test('unconfigured production capability is disabled',async()=>{
    const server=createServer(createApp({pool:f.pool}));await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
    try {const address=server.address();assert.ok(address&&typeof address==='object');const response=await fetch(`http://127.0.0.1:${address.port}`+path(),{headers:{Cookie:a}});assert.equal(response.status,503);assert.equal((await response.json()).error.code,'material_read_not_connected');}
    finally {await new Promise<void>(done=>server.close(()=>done()));}
  });
  await t.test('authentication/permission/scope and arbitrary query rejection precede Source',async()=>{
    const before=f.sourceReads();assert.equal((await read()).status,401);assert.equal((await read(denied)).status,403);assert.equal((await read(a,1)).status,404);assert.equal((await read(a,0,'?account=admin')).status,400);assert.equal(f.sourceReads(),before);
  });
  await t.test('normal and account switch retain BillNo UUID and procurement prices, no protected bytes',async()=>{
    for(const [cookie,i] of [[a,0],[b,1],[a,0]] as const){const response=await read(cookie,i);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const bytes=await response.text();assert.ok(!bytes.includes('protected-commercial-sentinel'));const body=JSON.parse(bytes);assert.equal(body.salesOrderId,f.orders[i].id);assert.equal(body.progress.sourceStatus,'ready');assert.equal(body.progress.insideOrderDrift,true);assert.ok(body.progress.rows.flatMap((r: { purchases: Array<{ sourcePricing: { unitPrice: number | null } }>; purchased: number | null })=>r.purchases).some((p: { sourcePricing: { unitPrice: number | null } })=>p.sourcePricing.unitPrice===12.75));assert.ok(body.progress.rows.some((r: { purchases: Array<{ sourcePricing: { unitPrice: number | null } }>; purchased: number | null })=>r.purchased===null));assert.ok(body.progress.rows.some((r: { purchases: Array<{ sourcePricing: { unitPrice: number | null } }>; purchased: number | null })=>r.purchased===0));}
  });
  for(const [scenario,status] of [['unconnected','not_connected'],['missing','source_missing'],['failed','source_failed'],['stale','stale'],['incomplete','incomplete'],['empty','ready'],['async','ready']])await t.test(scenario,async()=>{f.scenario(scenario);const response=await read(a);assert.equal(response.status,200);const body=await response.json();assert.equal(body.progress.sourceStatus,status);if(scenario!=='async')assert.equal(body.progress.rows.length,0);assert.ok(!JSON.stringify(body).includes('secret'));});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {startContinuousFixture} from './ainuoke-continuous-fixture.js';
import {loadExistingBootstrapActor} from '../sales-orders/bootstrap-runner.js';
import {createPersistedMaterialPorts} from '../ainuoke-source/reader.js';
import {createOrderMaterialReader} from '../../features/ainuoke-material-progress/read-service.js';
import {attachOrderAlerts} from '../sales-orders/order-alerts.js';
import {getSalesOrderById} from '../sales-orders/repository.js';

test('request-local material batch preserves generation and scope across source integration',{timeout:120000},async t=>{
 const x=await startContinuousFixture(resolve('dist/client'),{orderAlerts:true});t.after(()=>x.close());
 const actor=await loadExistingBootstrapActor(x.pool,x.users[0]);
 const ports=createPersistedMaterialPorts(x.pool,{sourceKey:'synthetic-demo',maxAgeMs:1800000});
 const prepared=await ports.prepareBatch!(actor,[x.orderId]);
 const order=await prepared.resolveVisibleOrder(actor,x.orderId);assert.ok(order);
 const first=await prepared.loadSource!(order,actor);assert.ok(first);
 await x.capture();
 assert.deepEqual(await prepared.loadSource!(order,actor),first,'one request must not mix source generations');
 assert.notDeepEqual(await ports.loadSource!(order,actor),first,'a new request must read the new persisted run');
 const another={...actor,userId:'00000000-0000-4000-8000-000000000999'};
 await assert.rejects(prepared.resolveVisibleOrder(another,x.orderId),/source_actor_unavailable/);
 await assert.rejects(prepared.loadSource!(order,another),/source_actor_unavailable/);
 await assert.rejects(ports.prepareBatch!(actor,Array(201).fill(x.orderId)),/source_order_limit/);
 const damaged=new Proxy(x.pool,{get(target,property){
  if(property==='connect')return async()=>{
   const client=await target.connect();return new Proxy(client,{get(current,member){
    if(member==='query')return async(...args:unknown[])=>{
     const result=await (current.query as (...values:unknown[])=>Promise<{rows:Record<string,unknown>[]} >)(...args);
     return {...result,rows:result.rows.map(row=>Object.hasOwn(row,'snapshots')?{...row,content_hash:'0'.repeat(64)}:row)};
    };
    const value=Reflect.get(current,member);return typeof value==='function'?value.bind(current):value;
   }});
  };
  const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
 }});
 const damagedPorts=createPersistedMaterialPorts(damaged,{sourceKey:'synthetic-demo',maxAgeMs:1800000});
 for(const mode of [damagedPorts,await damagedPorts.prepareBatch!(actor,[x.orderId])])assert.equal((await createOrderMaterialReader(mode)(actor,{salesOrderId:x.orderId})).status,503);
 const detail=await getSalesOrderById(x.pool,x.orderId);assert.ok(detail);
 const effectiveAlert=await attachOrderAlerts([{...detail,creationSource:'quote'}],actor,ports);
 assert.ok(effectiveAlert[0].alerts!.some(a=>a.code==='material_unit_missing'),'contract business type governs effective Source access, not original creation entry');
 const historicalAlert=await attachOrderAlerts([{...detail,attribution:{...detail.attribution!,historicalDuplicate:true}}],actor,ports);
 assert.equal(historicalAlert[0].alerts!.some(a=>a.code.startsWith('material_')),false,'a historical alias cannot advertise current material alerts');
 const alerted=await attachOrderAlerts([detail],actor,damagedPorts);assert.deepEqual(alerted[0].alerts!.map(a=>a.code),['color_quantity_zero','material_source_unavailable']);
 await x.pool.query("DELETE FROM app_role_permissions WHERE role_id='role-server-admin' AND permission_key='ainuoke.view'");
 assert.equal((await createOrderMaterialReader(ports)(actor,{salesOrderId:x.orderId})).status,503,'new request rechecks fresh persisted permissions');
});

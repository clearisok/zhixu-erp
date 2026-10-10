import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import pg from 'pg';
import { createApp } from '../app.js';
import { startDisposablePostgres } from './postgres-container.js';
import { runMigrations } from '../db/migration-runner.js';
import { synchronizePermissionCatalog } from '../auth/permissions.js';
import type { TrustedIdentity } from '../auth/session.js';
import { createAinuokeSalesOrder } from '../sales-orders/service.js';
import { getSalesOrderById } from '../sales-orders/repository.js';
import { createMaterialSourceLoader } from '../../features/ainuoke-material-progress/source-adapter.js';
import { createSyntheticMaterialSource, syntheticOrder, syntheticFetchedAt } from '../../features/ainuoke-material-progress/synthetic-source.js';
import type { AinuokeReportSnapshot, AinuokeOrderDiscoveryQuery } from '../../features/ainuoke-api/model/ainuoke-api.js';

export async function startOrderMaterialFixture() {
  const postgres = await startDisposablePostgres();
  assert.match(postgres.containerName, /^zhixu-pg-it-[a-f0-9]{12}$/);
  const db = await postgres.createDatabase('order_material_night'); assert.equal(new URL(db).hostname,'127.0.0.1');
  const pool = new pg.Pool({connectionString:db});
  let server: ReturnType<typeof createServer> | undefined;
  try {
    await runMigrations(pool, resolve('database/migrations')); await synchronizePermissionCatalog(pool);
    const actors: TrustedIdentity[] = [];
    for (const name of ['tracker-a','tracker-b','denied']) {
      const row = await pool.query("INSERT INTO app_users(username,password_hash,display_name,role,active) VALUES ($1,crypt('synthetic-only',gen_salt('bf',4)),$1,'viewer',true) RETURNING id::text,public_id::text",[name]);
      const permissions = name === 'denied' ? ['order.view'] : ['order.view','style_progress.read'];
      await pool.query('INSERT INTO app_roles(id,name,description) VALUES ($1,$1,$1)',[name]);
      await pool.query('INSERT INTO app_user_roles(user_id,role_id) VALUES ($1,$2)',[row.rows[0].id,name]);
      for(const key of permissions) await pool.query('INSERT INTO app_role_permissions(role_id,permission_key) VALUES ($1,$2)',[name,key]);
      actors.push({internalUserId:row.rows[0].id,userId:row.rows[0].public_id,username:name,userName:name,permissions:permissions as TrustedIdentity['permissions']});
    }
    const orders = [];
    for(const [i, contract] of [syntheticOrder.salesContractNo,'SC-SYNTHETIC-B'].entries()) {
      orders.push((await createAinuokeSalesOrder(pool,actors[0],{source:{sourceId:`synthetic-${i}`,sourceRowIdentity:`synthetic-row-${i}`,salesContractNo:contract,insideOrderNo:'SYNTHETIC-IN-CURRENT',lifecycleStatusRaw:'生效',contractDate:'2026-10-11',contractDeliveryDate:'2026-11-01',styleNo:syntheticOrder.styleNo,companyNameSnapshot:'合成公司',customerNameSnapshot:'合成客户',brandNameSnapshot:'合成品牌',quantity:100,sourceHash:`synthetic-hash-${i}`,fetchedAt:syntheticFetchedAt},colors:[{sourceLineIdentity:`color-${i}`,colorName:'蓝色',quantity:100,deliveryDate:null,sourceHash:`synthetic-color-${i}`}]})).salesOrder);
    }
    let scenario = 'complete'; let clock = Date.parse(syntheticFetchedAt); let sourceReads = 0;
    const resolveVisibleOrder = async (actor: TrustedIdentity,id: string) => {
      const index=actor.username==='tracker-b'?1:0; if (orders[index].id!==id) return null;
      return getSalesOrderById(pool,id);
    };
    const loadSource = createMaterialSourceLoader({resolveVisibleOrder,provenance:'synthetic',now:()=>clock,maxAgeMs:1000,
      readDiscovery:async actor=> {
        if(scenario==='unconnected') return null;
        const i=actor.username==='tracker-b'?1:0;
        const pages: AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>[]=[{schemaVersion:'ainuoke-direct-read.v2',reportId:'6086103',fetchedAt:syntheticFetchedAt,page:1,pageSize:50,total:1,queryContext:{},snapshotHash:'synthetic-discovery',rows:[{sourceRowIdentity:`discovery-${i}`,values:{id:`source-${i}`,InsideOrderNo:'SYNTHETIC-IN-OLD',BillNo:orders[i].salesContractNo,Status:'生效',GoodsDesc:syntheticOrder.styleNo}}]}];
        if(scenario==='missing') pages[0].rows[0].values.BillNo='OTHER';
        if(scenario==='async') {await Promise.resolve();clock+=100;pages[0].fetchedAt=new Date(clock).toISOString();}
        return pages;
      },
      readMaterial:async actor=> {
        sourceReads++; if(scenario==='failed') throw new Error('secret protected-commercial-sentinel');
        const pages=createSyntheticMaterialSource(scenario==='incomplete'?'incomplete':'complete')!;
        if(actor.username==='tracker-b') for(const row of pages[0].rows) row.values.ExpContractNo=orders[1].salesContractNo;
        if(scenario==='empty') {pages[0].rows=[];pages[0].total=0;}
        if(scenario==='stale') pages[0].fetchedAt=new Date(clock-1001).toISOString();
        if(scenario==='async') {await Promise.resolve();clock+=100;pages[0].fetchedAt=new Date(clock).toISOString();}
        for(const row of pages[0].rows) Object.assign(row.values,{cgprice:12.75,goodsamount:255,CurrencyName:'CNY',customerConfirmedPrice:'protected-commercial-sentinel'});
        return pages;
      }});
    server=createServer(createApp({pool,allowedOrigins:['http://127.0.0.1'],security:{secureCookies:false,sessionTtlSeconds:3600},orderMaterialRead:{resolveVisibleOrder,loadSource}}));
    await new Promise<void>(done=>server!.listen(0,'127.0.0.1',done));const address=server.address();assert.ok(address&&typeof address==='object');const base=`http://127.0.0.1:${address.port}`;
    return {pool,orders,base,containerName:postgres.containerName,
      scenario:(next:string)=>{scenario=next;clock=Date.parse(syntheticFetchedAt);},sourceReads:()=>sourceReads,
      login:async(name:string)=> {const response=await fetch(base+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://127.0.0.1','X-Zhixu-Request':'1'},body:JSON.stringify({username:name,password:'synthetic-only'})});assert.equal(response.status,200);return response.headers.get('set-cookie')!.split(';')[0];},
      close:async()=>{await new Promise<void>(done=>server!.close(()=>done()));await pool.end();await postgres.stop();}};
  } catch(error){if(server)await new Promise<void>(done=>server!.close(()=>done()));await pool.end();await postgres.stop();throw error;}
}

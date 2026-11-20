import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {startCatalogFixture} from './ainuoke-catalog-fixture.js';
import {selectedConfig,selectedWorkerFixture} from './selected-source-fixture.js';
import {captureCatalogOnce} from '../ainuoke-source/catalog-capture.js';
import {requestContractSync} from '../ainuoke-source/sync-queue.js';
import {runSyncTick} from '../ainuoke-source/sync-worker.js';

// User-requested regression labels ONLY in an isolated synthetic fixture.
// No Staging DB, actual source host, historical data or credentials are used.
const contracts=['PI2611-142','PI2611-143','SYN-SALES-3','SYN-SALES-4'];
const rename=`if report == 6086103:
        mutate_rows(payload, lambda rows: [row.update(BillNo={'1':'PI2611-142','2':'PI2611-143'}.get(row['id'],row['BillNo']), Num={'1':10000,'2':8000}.get(row['id'],100), GoodsDesc={'1':'1320/226','2':'1396/332'}.get(row['id'],row['GoodsDesc']), ContractDate='2026-11-18' if row['id'] in ['1','2'] else '2026-10-01') for row in rows])
    elif report == 6087105:
        mutate_rows(payload, lambda rows: [row.update(BillNo={'SYN-SALES-142':'PI2611-142','SYN-SALES-143':'PI2611-143'}.get(row['BillNo'],row['BillNo'])) for row in rows])
    elif report == 6087050:
        mutate_rows(payload, lambda rows: [row.update(ExpContractNo={'SYN-SALES-142':'PI2611-142','SYN-SALES-143':'PI2611-143'}.get(row['ExpContractNo'],row['ExpContractNo'])) for row in rows])`;
const remove=`if report == 6086103:
        mutate_rows(payload, lambda rows: rows.__setitem__(slice(None), [r for r in rows if r['id'] not in ['1','2']]))
        payload['dataCount']=2`;
const fixture:typeof selectedWorkerFixture=(mode,mutation='',selected=contracts,_total=4,materialReport,recapturePages)=>
 selectedWorkerFixture(mode,rename+(mutation?'\n    '+mutation:''),selected,4,materialReport,recapturePages);

export async function startSourceDeletedDemo(){
 const f=await startCatalogFixture(resolve('dist/client'),{contracts,workerFixture:fixture,
  beforeBind:async pool=>{await pool.query("SELECT setval('sales_order_number_seq',628,true)");}});
 let deleted=false;
 f.setMaterialOffset(1800001);
 const confirmDeleted=async()=>{
  if(deleted)return;
  await captureCatalogOnce(f.pool,f.actor,selectedConfig,randomUUID(),async()=>fixture('catalog-discovery',remove,[]));
  // A controlled synthetic clock makes the independently refreshed fourth
  // order fresh while the third remains stale. No stored timestamp is edited.
  const now=Date.now()+1800001;
  await requestContractSync(f.pool,f.actor,{sourceKey:f.sourceKey,sourceId:'4',requestId:randomUUID()});
  const result=await runSyncTick(f.pool,f.actor,selectedConfig,{automatic:false,sourceIds:['4'],now:()=>now,
   collect:async(_cfg,request)=>{
    if(request.mode!=='catalog-contracts')throw Error('demo scope mismatch');
    const raw=fixture('catalog-contracts',remove+`\n    if report == 6087050:\n        mutate_rows(payload, lambda rows: [row.update(QtyUnit='') for row in rows])`,request.contracts);
    const shift=(value:unknown):void=>{
     if(Array.isArray(value))value.forEach(shift);
     else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){
      if(key==='fetchedAt'&&typeof item==='string')(value as Record<string,unknown>)[key]=new Date(now-1000).toISOString();else shift(item);
     }
    };shift(raw);return raw;
   }});
  if(result.status!=='processed'||result.jobs.some(j=>j.status!=='complete'))throw Error('isolated demo refresh failed');
  deleted=true;
 };
 return {...f,confirmDeleted};
}

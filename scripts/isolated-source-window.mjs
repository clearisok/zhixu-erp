import {readFileSync,writeFileSync,openSync,closeSync,appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {setTimeout as wait} from 'node:timers/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export function validateWindow(a,m,now=Date.now()) {
 if(a?.schemaVersion!=='isolated-source-window.v1'||a.authorization!=='user-approved-four-orders-10m-2h'||a.targetFingerprint!==m.targetFingerprint||a.owner!==m.owner||a.sourceSha!==m.sourceSha||JSON.stringify(a.selected)!==JSON.stringify(m.selected)||a.selected?.length!==4||a.intervalMs!==600000||a.maxAttempts!==12||!Number.isSafeInteger(a.startedAt)||a.endsAt-a.startedAt!==7200000||now<a.startedAt||now>=a.endsAt||! /^[a-f0-9]{32}$/.test(a.id)) throw Error('window_authorization_invalid');
 return a;
}
export async function runWindow(a,{now=Date.now,sleep=wait,capture,record}) {
 // Missed slots are skipped, never replayed as a catch-up burst.
 let previous=-1,attempts=0;
 while(now()<a.endsAt) {
  const slot=Math.floor((now()-a.startedAt)/a.intervalMs);
  if(slot<0)throw Error('window_clock_reversed');
  if(slot>previous&&slot<a.maxAttempts){
   previous=slot;attempts++;record({event:'attempt',slot,at:now()});
   const r=await capture(slot);record({event:'result',slot,at:now(),...r});
   if(r.terminal){record({event:'stopped',reason:'terminal_failure',attempts,at:now()});return;}
  }
  if(now()<a.endsAt)await sleep(Math.max(1,Math.min(a.endsAt,a.startedAt+(previous+1)*a.intervalMs)-now()));
 }
 record({event:'stopped',reason:'deadline',attempts,at:now()});
}
async function main(){
 const dir=resolve(process.argv[2]??'');const m=JSON.parse(readFileSync(join(dir,'manifest.json'),'utf8'));
 const a=validateWindow(JSON.parse(readFileSync(join(dir,'schedule-authorization.json'),'utf8')),m);
 const log=join(dir,'window-'+a.id+'.jsonl');closeSync(openSync(log,'wx'));
 const record=r=>appendFileSync(log,JSON.stringify(r)+'\n');record({event:'started',id:a.id,startedAt:a.startedAt,endsAt:a.endsAt,intervalMs:a.intervalMs,maxAttempts:a.maxAttempts});
 await runWindow(a,{record,capture:async slot=>{
  try{const output=execFileSync(process.execPath,[join(dir,'operator.mjs'),'capture-window',String(slot)],{encoding:'utf8',windowsHide:true,timeout:Math.max(1000,Math.min(650000,a.endsAt-Date.now())),stdio:['ignore','pipe','pipe']});
   const r=JSON.parse(output);if(r.result!=='SOURCE_CAPTURED')return {result:'FAIL',terminal:true};return {result:r.result,runId:r.runId,replayed:r.replayed,orders:r.orders};
  }catch{return {result:'FAIL',terminal:true};}
 }});
 writeFileSync(join(dir,'window-final.json'),JSON.stringify({result:'WINDOW_STOPPED',id:a.id,endedAt:Date.now(),endsAt:a.endsAt}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{process.stderr.write('isolated_window_failed\n');process.exitCode=1;});

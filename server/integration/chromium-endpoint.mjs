import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';

// Chromium creates this file before both lines have necessarily been written.
// Keep the validated pair from the same read; existence alone is not readiness.
export function parseChromiumEndpoint(value){
 if(typeof value!=='string'||value.length>2048)return null;
 const lines=value.trim().split(/\r?\n/);
 if(lines.length!==2||!/^\d{1,5}$/.test(lines[0]))return null;
 const port=Number(lines[0]);
 if(port<1||port>65535||!/^\/devtools\/browser\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lines[1]))return null;
 return [lines[0],lines[1]];
}

export function readChromiumEndpoint(profile){
 try{return parseChromiumEndpoint(readFileSync(join(profile,'DevToolsActivePort'),'utf8'));}
 catch(error){if(error.code!=='ENOENT'&&error.code!=='EBUSY')throw error;return null;}
}

export async function waitForChromiumEndpoint(profile,{timeoutMs=15000,pollMs=50}={}){
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0||!Number.isFinite(pollMs)||pollMs<=0)throw Error('Invalid Chromium readiness budget');
 const deadline=performance.now()+timeoutMs;
 do{
  const endpoint=readChromiumEndpoint(profile);
  if(endpoint)return endpoint;
  await pause(Math.min(pollMs,Math.max(1,deadline-performance.now())));
 }while(performance.now()<deadline);
 throw Error('Chromium endpoint was not fully written before the readiness deadline');
}

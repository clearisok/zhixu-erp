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

// Only a ChildProcess returned by this fixture's own spawn is accepted. Never
// discover or terminate browsers by name/PID, and never delete a live profile.
export async function stopOwnedChromium(child,{gracefulClose,graceMs=1500,exitMs=5000}={}){
 if(!child)return;
 if(typeof child.once!=='function'||typeof child.removeListener!=='function'||typeof child.kill!=='function'
  ||!Number.isFinite(graceMs)||graceMs<=0||graceMs>10000||!Number.isFinite(exitMs)||exitMs<=0||exitMs>10000)throw Error('Invalid owned Chromium shutdown budget');
 const ended=()=>child.exitCode!==null||child.signalCode!==null;
 if(ended())return;
 let closed=false,finish;
 const closure=new Promise(done=>{finish=done;});
 const onClose=()=>{closed=true;finish();};
 child.once('close',onClose);
 const waitForClose=ms=>new Promise(done=>{
  const timer=setTimeout(()=>done(closed),ms);
  closure.then(()=>{clearTimeout(timer);done(true);});
 });
 try{
  if(ended())return;
  if(gracefulClose){
   void Promise.resolve().then(gracefulClose).catch(()=>undefined);
   if(await waitForClose(graceMs))return;
  }
  child.kill();
  if(!await waitForClose(exitMs))throw Error('Owned Chromium did not close; private profile retained');
 }finally{child.removeListener('close',onClose);}
}

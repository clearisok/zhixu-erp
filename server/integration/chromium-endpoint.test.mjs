import assert from 'node:assert/strict';
import test from 'node:test';
import {EventEmitter} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {parseChromiumEndpoint,waitForChromiumEndpoint,stopOwnedChromium} from './chromium-endpoint.mjs';
const path='/devtools/browser/01234567-89ab-cdef-0123-456789abcdef';
async function owned(run){const profile=await mkdtemp(join(tmpdir(),'zhixu-cdp-ready-'));try{return await run(profile);}finally{const distance=relative(resolve(tmpdir()),resolve(profile));assert.ok(distance&&!distance.startsWith('..')&&!isAbsolute(distance)&&distance.startsWith('zhixu-cdp-ready-'));await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});}}

test('complete LF/CRLF endpoints preserve the same validated port/path pair',()=>{
 assert.deepEqual(parseChromiumEndpoint('12345\n'+path+'\n'),['12345',path]);
 assert.deepEqual(parseChromiumEndpoint('65535\r\n'+path+'\r\n'),['65535',path]);
});
test('empty, half-written, injected and invalid endpoints never become WebSocket addresses',()=>{
 for(const value of ['', '12345', '12345\n', '12345\n/devtools/browser/0123','0\n'+path,'65536\n'+path,'text\n'+path,'12345\nws://other.example/', '12345\n'+path+'\nextra'])assert.equal(parseChromiumEndpoint(value),null);
});
test('an existing empty file and then a port-only file wait for the complete write',()=>owned(async profile=>{
 const file=join(profile,'DevToolsActivePort');await writeFile(file,'');
 const writing=(async()=>{await pause(20);await writeFile(file,'12345\n');await pause(20);await writeFile(file,'12345\n'+path+'\n');})();
 try{assert.deepEqual(await waitForChromiumEndpoint(profile,{timeoutMs:2000,pollMs:5}),['12345',path]);}finally{await writing;}
}));
test('a missing file can become a complete endpoint without an invalid intermediate URL',()=>owned(async profile=>{
 const writing=(async()=>{await pause(20);await writeFile(join(profile,'DevToolsActivePort'),'23456\n'+path);})();
 try{assert.deepEqual(await waitForChromiumEndpoint(profile,{timeoutMs:2000,pollMs:5}),['23456',path]);}finally{await writing;}
}));
test('persistent malformed contents fail at the bounded readiness deadline',()=>owned(async profile=>{
 await writeFile(join(profile,'DevToolsActivePort'),'12345\n');
 await assert.rejects(waitForChromiumEndpoint(profile,{timeoutMs:25,pollMs:5}),/not fully written/);
}));
test('invalid timing budgets fail instead of creating unbounded waits',async()=>{
 for(const options of [{timeoutMs:0},{timeoutMs:Infinity},{pollMs:0},{pollMs:NaN}])await assert.rejects(waitForChromiumEndpoint('unused',options),/budget/);
});

class OwnedProcess extends EventEmitter{
 exitCode=null;signalCode=null;signals=[];
 kill(){this.signals.push('terminate');return true;}
 close(){this.exitCode=0;this.emit('close',0,null);}
}
test('owned shutdown waits for actual close instead of treating a signal as exit',async()=>{
 const child=new OwnedProcess();let finished=false;
 const stopping=stopOwnedChromium(child,{exitMs:1000}).then(()=>{finished=true;});
 assert.deepEqual(child.signals,['terminate']);
 await pause(20);assert.equal(finished,false);
 child.close();await stopping;assert.equal(finished,true);assert.equal(child.listenerCount('close'),0);
});
test('graceful browser close terminates only the owned process without a kill',async()=>{
 const child=new OwnedProcess();
 await stopOwnedChromium(child,{gracefulClose:()=>child.close(),graceMs:100,exitMs:100});
 assert.deepEqual(child.signals,[]);assert.equal(child.listenerCount('close'),0);
});
test('a failed graceful close falls back to the same owned process handle',async()=>{
 const child=new OwnedProcess();child.kill=()=>{child.signals.push('terminate');queueMicrotask(()=>child.close());return true;};
 await stopOwnedChromium(child,{gracefulClose:()=>{throw Error('synthetic unavailable connection');},graceMs:5,exitMs:100});
 assert.deepEqual(child.signals,['terminate']);assert.equal(child.listenerCount('close'),0);
});
test('unconfirmed shutdown fails and leaves profile cleanup to the caller',async()=>{
 const child=new OwnedProcess();let removed=false;
 await assert.rejects((async()=>{await stopOwnedChromium(child,{exitMs:10});removed=true;})(),/private profile retained/);
 assert.equal(removed,false);assert.deepEqual(child.signals,['terminate']);assert.equal(child.listenerCount('close'),0);
});
test('already exited processes and absent handles are never signaled again',async()=>{
 const child=new OwnedProcess();child.exitCode=0;
 await stopOwnedChromium(child);await stopOwnedChromium(undefined);
 assert.deepEqual(child.signals,[]);assert.equal(child.listenerCount('close'),0);
});
test('invalid owned shutdown budgets cannot signal a process',async()=>{
 for(const options of[{graceMs:0},{graceMs:Infinity},{graceMs:10001},{exitMs:0},{exitMs:NaN},{exitMs:10001}]){
  const child=new OwnedProcess();await assert.rejects(stopOwnedChromium(child,options),/budget/);assert.deepEqual(child.signals,[]);
 }
});

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { AttachmentStorageFailure, S3AttachmentStorage } from '../attachments/s3-storage.js';

test('actual SDK HTTP transport deadlines, stream cancellation and safe error wrapping', async t => {
  let mode='stall', closed=0;
  const sockets=new Set<import('node:net').Socket>();
  const server=createServer((req,res)=>{
    req.on('close',()=>{closed++;});
    if(mode==='stall') return;
    if(mode==='stream') {res.writeHead(200,{'Content-Length':100});res.write('x');return;}
    if(mode==='break') {res.writeHead(200,{'Content-Length':100});res.write('x');setTimeout(()=>res.destroy(),10);return;}
    if(mode==='missing') {res.writeHead(req.url==='/test-bucket/'?200:404);res.end();return;}
    res.writeHead(403);res.end('<Error><Code>AccessDenied</Code><Message>PRIVATE signed-token</Message></Error>');
  });
  server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
  await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const storage=new S3AttachmentStorage({kind:'s3',endpoint:`http://127.0.0.1:${address.port}`,region:'us-east-1',bucket:'test-bucket',accessKeyId:'synthetic-key',secretAccessKey:'PRIVATE',forcePathStyle:true},{requestMs:250,streamMs:250});
  const key=`attachments/${randomUUID()}/original`;
  t.after(async()=>{storage.destroy();for(const s of sockets)s.destroy();await new Promise<void>(done=>server.close(()=>done()));});
  const safe=(e:unknown)=>e instanceof AttachmentStorageFailure&&e.message==='Attachment object storage operation failed'&&!('cause' in e);
  await t.test('slow headers abort real request within deadline',async()=>{const start=Date.now();await assert.rejects(storage.head(key),safe);assert.ok(Date.now()-start<2000);await new Promise(r=>setTimeout(r,30));assert.ok(closed>0);});
  await t.test('GET headers then stalled body aborts/destroys socket',async()=>{mode='stream';const n=closed;const body=await storage.get(key);assert.ok(body);await assert.rejects(async()=>{for await(const chunk of body)void chunk;},safe);await new Promise(r=>setTimeout(r,30));assert.ok(closed>n);});
  await t.test('consumer destroy releases pending upstream read',async()=>{const n=closed;const body=await storage.get(key);assert.ok(body);body.on('error',()=>{});body.resume();body.destroy();await new Promise(r=>setTimeout(r,30));assert.ok(closed>n);});
  await t.test('external abort cancels pending GET before headers',async()=>{mode='stall';const c=new AbortController();const p=storage.get(key,c.signal);setTimeout(()=>c.abort(),30);await assert.rejects(p,safe);});
  await t.test('thumbnail disconnect cancels pending HEAD before its regular deadline',async()=>{
    mode='stall';const c=new AbortController(),started=Date.now(),n=closed;
    const p=storage.head(key,c.signal);setTimeout(()=>c.abort(),30);await assert.rejects(p,safe);
    assert.ok(Date.now()-started<200);await new Promise(r=>setTimeout(r,30));assert.ok(closed>n);
  });
  await t.test('broken stream yields sanitized failure',async()=>{mode='break';const body=await storage.get(key);assert.ok(body);await assert.rejects(async()=>{for await(const chunk of body)void chunk;},safe);});
  await t.test('permission failure is not missing; confirmed bucket plus 404 is missing',async()=>{mode='denied';await assert.rejects(storage.head(key),safe);mode='missing';assert.equal(await storage.head(key),null);});
  await t.test('unreachable local endpoint fails within bounded request, no raw SDK error',async()=>{
    const unused=createServer();await new Promise<void>(done=>unused.listen(0,'127.0.0.1',done));const address=unused.address();assert.ok(address&&typeof address!=='string');await new Promise<void>(done=>unused.close(()=>done()));
    const unavailable=new S3AttachmentStorage({kind:'s3',endpoint:`http://127.0.0.1:${address.port}`,region:'us-east-1',bucket:'test-bucket',accessKeyId:'synthetic-key',secretAccessKey:'PRIVATE',forcePathStyle:true},{requestMs:250,streamMs:250});
    try{const started=Date.now();await assert.rejects(unavailable.head(key),safe);assert.ok(Date.now()-started<2000);}finally{unavailable.destroy();}
  });
});

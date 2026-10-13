import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {inspectOwnedDemo,assertWorkbookPayload} from '../isolated-demo-verification.mjs';
const directory='C:/private-owned';const manifest={project:'zhixu-local-abcdef123456',sourceSha:'b'.repeat(40),imageId:'sha256:image',port:62200,fixtureOnly:true,privateDirectory:directory};
const receipt={result:'OWNED_ISOLATED_INSPECT',fixtureOnly:true,volumeRetained:true,project:manifest.project,sourceSha:manifest.sourceSha,imageId:manifest.imageId,volume:manifest.project+'-data',url:'http://127.0.0.1:62200/login'};
const inspect=()=>({status:0,stdout:JSON.stringify(receipt)});const readManifest=()=>manifest;
test('inspection failure stops before private manifest read and dependent UI/network work',()=>{
 let reads=0;assert.throws(()=>inspectOwnedDemo(directory,{inspect:()=>({status:1,stdout:''}),readManifest:()=>{reads++;return manifest;}}),/owned_resource_check_failed/);assert.equal(reads,0);
 assert.throws(()=>inspectOwnedDemo(directory,{inspect:()=>({status:0,stdout:'invalid'}),readManifest:()=>{reads++;return manifest;}}),/receipt_invalid/);assert.equal(reads,0);
});
test('UI accepts only exact inspected manifest/source/image/loopback target',()=>{
 assert.equal(inspectOwnedDemo(directory,{baseUrl:'http://127.0.0.1:62200',inspect,readManifest}),manifest);
 for(const change of [{sourceSha:'c'.repeat(40)},{imageId:'other'},{port:62201},{privateDirectory:'C:/other'},{fixtureOnly:false}])assert.throws(()=>inspectOwnedDemo(directory,{baseUrl:'http://127.0.0.1:62200',inspect,readManifest:()=>({...manifest,...change})}));
 for(const baseUrl of ['http://localhost:62200','http://127.0.0.1:62201','http://127.0.0.1:62200/','http://remote:62200'])assert.throws(()=>inspectOwnedDemo(directory,{baseUrl,inspect,readManifest}));
});
test('runtime probe rejects payload byte drift and original workbook identity before DB access',()=>{
 const bytes=Buffer.from(JSON.stringify({sha256:'d'.repeat(64),sheets:{sample:[]}}));const m={workbookHash:'d'.repeat(64),workbookPayloadHash:createHash('sha256').update(bytes).digest('hex')};
 assert.deepEqual(assertWorkbookPayload(bytes,m).sheets,{sample:[]});
 assert.throws(()=>assertWorkbookPayload(Buffer.concat([bytes,Buffer.from(' ')]),m),/payload_mismatch/);
 assert.throws(()=>assertWorkbookPayload(bytes,{...m,workbookHash:'e'.repeat(64)}),/identity_mismatch/);
 const injected=Function('createHash','return ('+assertWorkbookPayload.toString()+')')(createHash);assert.throws(()=>injected(Buffer.concat([bytes,Buffer.from(' ')]),m),/payload_mismatch/);
});

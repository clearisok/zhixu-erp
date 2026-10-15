import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';

// Inspection is deliberately first: no payload or credentials are read on a failed ACL/resource check.
export function inspectOwnedDemo(directory,{baseUrl,inspect,readManifest}={}) {
 if(!directory)throw Error('private_manifest_required');
 const run=inspect??(()=>spawnSync(process.execPath,['scripts/isolated-demo.mjs','inspect',directory],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1024*1024}));
 const result=run();
 if(result.status!==0)throw Error('owned_resource_check_failed');
 let receipt;try{receipt=JSON.parse(result.stdout);}catch{throw Error('owned_inspection_receipt_invalid');}
 if(receipt.result!=='OWNED_ISOLATED_INSPECT'||receipt.fixtureOnly!==true||receipt.volumeRetained!==true)throw Error('owned_inspection_receipt_invalid');
 const m=(readManifest??(()=>JSON.parse(readFileSync(path.join(directory,'manifest.json'),'utf8'))))();
 const url='http://127.0.0.1:'+m.port;
 if(m.fixtureOnly!==true||!/^zhixu-local-[a-f0-9]{12}$/.test(m.project)||!/^[a-f0-9]{40}$/.test(m.sourceSha)||receipt.project!==m.project||receipt.sourceSha!==m.sourceSha||receipt.imageId!==m.imageId||receipt.volume!==m.project+'-data'||receipt.url!==url+'/login'||path.resolve(m.privateDirectory??'')!==path.resolve(directory))throw Error('owned_inspection_manifest_mismatch');
 if(baseUrl!==undefined&&(!/^http:\/\/127\.0\.0\.1:62\d\d\d$/.test(baseUrl)||baseUrl!==url))throw Error('owned_inspection_url_mismatch');
 return m;
}

export function assertWorkbookPayload(bytes,manifest) {
 if(createHash('sha256').update(bytes).digest('hex')!==manifest.workbookPayloadHash)throw Error('isolated_workbook_payload_mismatch');
 const workbook=JSON.parse(bytes.toString('utf8'));
 if(workbook.sha256!==manifest.workbookHash)throw Error('isolated_workbook_identity_mismatch');
 if(!workbook.sheets||typeof workbook.sheets!=='object'||Array.isArray(workbook.sheets))throw Error('isolated_workbook_content_invalid');
 return workbook;
}

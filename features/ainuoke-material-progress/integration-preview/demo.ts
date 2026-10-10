import assert from 'node:assert/strict';
import {startOrderMaterialFixture} from '../../../server/integration/order-material-fixture.js';
import {startOrderIntegrationPreview} from './server.mjs';
// Explicit developer-only entry: never loads deployment configuration, env credentials or real providers.
const fixture=await startOrderMaterialFixture();
let preview: Awaited<ReturnType<typeof startOrderIntegrationPreview>>|undefined;
try {
  preview=await startOrderIntegrationPreview(fixture.base);const origin=new URL(preview.url).origin;fixture.allowPreviewOrigin(origin);
  if(process.argv.includes('--verify')) {
    const response=await fetch(origin+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'X-Zhixu-Request':'1'},body:JSON.stringify({username:'tracker-a',password:'synthetic-only'})});
    assert.equal(response.status,200);console.log('Manual preview trusted login proxy PASS');
  } else {
    console.log(`SYNTHETIC ONLY: ${preview.url}`);
    console.log('Use a separate private browser profile. Synthetic login: tracker-a / synthetic-only. Ctrl+C cleans this disposable environment.');
    await new Promise<void>(done=>{process.once('SIGINT',()=>done());process.once('SIGTERM',()=>done());});
  }
} finally {await preview?.close();await fixture.close();console.log('Manual preview cleanup PASS (own Vite/API/disposable PG only)');}

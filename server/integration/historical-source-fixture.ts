import {mkdtemp,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
/** Seed a pre-0058 upgrade fixture with the actual previous application code.
 * Current writers intentionally fail closed until the audit migration exists.
 * Only tracked source is extracted; no checkout, real DB or source IO changes. */
export async function historicalSourceFixture(){
 const root=await mkdtemp(join(tmpdir(),'zhixu-historical-source-'));
 try{
  const tar=join(root,'source.tar');
  execFileSync('git',['archive','--format=tar','--output='+tar,'c5133e9e9e7065dc4fe7672c0c88c75688e0c51f','server','features','components','app','tools','package.json','tsconfig.json'],{windowsHide:true});
  execFileSync('tar',['-xf',tar,'-C',root],{windowsHide:true});
  await symlink(resolve('node_modules'),join(root,'node_modules'),process.platform==='win32'?'junction':'dir');
  const binding=await import(pathToFileURL(join(root,'server/ainuoke-source/binding.ts')).href),service=await import(pathToFileURL(join(root,'server/ainuoke-source/service.ts')).href);
  const payments=await import(pathToFileURL(join(root,'server/ainuoke-source/payment-request-collection.ts')).href),garments=await import(pathToFileURL(join(root,'server/ainuoke-source/garment-shipment-store.ts')).href);
  const garmentCollection=await import(pathToFileURL(join(root,'server/ainuoke-source/garment-collection-control.ts')).href);
  return {collectGarmentOnce:garmentCollection.collectGarmentOnce as typeof import('../ainuoke-source/garment-collection-control.js').collectGarmentOnce,collectAndPublishPaymentContracts:payments.collectAndPublishPaymentContracts as typeof import('../ainuoke-source/payment-request-collection.js').collectAndPublishPaymentContracts,publishGarmentObservation:garments.publishGarmentObservation as typeof import('../ainuoke-source/garment-shipment-store.js').publishGarmentObservation,bindOrders:binding.bindOrders as typeof import('../ainuoke-source/binding.js').bindOrders,captureSource:service.captureSource as typeof import('../ainuoke-source/service.js').captureSource,close:async()=>{
   const distance=relative(resolve(tmpdir()),resolve(root));if(!distance||distance.startsWith('..')||isAbsolute(distance))throw Error('fixture_cleanup_outside_tmp');
   await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }};
 }catch(e){const distance=relative(resolve(tmpdir()),resolve(root));if(distance&&!distance.startsWith('..')&&!isAbsolute(distance))await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});throw e;}
}

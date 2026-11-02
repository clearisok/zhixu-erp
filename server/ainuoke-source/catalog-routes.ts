import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import type { IdentityAuthority } from '../auth/identity-authority.js';
import { HttpError } from '../http/errors.js';
import { assertMutationBoundary, readJsonBody } from '../http/request.js';
import { sendJson } from '../http/responses.js';
import { readCatalog } from './catalog.js';
import { setFollowup } from './followup.js';
import { sourceActor } from './service.js';
import { SourceError } from './contract.js';
import { requestContractSync, readSyncRequest, resolveOrderSync } from './sync-queue.js';
import { readCatalogDetail, previewCatalogIntake, adoptCatalogContract } from './catalog-detail.js';

export async function routeSourceCatalog(request:IncomingMessage,response:ServerResponse,dependencies:{pool:Pool;identityAuthority:IdentityAuthority;allowedOrigins:readonly string[]}) {
 const u=new URL(request.url??'/','http://localhost'),prefix='/api/v1/ainuoke/catalog';
 if(u.pathname!==prefix&&!u.pathname.startsWith(prefix+'/'))return false;
 if(dependencies.identityAuthority.mode!=='session')throw new HttpError(404,'not_found','Route not found');
 const actor=await dependencies.identityAuthority.resolve(request);
 if(!actor)throw new HttpError(401,'authentication_required','Authentication required');
 try {
  if(u.pathname===prefix&&request.method==='GET'){
   const allowed=['search','scope','offset','limit'];
   if([...u.searchParams.keys()].some(k=>!allowed.includes(k)||u.searchParams.getAll(k).length!==1))throw new SourceError('catalog_query_invalid');
   const scope=u.searchParams.get('scope')??'all';
   if(!['all','active','history'].includes(scope))throw new SourceError('catalog_query_invalid');
   sendJson(response,200,await readCatalog(dependencies.pool,actor,{search:u.searchParams.get('search')??'',scope:scope as 'all'|'active'|'history',
    offset:Number(u.searchParams.get('offset')??0),limit:Number(u.searchParams.get('limit')??50)}));return true;
  }
  if([prefix+'/detail',prefix+'/intake-preview'].includes(u.pathname)&&request.method==='GET'){
   if([...u.searchParams.keys()].sort().join(',')!=='sourceId,sourceKey')throw new SourceError('catalog_query_invalid');
   const scope={sourceKey:u.searchParams.get('sourceKey')!,sourceId:u.searchParams.get('sourceId')!};
   sendJson(response,200,await(u.pathname.endsWith('/detail')?readCatalogDetail(dependencies.pool,actor,scope):previewCatalogIntake(dependencies.pool,actor,scope)));return true;
  }
  if(u.pathname===prefix+'/intake'&&request.method==='POST'&&!u.search){
   assertMutationBoundary(request,dependencies.allowedOrigins);const body=await readJsonBody(request);
   if(Object.keys(body).sort().join(',')!=='expectedPreview,observationId,requestId,sourceId,sourceKey')throw new SourceError('catalog_intake_invalid');
   sendJson(response,200,await adoptCatalogContract(dependencies.pool,actor,body as Parameters<typeof adoptCatalogContract>[2]));return true;
  }
  const intakeReceipt=/^\/api\/v1\/ainuoke\/catalog\/intake\/([a-f0-9-]{36})$/i.exec(u.pathname);
  if(intakeReceipt&&request.method==='GET'&&!u.search){
   await sourceActor(dependencies.pool,actor,false,false);
   const row=(await dependencies.pool.query('SELECT result FROM ainuoke_catalog_intake_receipts WHERE actor_id=$1 AND request_id=$2',[actor.internalUserId,intakeReceipt[1]])).rows[0];
   sendJson(response,200,{status:row?'complete':'not_found',result:row?.result??null});return true;
  }
  if(u.pathname===prefix+'/followup'&&request.method==='POST'&&!u.search){
   assertMutationBoundary(request,dependencies.allowedOrigins);const body=await readJsonBody(request);
   if(Object.keys(body).sort().join(',')!=='expectedVersion,mode,orderId,requestId')throw new SourceError('followup_invalid');
   sendJson(response,200,await setFollowup(dependencies.pool,actor,body as Parameters<typeof setFollowup>[2]));return true;
  }
  if(u.pathname===prefix+'/sync'&&request.method==='POST'&&!u.search){
   assertMutationBoundary(request,dependencies.allowedOrigins);const body=await readJsonBody(request);
   if(Object.keys(body).sort().join(',')!=='requestId,sourceId,sourceKey')throw new SourceError('sync_request_invalid');
   sendJson(response,202,await requestContractSync(dependencies.pool,actor,body as Parameters<typeof requestContractSync>[2]));return true;
  }
  if(u.pathname===prefix+'/sync-order'&&request.method==='POST'&&!u.search){
   assertMutationBoundary(request,dependencies.allowedOrigins);const body=await readJsonBody(request);
   if(Object.keys(body).sort().join(',')!=='orderId,requestId'||typeof body.orderId!=='string'||typeof body.requestId!=='string')throw new SourceError('sync_request_invalid');
   const scope=await resolveOrderSync(dependencies.pool,actor,body.orderId);
   sendJson(response,202,await requestContractSync(dependencies.pool,actor,{sourceKey:scope.sourceKey,sourceId:scope.sourceId,requestId:body.requestId}));return true;
  }
  if(u.pathname===prefix+'/sync-status'&&request.method==='GET'){
   if([...u.searchParams.keys()].join(',')!=='orderId')throw new SourceError('sync_order_invalid');
   sendJson(response,200,await resolveOrderSync(dependencies.pool,actor,u.searchParams.get('orderId')!));return true;
  }
  const syncReceipt=/^\/api\/v1\/ainuoke\/catalog\/sync\/([a-f0-9-]{36})$/i.exec(u.pathname);
  if(syncReceipt&&request.method==='GET'&&!u.search){
   sendJson(response,200,await readSyncRequest(dependencies.pool,actor,syncReceipt[1]));return true;
  }
  const receipt=/^\/api\/v1\/ainuoke\/catalog\/receipts\/([a-f0-9-]{36})$/i.exec(u.pathname);
  if(receipt&&request.method==='GET'&&!u.search){
   await sourceActor(dependencies.pool,actor,false);
   const row=(await dependencies.pool.query('SELECT result FROM ainuoke_followup_receipts WHERE actor_user_id=$1 AND request_id=$2',[actor.internalUserId,receipt[1]])).rows[0];
   sendJson(response,200,{status:row?'complete':'not_found',result:row?.result??null});return true;
  }
  throw new HttpError(404,'not_found','Route not found');
 }catch(e){if(e instanceof SourceError)throw new HttpError(e.code.includes('invalid')?400:e.code.includes('conflict')||['sync_worker_not_enabled','sync_worker_paused','sync_catalog_not_ready','sync_result_unknown','catalog_refresh_required','catalog_already_adopted','catalog_preview_changed','source_preview_changed'].includes(e.code)?409:503,e.code,'合同目录操作未完成，请重新核对状态。');throw e;}
}

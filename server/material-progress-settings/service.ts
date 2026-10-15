import {createHash} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import type {TrustedIdentity} from '../auth/session.js';
import {permissionsForUser,requirePermission} from '../auth/permissions.js';
import {requireOrderCommandActor} from '../sales-orders/identity-service.js';
import {HttpError} from '../http/errors.js';
import {appendOperationLog} from '../operation-logs/repository.js';
import {normalizeTrimPriorityKeywords,type MaterialProgressSettings} from '../../features/style-progress/model/material-display-order.js';
const fail=(status:number,code:string):never=>{throw new HttpError(status,code,code);};
export type ProgressSettingsCommand={requestId:string;expectedVersion:number;trimPriorityKeywords:string[]};
export function parseProgressSettingsCommand(value:unknown):ProgressSettingsCommand {
 if(!value||typeof value!=='object'||Array.isArray(value))return fail(400,'invalid_material_progress_settings');
 const input=value as Record<string,unknown>;
 if(Object.keys(input).some(key=>!['requestId','expectedVersion','trimPriorityKeywords'].includes(key))
   ||typeof input.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)
   ||!Number.isSafeInteger(input.expectedVersion)||(input.expectedVersion as number)<0||(input.expectedVersion as number)>=2147483647)return fail(400,'invalid_material_progress_settings');
 try{return {requestId:input.requestId.toLowerCase(),expectedVersion:input.expectedVersion as number,trimPriorityKeywords:normalizeTrimPriorityKeywords(input.trimPriorityKeywords)};}
 catch{return fail(400,'invalid_material_progress_settings');}
}
async function available(client:PoolClient){const row=(await client.query("SELECT to_regclass('public.material_progress_settings') IS NOT NULL AND to_regclass('public.material_progress_setting_commands') IS NOT NULL AS ready")).rows[0];if(!row.ready)fail(503,'material_progress_settings_unavailable');}
async function readActor(client:PoolClient,identity:TrustedIdentity){
 const user=(await client.query('SELECT public_id::text,active FROM app_users WHERE id=$1',[identity.internalUserId])).rows[0];
 if(!user?.active||user.public_id!==identity.userId)fail(401,'authentication_required');
 const permissions=await permissionsForUser(client,identity.internalUserId);requirePermission(permissions,'order.view');requirePermission(permissions,'style_progress.read');return {...identity,permissions};
}
async function state(client:PoolClient,actor:TrustedIdentity):Promise<MaterialProgressSettings>{
 const row=(await client.query("SELECT s.version,s.trim_priority_keywords,s.updated_at,u.display_name FROM material_progress_settings s JOIN app_users u ON u.id=s.updated_by WHERE s.scope=$1",['team'])).rows[0];
 return {schemaVersion:'material-progress-settings.v1',version:row?.version??0,configured:Boolean(row),trimPriorityKeywords:row?.trim_priority_keywords??[],updatedAt:row?.updated_at?.toISOString()??null,updatedBy:row?.display_name??null,canEdit:actor.permissions.includes('style_progress.settings.edit')};
}
export async function readMaterialProgressSettings(pool:Pool,identity:TrustedIdentity){const client=await pool.connect();try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const actor=await readActor(client,identity);await available(client);const result=await state(client,actor);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
export async function saveMaterialProgressSettings(pool:Pool,identity:TrustedIdentity,command:ProgressSettingsCommand){
 // Re-parse trusted callers too; HTTP is not the only possible entry point.
 command=parseProgressSettingsCommand(command);const hash=createHash('sha256').update(JSON.stringify(command)).digest('hex');
 const client=await pool.connect();try{
  await client.query('BEGIN');const actor=await requireOrderCommandActor(client,identity,'style_progress.settings.edit');requirePermission(actor.permissions,'style_progress.read');await available(client);
  await client.query('SELECT pg_advisory_xact_lock($1::bigint)',['873215970245']);
  const prior=(await client.query('SELECT payload_hash,result FROM material_progress_setting_commands WHERE actor_id=$1 AND request_id=$2',[actor.internalUserId,command.requestId])).rows[0];
  if(prior){if(prior.payload_hash!==hash)fail(409,'material_progress_settings_request_conflict');await client.query('COMMIT');return {...prior.result,replayed:true};}
  const before=await state(client,actor);if(before.version!==command.expectedVersion)fail(409,'material_progress_settings_version_conflict');
  const changed=!before.configured||JSON.stringify(before.trimPriorityKeywords)!==JSON.stringify(command.trimPriorityKeywords);
  if(changed){
   await client.query('INSERT INTO material_progress_settings(scope,version,trim_priority_keywords,updated_by) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(scope) DO UPDATE SET version=EXCLUDED.version,trim_priority_keywords=EXCLUDED.trim_priority_keywords,updated_by=EXCLUDED.updated_by,updated_at=now()',['team',before.version+1,JSON.stringify(command.trimPriorityKeywords),actor.internalUserId]);
   await appendOperationLog(client,actor,{module:'系统设置',action:'修改进度设置',entityType:'MaterialProgressSettings',entityId:'team',beforeData:{values:{辅料优先级:before.trimPriorityKeywords}},afterData:{values:{辅料优先级:command.trimPriorityKeywords}}});
  }
  const settings=await state(client,actor),result={settings,appliedVersion:settings.version,changed};
  await client.query('INSERT INTO material_progress_setting_commands(actor_id,request_id,payload_hash,result) VALUES($1,$2,$3,$4::jsonb)',[actor.internalUserId,command.requestId,hash,JSON.stringify(result)]);
  await client.query('COMMIT');return {...result,replayed:false};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

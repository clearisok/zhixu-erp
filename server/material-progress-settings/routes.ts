import type {IncomingMessage,ServerResponse} from 'node:http';
import type {Pool} from 'pg';
import type {IdentityAuthority} from '../auth/identity-authority.js';
import {HttpError} from '../http/errors.js';
import {requirePermission} from '../auth/permissions.js';
import {assertMutationBoundary,readJsonBody} from '../http/request.js';
import {sendJson} from '../http/responses.js';
import {readMaterialProgressSettings,saveMaterialProgressSettings,parseProgressSettingsCommand} from './service.js';
export async function routeMaterialProgressSettings(request:IncomingMessage,response:ServerResponse,deps:{pool:Pool;identityAuthority:IdentityAuthority;allowedOrigins:readonly string[]}){
 const url=new URL(request.url??'/','http://localhost');if(url.pathname!=='/api/v1/material-progress-settings')return false;
 if(deps.identityAuthority.mode!=='session')throw new HttpError(404,'not_found','Route not found');
 if(!['GET','PUT'].includes(request.method??''))throw new HttpError(405,'method_not_allowed','Method not allowed');
 if(url.search)throw new HttpError(400,'invalid_material_progress_settings','Unexpected query');
 const identity=await deps.identityAuthority.resolve(request);if(!identity)throw new HttpError(401,'authentication_required','Authentication required');
 requirePermission(identity.permissions,'order.view');requirePermission(identity.permissions,'style_progress.read');
 if(request.method==='GET')sendJson(response,200,await readMaterialProgressSettings(deps.pool,identity));
 else{requirePermission(identity.permissions,'style_progress.settings.edit');assertMutationBoundary(request,deps.allowedOrigins);const command=parseProgressSettingsCommand(await readJsonBody(request,16*1024));sendJson(response,200,await saveMaterialProgressSettings(deps.pool,identity,command));}
 return true;
}

import {normalizeTrimPriorityKeywords,type MaterialProgressSettings} from '../model/material-display-order';
export type ProgressSettingsRequest={requestId:string;expectedVersion:number;trimPriorityKeywords:string[]};
export class MaterialSettingsError extends Error {constructor(readonly status:number,readonly code:string){super(code);}}
export function parseMaterialProgressSettings(value:unknown):MaterialProgressSettings {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid_material_progress_settings_response');
 const row=value as Record<string,unknown>;
 const keywords=normalizeTrimPriorityKeywords(row.trimPriorityKeywords);
 if(row.schemaVersion!=='material-progress-settings.v1'||!Number.isSafeInteger(row.version)||(row.version as number)<0||typeof row.configured!=='boolean'||typeof row.canEdit!=='boolean'
  ||!(row.updatedAt===null||typeof row.updatedAt==='string'&&Number.isFinite(Date.parse(row.updatedAt)))||!(row.updatedBy===null||typeof row.updatedBy==='string')
  ||JSON.stringify(keywords)!==JSON.stringify(row.trimPriorityKeywords)||(!row.configured&&((row.version as number)!==0||keywords.length||row.updatedAt!==null||row.updatedBy!==null))||row.configured&&(row.version as number)<1)throw Error('invalid_material_progress_settings_response');
 return {schemaVersion:'material-progress-settings.v1',version:row.version as number,configured:row.configured,canEdit:row.canEdit,trimPriorityKeywords:keywords,updatedAt:row.updatedAt as string|null,updatedBy:row.updatedBy as string|null};
}
async function responseData(response:Response){let body;try{body=await response.json();}catch{throw new MaterialSettingsError(response.ok?0:response.status,'material_progress_settings_response_unknown');}if(!response.ok)throw new MaterialSettingsError(response.status,body?.error?.code??'material_progress_settings_failed');return body;}
export const materialProgressSettingsClient={
 async read(signal?:AbortSignal){return parseMaterialProgressSettings(await responseData(await fetch('/api/v1/material-progress-settings',{credentials:'include',cache:'no-store',signal})));},
 async save(command:ProgressSettingsRequest){const body=await responseData(await fetch('/api/v1/material-progress-settings',{method:'PUT',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json','X-Zhixu-Request':'1'},body:JSON.stringify(command)}));const settings=parseMaterialProgressSettings(body.settings);if(body.appliedVersion!==settings.version||typeof body.changed!=='boolean'||typeof body.replayed!=='boolean')throw new MaterialSettingsError(0,'material_progress_settings_response_unknown');return {settings,appliedVersion:body.appliedVersion as number,changed:body.changed as boolean,replayed:body.replayed as boolean};}
};
export function materialSettingsMessage(error:unknown){const code=error instanceof MaterialSettingsError?error.code:'';return ({material_progress_settings_version_conflict:'设置已被其他人更新，请重新读取后调整。',material_progress_settings_request_conflict:'本次请求与原保存不一致，请重新读取设置。',invalid_material_progress_settings:'关键词不符合要求，请检查重复、空白及长度。',permission_denied:'当前账号没有修改辅料排序的权限。',authentication_required:'登录状态已失效，请重新登录。',material_progress_settings_unavailable:'团队进度设置尚未就绪，请联系管理员。'} as Record<string,string>)[code]??'保存结果尚未确认，请用原请求重试。';}

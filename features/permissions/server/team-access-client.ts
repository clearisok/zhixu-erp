import {PERMISSION_KEYS,type Role} from "../model/permissions";
import {ServerAuthError} from "../../server-auth/server-auth-client";
export type TeamUser={id:string;name:string;account:string;status:"active"|"inactive"|"archived";roleIds:string[];version:string;lastLoginAt?:string|null;passwordResetRequired?:boolean};
export type TeamDirectory={users:TeamUser[];roles:(Role&{archived?:boolean})[];assignableRoleIds:string[];total:number;limit:number;offset:number;receipt?:{user:TeamUser}|null};
export type {TeamCommand} from "../../../server/auth/team-access";
import type {TeamCommand} from "../../../server/auth/team-access";
const messages:Record<string,string>={
 team_account_exists:"账号已存在（包括已删除用户），请核对原账号。",team_user_conflict:"用户已被更新，请取消并重新读取后再修改。",
 team_request_conflict:"同一请求的内容已改变，请先核对原操作。",team_self_lockout:"不能删除、停用自己或修改自己的角色。",
 team_last_admin:"必须保留至少一名启用的服务器管理员。",invalid_team_command:"请检查姓名、角色和账号格式。账号为3–64位字母、数字、点、下划线或连字符。",
 invalid_password:"密码至少6个字符，最多72个UTF-8字节，不要求字符组合。",role_not_found:"角色已删除，请选择有效角色。",
 team_user_archived:"用户已删除，请先恢复。",team_reset_required:"恢复后请先重置密码，再启用用户。",administrator_required:"仅服务器管理员可以管理用户。"
};
export function createTeamAccessClient(fetchImpl:typeof fetch=fetch){
 const project=(u:TeamUser):TeamUser=>{
  if(!u||typeof u.id!=="string"||typeof u.name!=="string"||typeof u.account!=="string"||!["active","inactive","archived"].includes(u.status)||typeof u.version!=="string"||!Array.isArray(u.roleIds)||u.roleIds.some(id=>typeof id!=="string"))throw new ServerAuthError(500,"internal_error");
  return {id:u.id,name:u.name,account:u.account,status:u.status,version:u.version,roleIds:[...u.roleIds],lastLoginAt:typeof u.lastLoginAt==="string"?u.lastLoginAt:null,passwordResetRequired:u.passwordResetRequired===true};
 };
 async function request(command?:TeamCommand,params?:URLSearchParams){
  let response:Response;try{response=await fetchImpl("/api/v1/team-access"+(params?.size?"?"+params:""),{credentials:"include",cache:"no-store",method:command?"POST":"GET",...(command?{headers:{"Content-Type":"application/json","X-Zhixu-Request":"1"},body:JSON.stringify(command)}:{})});}
  catch{throw new ServerAuthError(0,"team_outcome_unknown","结果尚未确认，请核对提交结果；不会自动重试。");}
  const data=await response.json().catch(()=>null);if(!response.ok)throw new ServerAuthError(response.status,data?.error?.code??"internal_error",messages[data?.error?.code]);
  if(!data||typeof data!=="object")throw new ServerAuthError(500,"internal_error");return data;
 }
 return {
  async read(params?:URLSearchParams):Promise<TeamDirectory>{
   const d=await request(undefined,params);
   if(!Array.isArray(d.users)||!Array.isArray(d.roles)||!Array.isArray(d.assignableRoleIds))throw new ServerAuthError(500,"internal_error");
   for(const r of d.roles)if(!r||typeof r.id!=="string"||typeof r.name!=="string"||typeof r.description!=="string"||!Array.isArray(r.permissions)||r.permissions.some((p:unknown)=>!PERMISSION_KEYS.includes(p as typeof PERMISSION_KEYS[number])))throw new ServerAuthError(500,"internal_error");
   if(d.assignableRoleIds.some((id:unknown)=>typeof id!=="string"||!d.roles.some((r:Role)=>r.id===id)))throw new ServerAuthError(500,"internal_error");
   return {users:d.users.map(project),roles:d.roles.map((r:Role&{archived?:boolean})=>({id:r.id,name:r.name,description:r.description,permissions:[...r.permissions],archived:r.archived===true})),assignableRoleIds:[...d.assignableRoleIds],
    total:typeof d.total==="number"?d.total:d.users.length,limit:d.limit??100,offset:d.offset??0,...(Object.hasOwn(d,"receipt")?{receipt:d.receipt?{user:project(d.receipt.user)}:null}:{})};
  },
  async execute(command:TeamCommand):Promise<TeamUser>{return project((await request(command)).user);}
 };
}

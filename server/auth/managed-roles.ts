import {createHash,randomUUID} from "node:crypto";
import type {Pool,PoolClient} from "pg";
import type {TrustedIdentity} from "./session.js";
import {requireServerAdministrator} from "./admin-guard.js";
import {isPermissionKey} from "./permissions.js";
import {HttpError} from "../http/errors.js";
import {appendOperationLog} from "../operation-logs/repository.js";
import type {PermissionKey} from "../../features/permissions/model/permissions.js";
export const ADMIN_ONLY_PERMISSIONS:readonly string[]=["user_permissions.view","user_permissions.manage"];
export type ManagedRole={id:string;name:string;description:string;permissions:PermissionKey[];version:string;userCount:number;protected:boolean};
export type RoleCommand={action:"create";requestId:string;name:string;description:string;permissions:PermissionKey[]}
 |{action:"update";requestId:string;id:string;expectedVersion:string;name:string;description:string;permissions:PermissionKey[]}
 |{action:"archive";requestId:string;id:string;expectedVersion:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function bad():never{throw new HttpError(400,"invalid_role_command","请检查角色名称和权限选择");}
export function parseRoleCommand(body:Record<string,unknown>):RoleCommand{
 const keys=body.action==="create"?["action","requestId","name","description","permissions"]:body.action==="update"?["action","requestId","id","expectedVersion","name","description","permissions"]:body.action==="archive"?["action","requestId","id","expectedVersion"]:[];
 if(!keys.length||keys.some(k=>!Object.hasOwn(body,k))||Object.keys(body).some(k=>!keys.includes(k))||typeof body.requestId!=="string"||!uuid.test(body.requestId))bad();
 if(body.action!=="create"&&(typeof body.id!=="string"||body.id.length>100||typeof body.expectedVersion!=="string"||!/^\d+$/u.test(body.expectedVersion)))bad();
 if(body.action==="archive")return body as RoleCommand;
 if(typeof body.name!=="string"||!body.name.trim()||body.name.length>80||/[\u0000-\u001f\u007f]/u.test(body.name)||typeof body.description!=="string"||body.description.length>500)bad();
 if(!Array.isArray(body.permissions)||body.permissions.some(p=>typeof p!=="string"||!isPermissionKey(p))||new Set(body.permissions).size!==body.permissions.length)bad();
 if(body.permissions.some(p=>ADMIN_ONLY_PERMISSIONS.includes(p)))throw new HttpError(403,"reserved_admin_permission","账号与角色管理权限仅属于服务器管理员");
 return {...body,name:body.name.trim(),permissions:[...body.permissions].sort()} as RoleCommand;
}
export async function listManagedRoles(client:PoolClient):Promise<ManagedRole[]>{
 const result=await client.query<ManagedRole>(`SELECT r.id,r.name,r.description,r.version::text,
 ARRAY(SELECT permission_key FROM app_role_permissions WHERE role_id=r.id ORDER BY permission_key) AS permissions,
 (SELECT count(*)::int FROM app_user_roles ur WHERE ur.role_id=r.id) AS "userCount",
 (r.id='role-server-admin') AS protected FROM app_roles r WHERE r.archived_at IS NULL ORDER BY (r.id='role-server-admin') DESC,r.name`);
 return result.rows;
}
export async function readManagedRoles(pool:Pool,identity:TrustedIdentity,requestId?:string){
 if(requestId&&!uuid.test(requestId))bad();
 const c=await pool.connect();try{await c.query("BEGIN");await requireServerAdministrator(c,identity,false);const roles=await listManagedRoles(c);
 const receipt=requestId?(await c.query("SELECT result FROM team_admin_receipts WHERE actor_id=$1 AND request_id=$2 AND command_kind LIKE 'role.%'",[identity.internalUserId,requestId])).rows[0]?.result??null:undefined;
 await c.query("COMMIT");return {roles,...(requestId?{receipt}:{})};}
 catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
}
export async function executeRoleCommand(pool:Pool,identity:TrustedIdentity,input:RoleCommand){
 const command=parseRoleCommand(input as unknown as Record<string,unknown>),c=await pool.connect();
 try{
 await c.query("BEGIN");await c.query("SELECT pg_advisory_xact_lock(hashtext('zhixu-first-team-access'))");
 const actor=await requireServerAdministrator(c,identity,true),digest=createHash("sha256").update(JSON.stringify(command)).digest("hex");
 const receipt=(await c.query<{payload_hash:string;result:{role:ManagedRole|null}}>("SELECT payload_hash,result FROM team_admin_receipts WHERE actor_id=$1 AND request_id=$2",[actor.internalUserId,command.requestId])).rows[0];
 if(receipt){if(receipt.payload_hash!==digest)throw new HttpError(409,"role_request_conflict","请求内容已经改变，请重新读取");await c.query("COMMIT");return {...receipt.result,replayed:true};}
 const before=command.action==="create"?null:(await listManagedRoles(c)).find(r=>r.id===command.id);
 if(command.action!=="create"){
  if(!before)throw new HttpError(404,"role_not_found","角色不存在或已删除");
  if(before.protected)throw new HttpError(409,"protected_admin_role","服务器管理员角色不能修改或删除");
  if(before.version!==command.expectedVersion)throw new HttpError(409,"role_version_conflict","角色已更新，请重新读取后修改");
 }
 const id=before?.id??"role-custom-"+randomUUID();
 // Serialize with login so no session can slip between grant changes and revocation.
 const members=(await c.query<{username:string}>("SELECT u.username FROM app_users u JOIN app_user_roles ur ON ur.user_id=u.id WHERE ur.role_id=$1 ORDER BY u.username",[id])).rows;
 for(const member of members)await c.query("SELECT pg_advisory_xact_lock(hashtext($1))",["login:"+member.username]);
 if(command.action==="archive"){
  if(before!.userCount)throw new HttpError(409,"role_in_use","仍有用户使用此角色，请先调整用户角色");
  await c.query("UPDATE app_roles SET archived_at=now(),version=version+1,updated_at=now() WHERE id=$1",[id]);
 }else{
  if(command.action==="create")await c.query("INSERT INTO app_roles(id,name,description) VALUES($1,$2,$3)",[id,command.name,command.description]);
  else await c.query("UPDATE app_roles SET name=$2,description=$3,version=version+1,updated_at=now() WHERE id=$1",[id,command.name,command.description]);
  await c.query("DELETE FROM app_role_permissions WHERE role_id=$1",[id]);
  await c.query("INSERT INTO app_role_permissions(role_id,permission_key) SELECT $1,unnest($2::text[])",[id,command.permissions]);
 }
 await c.query("UPDATE app_sessions SET revoked_at=now() WHERE revoked_at IS NULL AND user_id IN(SELECT user_id FROM app_user_roles WHERE role_id=$1)",[id]);
 const after=(await listManagedRoles(c)).find(r=>r.id===id)??null;
 const snapshot=(r:ManagedRole|null)=>r?{objectName:r.name,values:{"角色":r.name,"说明":r.description,"权限":r.permissions.join(",")}}:null;
 await appendOperationLog(c,actor,{module:"权限管理",entityType:"Role",entityId:id,action:command.action==="create"?"创建角色":command.action==="archive"?"删除角色":"修改权限",beforeData:snapshot(before??null),afterData:snapshot(after)});
 const result={role:after};
 await c.query("INSERT INTO team_admin_receipts(actor_id,request_id,command_kind,target_id,payload_hash,result) VALUES($1,$2,$3,$4,$5,$6::jsonb)",[actor.internalUserId,command.requestId,"role."+command.action,id,digest,JSON.stringify(result)]);
 await c.query("COMMIT");return {...result,replayed:false};
 }catch(e){await c.query("ROLLBACK");if((e as {code?:string}).code==="23505")throw new HttpError(409,"role_name_exists","角色名称已存在，包含已删除角色");throw e;}finally{c.release();}
}


import {createHash} from "node:crypto";
import type {Pool,PoolClient} from "pg";
import {HttpError} from "../http/errors.js";
import {appendOperationLog} from "../operation-logs/repository.js";
import type {TrustedIdentity} from "./session.js";
import {TEAM_ROLES} from "./team-roles.js";
import {passwordValidationMessage} from "../../features/permissions/model/password-policy.js";
import {requireServerAdministrator} from "./admin-guard.js";

type UserRow={id:string;public_id:string;username:string;display_name:string;active:boolean;updated:string;role_ids:string[];archived_at:string|null;last_login_at:string|null;password_reset_required:boolean};
const columns=`u.id::text,u.public_id::text,u.username,u.display_name,u.active,u.updated_at::text AS updated,
 u.archived_at::text,u.last_login_at::text,u.password_reset_required,
 ARRAY(SELECT role_id FROM app_user_roles WHERE user_id=u.id ORDER BY role_id) AS role_ids`;
function userView(row:UserRow){
 const {last_login_at,...versionFields}=row;
 return {id:row.public_id,name:row.display_name,account:row.username,status:row.archived_at?"archived" as const:row.active?"active" as const:"inactive" as const,
 roleIds:row.role_ids,lastLoginAt:last_login_at,passwordResetRequired:row.password_reset_required,
 version:createHash("sha256").update(JSON.stringify(versionFields)).digest("hex")};
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function bad(message="请检查账号资料"):never{throw new HttpError(400,"invalid_team_command",message);}
function text(v:unknown,max:number){if(typeof v!=="string"||!v.trim()||v.length>max||/[\u0000-\u001f\u007f]/u.test(v))bad();return v.trim();}
function password(v:unknown):string{const e=passwordValidationMessage(v);if(e)throw new HttpError(400,"invalid_password",e);return v as string;}
function roles(v:unknown):string[]{if(!Array.isArray(v)||v.length<1||v.length>20||new Set(v).size!==v.length||v.some(x=>typeof x!=="string"||! /^[a-zA-Z0-9_-]{1,100}$/u.test(x)))bad("请选择有效角色");return [...v].sort();}
type Target={id:string;expectedVersion:string;requestId?:string};
export type TeamCommand=
 |{action:"create";requestId:string;account:string;name:string;password:string;roleIds:string[]}
 |(Target&{action:"update";name:string;status:"active"|"inactive";roleIds:string[]})
 |(Target&{action:"reset-password";password:string})
 |(Target&{action:"archive"|"revoke-sessions"})
 |(Target&{action:"restore";roleIds:string[]});
export function parseTeamCommand(body:Record<string,unknown>):TeamCommand{
 const a=body.action,common=["action","id","expectedVersion"],keys=a==="create"?["action","requestId","account","name","password","roleIds"]:a==="update"?[...common,"name","status","roleIds"]:a==="reset-password"?[...common,"password"]:a==="restore"?[...common,"roleIds"]:a==="archive"||a==="revoke-sessions"?common:[];
 if(!keys.length||keys.some(k=>!Object.hasOwn(body,k))||Object.keys(body).some(k=>!keys.includes(k)&&k!=="requestId"))bad();
 if(body.requestId!==undefined&&(typeof body.requestId!=="string"||!uuid.test(body.requestId)))bad();
 if(a==="create"){
  const account=text(body.account,64).toLowerCase(),ids=roles(body.roleIds);
  if(!/^[a-z0-9][a-z0-9._-]{2,63}$/u.test(account))bad("账号需为3–64位字母、数字、点、下划线或连字符");
  if(ids.length!==1)bad("新用户只能选择一个角色");
  return {action:a,requestId:body.requestId as string,account,name:text(body.name,80),password:password(body.password),roleIds:ids};
 }
 if(typeof body.id!=="string"||!uuid.test(body.id)||typeof body.expectedVersion!=="string"||! /^[0-9a-f]{64}$/u.test(body.expectedVersion))bad();
 const target={id:body.id,expectedVersion:body.expectedVersion,...(body.requestId?{requestId:body.requestId as string}:{})};
 if(a==="reset-password")return {...target,action:a,password:password(body.password)};
 if(a==="restore"){const ids=roles(body.roleIds);if(ids.length!==1)bad("恢复时请选择一个有效角色");return {...target,action:a,roleIds:ids};}
 if(a==="archive"||a==="revoke-sessions")return {...target,action:a};
 if(body.status!=="active"&&body.status!=="inactive")bad();
 return {...target,action:"update",name:text(body.name,80),status:body.status,roleIds:roles(body.roleIds)};
}
async function ensureRoles(c:PoolClient,ids:string[]){
 for(const id of ids){
  const stored=(await c.query<{archived_at:string|null}>("SELECT archived_at FROM app_roles WHERE id=$1 FOR SHARE",[id])).rows[0];
  if(stored){if(stored.archived_at)throw new HttpError(409,"role_not_found","角色已删除");continue;}
  const preset=TEAM_ROLES.find(r=>r.id===id);if(!preset)bad("角色不存在");
  await c.query("INSERT INTO app_roles(id,name,description) VALUES($1,$2,$3)",[id,preset.name,preset.description]);
  await c.query("INSERT INTO app_role_permissions(role_id,permission_key) SELECT $1,unnest($2::text[])",[id,preset.permissions]);
 }
}
async function getUser(c:PoolClient,id:string){return (await c.query<UserRow>(`SELECT ${columns} FROM app_users u WHERE public_id=$1::uuid FOR UPDATE OF u`,[id])).rows[0];}
export type TeamQuery={limit:number;offset:number;q?:string;roleId?:string;status?:string;requestId?:string};
export function parseTeamQuery(p:URLSearchParams):TeamQuery{
 const keys=["limit","offset","q","roleId","status","requestId"];for(const k of p.keys())if(!keys.includes(k)||p.getAll(k).length!==1)bad();
 const integer=(key:string,d:number,min:number,max:number)=>{const v=p.get(key);if(v===null)return d;if(!/^\d{1,7}$/u.test(v)||Number(v)<min||Number(v)>max)bad();return Number(v);};
 const q:TeamQuery={limit:integer("limit",100,1,100),offset:integer("offset",0,0,1000000)};
 if(p.has("q")){q.q=p.get("q")!.trim();if(q.q.length>128||/[\u0000-\u001f]/u.test(q.q))bad();}
 if(p.has("roleId"))q.roleId=text(p.get("roleId"),100);
 if(p.has("status")){q.status=p.get("status")!;if(!["active","inactive","archived"].includes(q.status))bad();}
 if(p.has("requestId")){q.requestId=p.get("requestId")!;if(!uuid.test(q.requestId))bad();}
 return q;
}
export async function readTeamAccess(pool:Pool,identity:TrustedIdentity,query:TeamQuery={limit:100,offset:0}){
 const c=await pool.connect();try{
  await c.query("BEGIN");if(query.requestId)await c.query("SELECT pg_advisory_xact_lock(hashtext('zhixu-first-team-access'))");await requireServerAdministrator(c,identity,false);
  const args:unknown[]=[],param=(v:unknown)=>{args.push(v);return "$"+args.length;},where=[query.status==="archived"?"u.archived_at IS NOT NULL":"u.archived_at IS NULL"];
  if(query.status==="active"||query.status==="inactive")where.push("u.active="+param(query.status==="active"));
  if(query.roleId)where.push(`EXISTS(SELECT 1 FROM app_user_roles ur WHERE ur.user_id=u.id AND ur.role_id=${param(query.roleId)})`);
  for(const term of (query.q??"").split(/\s+/u).filter(Boolean)){
   const v=param("%"+term.replace(/[\\%_]/gu,x=>"\\"+x)+"%");
   where.push(`(u.username ILIKE ${v} OR u.display_name ILIKE ${v} OR EXISTS(SELECT 1 FROM app_user_roles ur JOIN app_roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.name ILIKE ${v}))`);
  }
  const clause=where.join(" AND "),total=Number((await c.query(`SELECT count(*) n FROM app_users u WHERE ${clause}`,args)).rows[0].n);
  const users=(await c.query<UserRow>(`SELECT ${columns} FROM app_users u WHERE ${clause} ORDER BY u.username,u.id LIMIT ${param(query.limit)} OFFSET ${param(query.offset)}`,args)).rows;
  const actual=(await c.query<{id:string;name:string;description:string;permissions:string[];archived:boolean}>("SELECT r.id,r.name,r.description,r.archived_at IS NOT NULL AS archived,ARRAY(SELECT permission_key FROM app_role_permissions WHERE role_id=r.id ORDER BY permission_key) AS permissions FROM app_roles r ORDER BY r.name")).rows;
  const available=[...actual,...TEAM_ROLES.filter(p=>!actual.some(r=>r.id===p.id)).map(p=>({...p,archived:false}))];
  const receipt=query.requestId?(await c.query("SELECT result FROM team_admin_receipts WHERE actor_id=$1 AND request_id=$2 AND command_kind LIKE 'user.%'",[identity.internalUserId,query.requestId])).rows[0]?.result??null:undefined;
  await c.query("COMMIT");return {users:users.map(userView),roles:available,assignableRoleIds:available.filter(r=>!r.archived).map(r=>r.id),total,limit:query.limit,offset:query.offset,...(query.requestId?{receipt}:{})};
 }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
}
// Legacy callers without a request ID use a deterministic identity for their CAS command.
// Passwords are never hashed into public receipts or persisted outside password_hash.
function commandIdentity(command:TeamCommand){
 const safe=Object.fromEntries(Object.entries(command).filter(([k])=>k!=="password"));
 const hash=createHash("sha256").update(JSON.stringify(safe)).digest("hex");
 const key=command.requestId??[hash.slice(0,8),hash.slice(8,12),"4"+hash.slice(13,16),"8"+hash.slice(17,20),hash.slice(20,32)].join("-");
 return {key,hash};
}
export async function executeTeamCommand(pool:Pool,identity:TrustedIdentity,input:TeamCommand){
 const command=parseTeamCommand(input as unknown as Record<string,unknown>),c=await pool.connect();
 try{
  await c.query("BEGIN");await c.query("SELECT pg_advisory_xact_lock(hashtext('zhixu-first-team-access'))");
  const targetName=command.action==="create"?command.account:(await c.query<{username:string}>("SELECT username FROM app_users WHERE public_id=$1::uuid",[command.id])).rows[0]?.username;
  for(const name of [...new Set([identity.username,targetName].filter((x):x is string=>Boolean(x)))].sort())await c.query("SELECT pg_advisory_xact_lock(hashtext($1))",["login:"+name]);
  const actor=await requireServerAdministrator(c,identity,true),{key,hash}=commandIdentity(command);
  const previous=(await c.query<{payload_hash:string;result:{user:ReturnType<typeof userView>}}>("SELECT payload_hash,result FROM team_admin_receipts WHERE actor_id=$1 AND request_id=$2",[actor.internalUserId,key])).rows[0];
  if(previous){if(previous.payload_hash!==hash)throw new HttpError(409,"team_request_conflict","请求内容已改变");await c.query("COMMIT");return {...previous.result,replayed:true};}
  let before:ReturnType<typeof userView>|null=null,target:UserRow;
  let beforeRoleNames:string[]=[];
  if(command.action==="create"){
   const existing=(await c.query<UserRow>(`SELECT ${columns} FROM app_users u WHERE lower(username)=$1 OR public_id=$2::uuid FOR UPDATE OF u`,[command.account,command.requestId])).rows;
   if(existing.length)throw new HttpError(409,"team_account_exists","账号已存在（包括已删除用户），请核对原账号");
   await ensureRoles(c,command.roleIds);
   await c.query("INSERT INTO app_users(public_id,username,password_hash,display_name,role) VALUES($1,$2,crypt($3,gen_salt('bf',12)),$4,'viewer')",[command.requestId,command.account,command.password,command.name]);
   target=(await getUser(c,command.requestId))!;
   await c.query("INSERT INTO app_user_roles(user_id,role_id) SELECT $1,unnest($2::text[])",[target.id,command.roleIds]);
  }else{
   target=(await getUser(c,command.id))!;if(!target)throw new HttpError(404,"team_user_not_found","用户不存在");
   before=userView(target);
   if(before.version!==command.expectedVersion)throw new HttpError(409,"team_user_conflict","用户已更新，请重新读取");
   if(target.archived_at&&command.action!=="restore")throw new HttpError(409,"team_user_archived","请先恢复用户");
   if(!target.archived_at&&command.action==="restore")throw new HttpError(409,"team_not_archived","用户未删除");
   beforeRoleNames=(await c.query<{name:string}>("SELECT name FROM app_roles WHERE id=ANY($1::text[]) ORDER BY id",[target.role_ids])).rows.map(r=>r.name);
   if(command.action==="update"&&command.roleIds.length!==1&&JSON.stringify(command.roleIds)!==JSON.stringify(target.role_ids))bad("修改角色时只能选择一个角色");
   const losesAdmin=command.action==="archive"||command.action==="update"&&(command.status!=="active"||!command.roleIds.includes("role-server-admin"));
   if(target.id===actor.internalUserId&&(command.action==="archive"||command.action==="update"&&(command.status!=="active"||JSON.stringify(command.roleIds)!==JSON.stringify(target.role_ids))))throw new HttpError(409,"team_self_lockout","不能删除、停用自己或修改自己的角色");
   if(target.active&&target.role_ids.includes("role-server-admin")&&losesAdmin){
    const others=await c.query("SELECT u.id FROM app_users u JOIN app_user_roles ur ON ur.user_id=u.id WHERE u.active AND u.archived_at IS NULL AND ur.role_id='role-server-admin' AND u.id<>$1 FOR SHARE OF u",[target.id]);
    if(!others.rowCount)throw new HttpError(409,"team_last_admin","必须保留至少一名启用管理员");
   }
   if(command.action==="reset-password"){
    await c.query("UPDATE app_users SET password_hash=crypt($2,gen_salt('bf',12)),password_reset_required=false,updated_at=clock_timestamp() WHERE id=$1",[target.id,command.password]);
    await c.query("DELETE FROM login_attempts WHERE username=$1",[target.username]);
   }else if(command.action==="archive"){
    await c.query("UPDATE app_users SET active=false,archived_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1",[target.id]);
   }else if(command.action==="restore"||command.action==="update"){
    await ensureRoles(c,command.roleIds);
    if(command.action==="update"&&command.status==="active"&&target.password_reset_required)throw new HttpError(409,"team_reset_required","恢复后请先重置密码，再启用用户");
    if(command.action==="restore")await c.query("UPDATE app_users SET archived_at=NULL,active=false,password_reset_required=true,updated_at=clock_timestamp() WHERE id=$1",[target.id]);
    else await c.query("UPDATE app_users SET display_name=$2,active=$3,updated_at=clock_timestamp() WHERE id=$1",[target.id,command.name,command.status==="active"]);
    if(JSON.stringify(command.roleIds)!==JSON.stringify(target.role_ids)){
     await c.query("DELETE FROM app_user_roles WHERE user_id=$1",[target.id]);
     await c.query("INSERT INTO app_user_roles(user_id,role_id) SELECT $1,unnest($2::text[])",[target.id,command.roleIds]);
    }
   }else await c.query("UPDATE app_users SET updated_at=clock_timestamp() WHERE id=$1",[target.id]);
   await c.query("UPDATE app_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL",[target.id]);
  }
  const after=userView((await getUser(c,target.public_id))!);
  const afterRoleNames=(await c.query<{name:string}>("SELECT name FROM app_roles WHERE id=ANY($1::text[]) ORDER BY id",[after.roleIds])).rows.map(r=>r.name);
  const snapshot=(u:typeof before,names:string[])=>u?{objectName:u.name,values:{name:u.name,account:u.account,status:u.status,roles:names.join("、")}}:null;
  const action=command.action==="create"?"创建账号":command.action==="reset-password"?"重置密码":command.action==="archive"?"删除用户":command.action==="restore"?"恢复用户":command.action==="revoke-sessions"?"退出用户会话":"修改账号";
  await appendOperationLog(c,actor,{operationId:"operation-"+key,module:"权限管理",entityType:"User",entityId:after.id,action,beforeData:snapshot(before,beforeRoleNames),afterData:snapshot(after,afterRoleNames),metadata:{command:command.action,roleNamesAreSnapshots:true}});
  const result={user:after};await c.query("INSERT INTO team_admin_receipts(actor_id,request_id,command_kind,target_id,payload_hash,result) VALUES($1,$2,$3,$4,$5,$6::jsonb)",[actor.internalUserId,key,"user."+command.action,after.id,hash,JSON.stringify(result)]);
  await c.query("COMMIT");return {...result,replayed:false};
 }catch(e){await c.query("ROLLBACK");if((e as {code?:string}).code==="23505")throw new HttpError(409,"team_account_exists","账号已存在");throw e;}finally{c.release();}
}

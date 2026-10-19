import type {IncomingMessage,ServerResponse} from "node:http";
import type {Pool} from "pg";
import type {IdentityAuthority} from "./identity-authority.js";
import {HttpError} from "../http/errors.js";
import {assertMutationBoundary,readJsonBody} from "../http/request.js";
import {sendJson} from "../http/responses.js";
import {executeRoleCommand,parseRoleCommand,readManagedRoles} from "./managed-roles.js";
export async function routeManagedRoles(request:IncomingMessage,response:ServerResponse,dependencies:{pool:Pool;identityAuthority:IdentityAuthority;allowedOrigins:readonly string[]}){
 if(new URL(request.url??"/","http://localhost").pathname!=="/api/v1/team-roles")return false;
 if(dependencies.identityAuthority.mode!=="session")throw new HttpError(404,"not_found","Route not found");
 const actor=await dependencies.identityAuthority.resolve(request);if(!actor)throw new HttpError(401,"authentication_required","请先登录");
 if(request.method==="GET"){
  const params=new URL(request.url??"/","http://localhost").searchParams;
  for(const key of params.keys())if(key!=="requestId"||params.getAll(key).length!==1)throw new HttpError(400,"invalid_query","请求无效");
  sendJson(response,200,await readManagedRoles(dependencies.pool,actor,params.get("requestId")??undefined));
 }
 else if(request.method==="POST"){assertMutationBoundary(request,dependencies.allowedOrigins);sendJson(response,200,await executeRoleCommand(dependencies.pool,actor,parseRoleCommand(await readJsonBody(request,16384))));}
 else throw new HttpError(405,"method_not_allowed","Method not allowed");
 return true;
}


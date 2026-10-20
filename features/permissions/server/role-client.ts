import type {ManagedRole,RoleCommand} from "../../../server/auth/managed-roles";
export type {ManagedRole,RoleCommand};
const messages:Record<string,string>={role_in_use:"仍有用户使用此角色，请先到用户管理调整角色。",protected_admin_role:"服务器管理员角色不能修改或删除。",role_version_conflict:"此角色已被其他人更新，请重新读取。",role_name_exists:"角色名称已存在，包含已删除角色。",reserved_admin_permission:"用户与角色管理仅限服务器管理员。",administrator_required:"仅服务器管理员可使用此功能。",permission_denied:"当前账号没有操作权限。",authentication_required:"登录已失效，请重新登录。"};
export class RoleRequestError extends Error{constructor(message:string,readonly status:number){super(message);}}
export async function roleRequest(command?:RoleCommand,requestId?:string):Promise<{roles?:ManagedRole[];role?:ManagedRole|null;receipt?:unknown}>{
 const response=await fetch("/api/v1/team-roles"+(requestId?"?requestId="+encodeURIComponent(requestId):""),{credentials:"include",cache:"no-store",method:command?"POST":"GET",...(command?{headers:{"Content-Type":"application/json","X-Zhixu-Request":"1"},body:JSON.stringify(command)}:{})});
 const data=await response.json();
 if(!response.ok)throw new RoleRequestError(messages[data?.error?.code]??"请求未完成，请重新读取核对。",response.status);
 return data;
}


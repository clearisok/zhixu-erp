import { PERMISSION_KEYS, type Role } from "../model/permissions";
import { ServerAuthError } from "../../server-auth/server-auth-client";

export type TeamUser = { id: string; name: string; account: string; status: "active" | "inactive"; roleIds: string[]; version: string };
export type TeamDirectory = { users: TeamUser[]; roles: Role[]; assignableRoleIds: string[] };
export type TeamCommand =
  | { action: "create"; requestId: string; account: string; name: string; password: string; roleIds: string[] }
  | { action: "update"; id: string; expectedVersion: string; name: string; status: "active" | "inactive"; roleIds: string[] }
  | { action: "reset-password"; id: string; expectedVersion: string; password: string };
const messages: Record<string,string> = {
  team_account_exists: "账号或请求标识已存在，请刷新核对；未修改原账号。",
  team_user_conflict: "账号已被更新，请刷新后重试。",
  team_role_drift: "已有角色权限与预设不同，需要先审查，未覆盖原授权。",
  team_self_lockout: "不能停用自己或修改自己的角色。",
  team_last_admin: "必须保留至少一个启用的系统管理员。",
  invalid_team_command: "输入无效：账号3–64位字母/数字/点/下划线/连字符；密码至少12字符、不超过72字节。",
};
export function createTeamAccessClient(fetchImpl: typeof fetch = fetch) {
  async function request(command?: TeamCommand) {
    let response: Response;
    try {
      response = await fetchImpl("/api/v1/team-access", { credentials:"include", cache:"no-store", method:command?"POST":"GET",
        ...(command?{headers:{"Content-Type":"application/json","X-Zhixu-Request":"1"},body:JSON.stringify(command)}:{}) });
    } catch { throw new ServerAuthError(0,"team_outcome_unknown","请求结果尚未确认，请刷新账号列表核对；不会自动重试。"); }
    const data = await response.json().catch(()=>null);
    if (!response.ok) throw new ServerAuthError(response.status,data?.error?.code ?? "internal_error",messages[data?.error?.code]);
    if (!data || typeof data!=="object") throw new ServerAuthError(500,"internal_error");
    return data;
  }
  return {
    async read(): Promise<TeamDirectory> {
      const data=await request();
      if(!Array.isArray(data.users)||!Array.isArray(data.roles)||!Array.isArray(data.assignableRoleIds)) throw new ServerAuthError(500,"internal_error");
      for(const user of data.users) if(!user||typeof user.id!=="string"||typeof user.name!=="string"||typeof user.account!=="string"||!["active","inactive"].includes(user.status)||typeof user.version!=="string"||!Array.isArray(user.roleIds)||user.roleIds.some((id:unknown)=>typeof id!=="string")) throw new ServerAuthError(500,"internal_error");
      for(const role of data.roles) if(!role||typeof role.id!=="string"||typeof role.name!=="string"||typeof role.description!=="string"||!Array.isArray(role.permissions)||role.permissions.some((key:unknown)=>!PERMISSION_KEYS.includes(key as typeof PERMISSION_KEYS[number]))) throw new ServerAuthError(500,"internal_error");
      if(data.assignableRoleIds.some((id:unknown)=>typeof id!=="string"||!data.roles.some((role:Role)=>role.id===id))) throw new ServerAuthError(500,"internal_error");
      return { users:data.users.map((u:TeamUser)=>({id:u.id,name:u.name,account:u.account,status:u.status,version:u.version,roleIds:[...u.roleIds]})),
        roles:data.roles.map((r:Role)=>({id:r.id,name:r.name,description:r.description,permissions:[...r.permissions]})),assignableRoleIds:[...data.assignableRoleIds] };
    },
    async execute(command:TeamCommand):Promise<void> { await request(command); },
  };
}

import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { HttpError } from "../http/errors.js";
import { appendOperationLog } from "../operation-logs/repository.js";
import { permissionsForUser, requirePermission } from "./permissions.js";
import type { TrustedIdentity } from "./session.js";
import { TEAM_ROLES } from "./team-roles.js";

type UserRow = { id: string; public_id: string; username: string; display_name: string; active: boolean; updated: string; role_ids: string[] };
const columns = `u.id::text, u.public_id::text, u.username, u.display_name, u.active, u.updated_at::text AS updated,
  ARRAY(SELECT role_id FROM app_user_roles WHERE user_id=u.id ORDER BY role_id) AS role_ids`;
function userView(row: UserRow) {
  return { id: row.public_id, name: row.display_name, account: row.username, status: row.active ? "active" as const : "inactive" as const,
    roleIds: row.role_ids, version: createHash("sha256").update(JSON.stringify(row)).digest("hex") };
}
function bad(message = "账号请求无效"): never { throw new HttpError(400, "invalid_team_command", message); }
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) bad();
  return value.trim();
}
function password(value: unknown): string {
  if (typeof value !== "string" || value.length < 12 || Buffer.byteLength(value, "utf8") > 72 || value.includes("\0")) bad("密码至少12个字符且不超过72个UTF-8字节");
  return value;
}
function roleIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > TEAM_ROLES.length || value.some(id => typeof id !== "string" || !TEAM_ROLES.some(role => role.id === id)) || new Set(value).size !== value.length) bad("请选择已批准的预设角色");
  return [...value].sort();
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export type TeamCommand =
  | { action: "create"; requestId: string; account: string; name: string; password: string; roleIds: string[] }
  | { action: "update"; id: string; expectedVersion: string; name: string; status: "active" | "inactive"; roleIds: string[] }
  | { action: "reset-password"; id: string; expectedVersion: string; password: string };

export function parseTeamCommand(body: Record<string, unknown>): TeamCommand {
  const action = body.action;
  const keys = action === "create" ? ["action", "requestId", "account", "name", "password", "roleIds"]
    : action === "update" ? ["action", "id", "expectedVersion", "name", "status", "roleIds"]
    : action === "reset-password" ? ["action", "id", "expectedVersion", "password"] : [];
  if (!keys.length || Object.keys(body).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(body, key))) bad();
  if (action === "create") {
    const account = text(body.account, 64).toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{2,63}$/u.test(account) || typeof body.requestId !== "string" || !uuid.test(body.requestId)) bad("账号需为3–64位字母、数字、点、下划线或连字符");
    return { action, requestId: body.requestId, account, name: text(body.name, 80), password: password(body.password), roleIds: roleIds(body.roleIds) };
  }
  if (typeof body.id !== "string" || !uuid.test(body.id) || typeof body.expectedVersion !== "string" || !/^[0-9a-f]{64}$/u.test(body.expectedVersion)) bad();
  if (action === "reset-password") return { action, id: body.id, expectedVersion: body.expectedVersion, password: password(body.password) };
  if (body.status !== "active" && body.status !== "inactive") bad();
  return { action: "update", id: body.id, expectedVersion: body.expectedVersion, name: text(body.name, 80), status: body.status, roleIds: roleIds(body.roleIds) };
}

async function currentActor(client: PoolClient, identity: TrustedIdentity, write: boolean) {
  const result = await client.query<{ id: string; public_id: string; username: string; display_name: string }>(
    "SELECT id::text, public_id::text, username, display_name FROM app_users WHERE id=$1::bigint AND public_id=$2::uuid AND active=true FOR SHARE",
    [identity.internalUserId, identity.userId]);
  if (result.rowCount !== 1) throw new HttpError(401, "authentication_required", "账号已停用");
  const permissions = await permissionsForUser(client, identity.internalUserId);
  requirePermission(permissions, "user_permissions.view");
  if (write) requirePermission(permissions, "user_permissions.manage");
  return { ...identity, username: result.rows[0].username, userName: result.rows[0].display_name, permissions };
}

// Only an explicit authenticated management command installs a missing preset.
// Existing grants are compared and never silently overwritten by startup or GET.
async function ensureRoles(client: PoolClient, ids: string[]) {
  for (const id of ids) {
    const preset = TEAM_ROLES.find(role => role.id === id)!;
    const added = await client.query("INSERT INTO app_roles(id,name,description) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id", [id, preset.name, preset.description]);
    if (added.rowCount) await client.query("INSERT INTO app_role_permissions(role_id,permission_key) SELECT $1,unnest($2::text[])", [id, preset.permissions]);
    const actual = (await client.query<{ permission_key: string }>("SELECT permission_key FROM app_role_permissions WHERE role_id=$1 ORDER BY permission_key", [id])).rows.map(row => row.permission_key);
    if (JSON.stringify(actual) !== JSON.stringify([...preset.permissions].sort())) throw new HttpError(409, "team_role_drift", "现有角色权限与预设不一致，请先审查，未覆盖原授权");
  }
}
async function getUser(client: PoolClient, publicId: string) {
  const result = await client.query<UserRow>(`SELECT ${columns} FROM app_users u WHERE public_id=$1::uuid FOR UPDATE OF u`, [publicId]);
  return result.rows[0];
}
export async function readTeamAccess(pool: Pool, identity: TrustedIdentity) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await currentActor(client, identity, false);
    const users = (await client.query<UserRow>(`SELECT ${columns} FROM app_users u ORDER BY u.username LIMIT 1001`)).rows;
    if (users.length > 1000) throw new HttpError(409, "team_directory_limit", "账号超过首批管理范围");
    const roles = (await client.query<{ id: string; name: string; description: string; permissions: string[] }>(
      "SELECT r.id,r.name,r.description,ARRAY(SELECT permission_key FROM app_role_permissions WHERE role_id=r.id ORDER BY permission_key) AS permissions FROM app_roles r ORDER BY r.id")).rows;
    await client.query("COMMIT");
    return { users: users.map(userView), roles: [...roles, ...TEAM_ROLES.filter(preset => !roles.some(role => role.id === preset.id))], assignableRoleIds: TEAM_ROLES.map(role => role.id) };
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
export async function executeTeamCommand(pool: Pool, identity: TrustedIdentity, command: TeamCommand) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('zhixu-first-team-access'))");
    const actor = await currentActor(client, identity, true);
    let before: ReturnType<typeof userView> | null = null;
    let target: UserRow;
    if (command.action === "create") {
      const existing = (await client.query<UserRow>(`SELECT ${columns} FROM app_users u WHERE lower(username)=$1 OR public_id=$2::uuid FOR UPDATE OF u`, [command.account, command.requestId])).rows;
      if (existing.length) {
        const row = existing[0];
        // Safe result lookup after an uncertain create; never resets credentials.
        if (existing.length === 1 && row.public_id === command.requestId && row.username === command.account && row.display_name === command.name && JSON.stringify(row.role_ids) === JSON.stringify(command.roleIds)) {
          await client.query("COMMIT"); return { user: userView(row), replayed: true };
        }
        throw new HttpError(409, "team_account_exists", "账号或请求标识已存在，未修改原账号");
      }
      await ensureRoles(client, command.roleIds);
      await client.query(`INSERT INTO app_users(public_id,username,password_hash,display_name,role)
        VALUES($1::uuid,$2,crypt($3,gen_salt('bf',12)),$4,'viewer')`, [command.requestId, command.account, command.password, command.name]);
      target = (await getUser(client, command.requestId))!;
      await client.query("INSERT INTO app_user_roles(user_id,role_id) SELECT $1::bigint,unnest($2::text[])", [target.id, command.roleIds]);
    } else {
      const loginTarget = (await client.query<{username:string}>("SELECT username FROM app_users WHERE public_id=$1::uuid", [command.id])).rows[0];
      if (loginTarget) await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`login:${loginTarget.username}`]);
      const row = await getUser(client, command.id);
      if (!row) throw new HttpError(404, "team_user_not_found", "账号不存在");
      target = row; before = userView(target);
      if (before.version !== command.expectedVersion) throw new HttpError(409, "team_user_conflict", "账号已更新，请刷新后重试");
      if (command.action === "reset-password") {
        await client.query("UPDATE app_users SET password_hash=crypt($2,gen_salt('bf',12)),updated_at=clock_timestamp() WHERE id=$1::bigint", [target.id, command.password]);
        await client.query("DELETE FROM login_attempts WHERE username=$1", [target.username]);
      } else {
        if (target.id === actor.internalUserId && (command.status !== "active" || JSON.stringify(command.roleIds) !== JSON.stringify(target.role_ids))) throw new HttpError(409, "team_self_lockout", "不能停用自己或修改自己的角色");
        if (target.active && target.role_ids.includes("role-server-admin") && (command.status !== "active" || !command.roleIds.includes("role-server-admin"))) {
          const others = await client.query("SELECT u.id FROM app_users u JOIN app_user_roles r ON r.user_id=u.id WHERE u.active AND r.role_id='role-server-admin' AND u.id<>$1::bigint FOR SHARE OF u", [target.id]);
          if (!others.rowCount) throw new HttpError(409, "team_last_admin", "必须保留至少一个启用的系统管理员");
        }
        await ensureRoles(client, command.roleIds);
        await client.query("UPDATE app_users SET display_name=$2,active=$3,updated_at=clock_timestamp() WHERE id=$1::bigint", [target.id, command.name, command.status === "active"]);
        await client.query("DELETE FROM app_user_roles WHERE user_id=$1::bigint", [target.id]);
        await client.query("INSERT INTO app_user_roles(user_id,role_id) SELECT $1::bigint,unnest($2::text[])", [target.id, command.roleIds]);
      }
      await client.query("UPDATE app_sessions SET revoked_at=now() WHERE user_id=$1::bigint AND revoked_at IS NULL", [target.id]);
    }
    const after = userView((await getUser(client, target.public_id))!);
    await appendOperationLog(client, actor, { module: "权限管理", entityType: "User", entityId: after.id,
      action: command.action === "create" ? "创建账号" : command.action === "update" ? "修改账号" : "重置密码",
      beforeData: before ? { values: { name: before.name, account: before.account, status: before.status, roles: before.roleIds.join(",") } } : null,
      afterData: { values: { name: after.name, account: after.account, status: after.status, roles: after.roleIds.join(",") } },
      metadata: { command: command.action } });
    await client.query("COMMIT");
    return { user: after, replayed: false };
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as {code?:string})?.code === "23505") throw new HttpError(409, "team_account_exists", "账号已存在");
    throw error;
  } finally { client.release(); }
}

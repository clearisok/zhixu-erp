import type { PoolClient } from "pg";
import type { TrustedIdentity } from "./session.js";
import { permissionsForUser, requirePermission } from "./permissions.js";
import { HttpError } from "../http/errors.js";
export async function requireServerAdministrator(client: PoolClient, identity: TrustedIdentity, write: boolean) {
 const result=await client.query<{username:string;display_name:string}>(`SELECT u.username,u.display_name FROM app_users u
 WHERE u.id=$1::bigint AND u.public_id=$2::uuid AND u.active=true
 AND EXISTS(SELECT 1 FROM app_user_roles ur JOIN app_roles r ON r.id=ur.role_id
 WHERE ur.user_id=u.id AND r.id='role-server-admin' AND r.archived_at IS NULL) FOR SHARE OF u`,[identity.internalUserId,identity.userId]);
 if(!result.rowCount)throw new HttpError(403,"administrator_required","仅服务器管理员可以管理用户与角色");
 const permissions=await permissionsForUser(client,identity.internalUserId);
 requirePermission(permissions,"user_permissions.view");
 if(write)requirePermission(permissions,"user_permissions.manage");
 return {...identity,username:result.rows[0].username,userName:result.rows[0].display_name,permissions};
}


import type { Pool, PoolClient } from "pg";
import {
  PERMISSION_DEFINITIONS,
  PERMISSION_KEYS,
  type PermissionKey,
} from "../../features/permissions/model/permissions.js";
import { HttpError } from "../http/errors.js";

const permissionKeys = new Set<string>(PERMISSION_KEYS);

export function isPermissionKey(value: string): value is PermissionKey {
  return permissionKeys.has(value);
}

export async function synchronizePermissionCatalog(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const permission of PERMISSION_DEFINITIONS) {
      await client.query(
        `INSERT INTO app_permissions(key, module, label, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (key) DO UPDATE SET
           module = EXCLUDED.module,
           label = EXCLUDED.label,
           description = EXCLUDED.description,
           updated_at = now()`,
        [permission.key, permission.module, permission.label, permission.description],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function permissionsForUser(client: Pool | PoolClient, userId: string): Promise<PermissionKey[]> {
  const result = await client.query<{ permission_key: string }>(
    `SELECT DISTINCT rp.permission_key
     FROM app_user_roles ur
     JOIN app_role_permissions rp ON rp.role_id = ur.role_id
     WHERE ur.user_id = $1::bigint
     ORDER BY rp.permission_key`,
    [userId],
  );
  return result.rows.map((row) => row.permission_key).filter(isPermissionKey);
}

export function requirePermission(
  permissions: readonly PermissionKey[],
  permission: PermissionKey,
): void {
  if (!permissions.includes(permission)) {
    throw new HttpError(403, "permission_denied", "Current user does not have permission for this operation");
  }
}

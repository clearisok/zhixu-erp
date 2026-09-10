import type { Pool } from "pg";
import { PERMISSION_KEYS } from "../../features/permissions/model/permissions.js";

export type BootstrapAdminConfig = {
  username: string;
  displayName: string;
  password?: string;
};

export async function bootstrapAdmin(pool: Pool, config: BootstrapAdminConfig): Promise<boolean> {
  if (config.password === undefined) return false;
  if (config.password.length < 12) {
    throw new Error("ZHIXU_ADMIN_PASSWORD must contain at least 12 characters");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query<{ id: string }>(
      `INSERT INTO app_users(username, password_hash, display_name, role)
       VALUES ($1, crypt($2, gen_salt('bf', 12)), $3, 'admin')
       ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username
       RETURNING id::text AS id`,
      [config.username, config.password, config.displayName],
    );
    const userId = user.rows[0].id;
    const roleId = "role-server-admin";
    await client.query(
      `INSERT INTO app_roles(id, name, description)
       VALUES ($1, '服务器管理员', '通过权限目录授予全部服务器权限')
       ON CONFLICT (id) DO UPDATE SET description = EXCLUDED.description, updated_at = now()`,
      [roleId],
    );
    for (const permission of PERMISSION_KEYS) {
      await client.query(
        `INSERT INTO app_role_permissions(role_id, permission_key)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [roleId, permission],
      );
    }
    await client.query(
      `INSERT INTO app_user_roles(user_id, role_id)
       VALUES ($1::bigint, $2) ON CONFLICT DO NOTHING`,
      [userId, roleId],
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

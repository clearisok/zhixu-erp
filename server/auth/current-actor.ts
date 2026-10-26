import type { PoolClient } from "pg";
import { permissionsForUser } from "./permissions.js";
import type { TrustedIdentity } from "./session.js";
import { HttpError } from "../http/errors.js";

/** The caller owns BEGIN. Lock in role-administration order before domain locks.
 * This refreshes identity and grants; it does not grant any domain permission. */
export async function readCurrentActor(client: PoolClient, identity: TrustedIdentity, lock = false): Promise<TrustedIdentity> {
  const row = (await client.query<{ username: string; display_name: string }>(`SELECT username,display_name FROM app_users
    WHERE id=$1::bigint AND public_id::text=$2 AND active AND archived_at IS NULL ${lock ? "FOR SHARE" : ""}`,
  [identity.internalUserId, identity.userId])).rows[0];
  if (!row) throw new HttpError(401, "authentication_required", "Authentication required");
  if (lock) {
    await client.query(`SELECT r.id FROM app_roles r JOIN app_user_roles ur ON ur.role_id=r.id
      WHERE ur.user_id=$1 ORDER BY r.id FOR SHARE OF r`, [identity.internalUserId]);
    await client.query(`SELECT ur.user_id FROM app_user_roles ur JOIN app_role_permissions rp ON rp.role_id=ur.role_id
      WHERE ur.user_id=$1 FOR SHARE OF ur,rp`, [identity.internalUserId]);
  }
  return { ...identity, username: row.username, userName: row.display_name, permissions: await permissionsForUser(client, identity.internalUserId) };
}

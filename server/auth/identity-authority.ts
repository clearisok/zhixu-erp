import type { IncomingMessage } from "node:http";
import type { Pool } from "pg";
import { PERMISSION_KEYS } from "../../features/permissions/model/permissions.js";
import { authenticate, type TrustedIdentity } from "./session.js";

export type IdentityMode = "session" | "local-single-user";

export type IdentityAuthority = {
  readonly mode: IdentityMode;
  resolve(request: IncomingMessage): Promise<TrustedIdentity | null>;
  verify(): Promise<void>;
};

// Existing row is a technical FK anchor only; it is never exposed as a login account.
const COMPATIBILITY_ACTOR_USERNAME = "admin";

export function createIdentityAuthority(pool: Pool, mode: IdentityMode): IdentityAuthority {
  if (mode === "session") {
    return { mode, resolve: (request) => authenticate(pool, request), verify: async () => undefined };
  }

  const localIdentity = async (): Promise<TrustedIdentity> => {
    const result = await pool.query<{ id: string; public_id: string }>(
      `SELECT id::text, public_id::text FROM app_users
       WHERE username = $1 AND active = true`,
      [COMPATIBILITY_ACTOR_USERNAME],
    );
    if (result.rowCount !== 1) throw new Error("local_single_user_actor_unavailable");
    return {
      internalUserId: result.rows[0].id,
      userId: result.rows[0].public_id,
      username: "local-single-user",
      userName: "本地开发用户",
      permissions: [...PERMISSION_KEYS],
    };
  };
  return { mode, resolve: localIdentity, verify: async () => { await localIdentity(); } };
}

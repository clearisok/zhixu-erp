import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Pool, PoolClient } from "pg";
import type { PermissionKey } from "../../features/permissions/model/permissions.js";
import { HttpError } from "../http/errors.js";
import { permissionsForUser } from "./permissions.js";

export const SESSION_COOKIE_NAME = "zhixu_v1_session";
const MAX_FAILED_ATTEMPTS = 10;

export type TrustedIdentity = {
  internalUserId: string;
  userId: string;
  username: string;
  userName: string;
  permissions: PermissionKey[];
};

export type SessionSecurityConfig = {
  secureCookies: boolean;
  sessionTtlSeconds: number;
};

function tokenDigest(token: string): string {
  return `v1:${createHash("sha256").update(token, "utf8").digest("hex")}`;
}

function parseCookies(request: IncomingMessage): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of (request.headers.cookie ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    result.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  return result;
}

export function sessionCookie(token: string | null, config: SessionSecurityConfig): string {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${token ?? ""}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    config.secureCookies ? "Secure" : "",
    token ? `Max-Age=${config.sessionTtlSeconds}` : "Max-Age=0",
  ].filter(Boolean);
  return attributes.join("; ");
}

async function identityForInternalUser(client: Pool | PoolClient, row: {
  id: string;
  public_id: string;
  username: string;
  display_name: string;
}): Promise<TrustedIdentity> {
  return {
    internalUserId: row.id,
    userId: row.public_id,
    username: row.username,
    userName: row.display_name,
    permissions: await permissionsForUser(client, row.id),
  };
}

export async function login(
  pool: Pool,
  usernameInput: unknown,
  passwordInput: unknown,
  config: SessionSecurityConfig,
): Promise<{ identity: TrustedIdentity; token: string }> {
  const username = typeof usernameInput === "string" ? usernameInput.trim().toLowerCase() : "";
  const password = typeof passwordInput === "string" ? passwordInput : "";
  if (!username || !password) {
    throw new HttpError(400, "credentials_required", "Username and password are required");
  }

  if(password.includes("\0")||Buffer.byteLength(password,"utf8")>72)throw new HttpError(401,"invalid_credentials","Username or password is invalid");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`login:${username}`]);
    await client.query("DELETE FROM login_attempts WHERE attempted_at < now() - interval '7 days'");
    const attempts = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM login_attempts
       WHERE username = $1 AND succeeded = false
         AND attempted_at > now() - interval '15 minutes'`,
      [username],
    );
    if (attempts.rows[0].count >= MAX_FAILED_ATTEMPTS) {
      await client.query("COMMIT");
      throw new HttpError(429, "login_rate_limited", "Too many login attempts; try again later");
    }

    const user = await client.query<{
      id: string;
      public_id: string;
      username: string;
      display_name: string;
      active: boolean;
      password_matches: boolean;
    }>(
      `SELECT id::text, public_id::text, username, display_name, active,
              password_hash = crypt($2, password_hash) AS password_matches
       FROM app_users WHERE username = $1`,
      [username, password],
    );
    const valid = user.rowCount === 1 && user.rows[0].active && user.rows[0].password_matches;
    await client.query(
      "INSERT INTO login_attempts(username, succeeded) VALUES ($1, $2)",
      [username, valid],
    );
    if (!valid) {
      await client.query("COMMIT");
      throw new HttpError(401, "invalid_credentials", "Username or password is invalid");
    }

    await client.query("DELETE FROM login_attempts WHERE username = $1 AND succeeded = false", [username]);
    const token = randomBytes(32).toString("base64url");
    await client.query(
      `INSERT INTO app_sessions(token, user_id, expires_at, session_kind, last_seen_at)
       VALUES ($1, $2::bigint, now() + ($3 * interval '1 second'), 'v1', now())`,
      [tokenDigest(token), user.rows[0].id, config.sessionTtlSeconds],
    );
    await client.query("UPDATE app_users SET last_login_at=clock_timestamp() WHERE id=$1::bigint",[user.rows[0].id]);
    const identity = await identityForInternalUser(client, user.rows[0]);
    await client.query("COMMIT");
    return { identity, token };
  } catch (error) {
    if (!(error instanceof HttpError && (error.status === 401 || error.status === 429))) {
      await client.query("ROLLBACK");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function authenticate(pool: Pool, request: IncomingMessage): Promise<TrustedIdentity | null> {
  const token = parseCookies(request).get(SESSION_COOKIE_NAME);
  if (!token || token.length > 256) return null;
  const result = await pool.query<{
    id: string;
    public_id: string;
    username: string;
    display_name: string;
  }>(
    `UPDATE app_sessions s SET last_seen_at = now()
     FROM app_users u
     WHERE s.token = $1 AND s.session_kind = 'v1' AND s.revoked_at IS NULL
       AND s.expires_at > now() AND u.id = s.user_id AND u.active = true
     RETURNING u.id::text, u.public_id::text, u.username, u.display_name`,
    [tokenDigest(token)],
  );
  if (result.rowCount !== 1) return null;
  return identityForInternalUser(pool, result.rows[0]);
}

export async function revokeSession(pool: Pool, request: IncomingMessage): Promise<void> {
  const token = parseCookies(request).get(SESSION_COOKIE_NAME);
  if (!token) return;
  await pool.query(
    `UPDATE app_sessions SET revoked_at = now()
     WHERE token = $1 AND session_kind = 'v1' AND revoked_at IS NULL`,
    [tokenDigest(token)],
  );
}

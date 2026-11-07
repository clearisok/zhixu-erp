import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import type { PermissionKey } from "../../features/permissions/model/permissions.js";
import { readCurrentActor } from "./current-actor.js";
import {
  authenticate, issueSession, revokeSession, sessionCookie, SESSION_COOKIE_NAME,
  type SessionSecurityConfig, type TrustedIdentity,
} from "./session.js";

export type LocalDemoConfig = { enabled: true; username: string; userId: string };

// A ceiling, never a grant. Effective permissions still come from the existing role.
const previewPermissions = new Set<PermissionKey>([
  "order.view", "ainuoke.view", "style_progress.read", "style_progress.view_history",
  "commercial.sale.view", "commercial.labor.view", "quote.cost.view",
]);
const demoTokenPrefix = "local-demo.";
const loopback = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const forwardedHeaders = ["forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip", "cf-connecting-ip"];

function sessionToken(request: IncomingMessage): string | undefined {
  return (request.headers.cookie ?? "").split(";").map(value => value.trim())
    .filter(value => value.startsWith(SESSION_COOKIE_NAME + "=")).at(-1)?.slice(SESSION_COOKIE_NAME.length + 1);
}

function replaceSessionToken(request: IncomingMessage, token?: string): void {
  const cookies = (request.headers.cookie ?? "").split(";").map(value => value.trim())
    .filter(value => value && !value.startsWith(SESSION_COOKIE_NAME + "="));
  if (token) cookies.push(SESSION_COOKIE_NAME + "=" + token);
  request.headers.cookie = cookies.join("; ");
}

function assertReadOnly(identity: TrustedIdentity, config: LocalDemoConfig): void {
  if (identity.userId !== config.userId || identity.username !== config.username
    || !identity.permissions.includes("order.view") || !identity.permissions.includes("style_progress.read")
    || identity.permissions.some(permission => !previewPermissions.has(permission))) {
    throw new Error("local_demo_identity_unavailable");
  }
}

/** Installed only by the explicit loopback demo runtime, never by createApp/server:start. */
export function createLocalDemoEntry(options: {
  pool: Pool;
  baseUrl: string;
  security: SessionSecurityConfig;
  readConfig(): Promise<unknown>;
}): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  const base = new URL(options.baseUrl);
  if (base.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(base.hostname)
    || base.pathname !== "/" || base.search || base.hash || base.username || base.password || options.security.secureCookies) {
    throw new Error("local_demo_loopback_required");
  }
  return async (request, response) => {
    const raw = await options.readConfig();
    let config: LocalDemoConfig | null = null;
    if (raw && typeof raw === "object" && "enabled" in raw && raw.enabled === true) {
      if (!("username" in raw) || typeof raw.username !== "string" || !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(raw.username)
        || !("userId" in raw) || typeof raw.userId !== "string" || !/^[a-f0-9-]{36}$/i.test(raw.userId)) {
        throw new Error("local_demo_identity_unavailable");
      }
      config = { enabled: true, username: raw.username, userId: raw.userId };
    }
    const boundary = loopback.has(request.socket.remoteAddress ?? "")
      && loopback.has(request.socket.localAddress ?? "") && request.headers.host === base.host
      && !forwardedHeaders.some(name => request.headers[name] !== undefined)
      && (!request.headers.origin || request.headers.origin === base.origin);
    const demoSession = sessionToken(request)?.startsWith(demoTokenPrefix) ?? false;
    if (demoSession && (!config || !boundary)) {
      // Turning the mode off also retires its sessions; ordinary logins are untouched.
      if (!config) await revokeSession(options.pool, request);
      replaceSessionToken(request);
      response.setHeader("Set-Cookie", sessionCookie(null, options.security));
    }
    if (!config || !boundary) return;

    const path = new URL(request.url ?? "/", base).pathname;
    const document = !path.startsWith("/api/") && !path.startsWith("/assets/") && !/\.[^/]+$/.test(path)
      && (request.headers["sec-fetch-dest"] === "document" || request.headers.accept?.includes("text/html"));
    const restore = path === "/api/v1/auth/me" && request.headers["sec-fetch-site"] !== "cross-site";
    if (!demoSession && (request.method !== "GET" || (!document && !restore))) return;

    const existing = await authenticate(options.pool, request);
    if (existing) {
      if (demoSession) assertReadOnly(existing, config);
      return; // Preserve every valid ordinary login, including its original identity.
    }
    if (request.method !== "GET" || (!document && !restore)) return;

    const client = await options.pool.connect();
    try {
      await client.query("BEGIN");
      const user = (await client.query<{ id: string; public_id: string; username: string; display_name: string }>(
        `SELECT id::text, public_id::text, username, display_name FROM app_users
         WHERE public_id=$1::uuid AND username=$2 AND active AND archived_at IS NULL FOR SHARE`,
        [config.userId, config.username],
      )).rows[0];
      if (!user) throw new Error("local_demo_identity_unavailable");
      const identity = await readCurrentActor(client, {
        internalUserId: user.id, userId: user.public_id, username: user.username,
        userName: user.display_name, permissions: [],
      }, true);
      assertReadOnly(identity, config);
      const token = await issueSession(client, user.id, options.security, demoTokenPrefix + randomBytes(32).toString("base64url"));
      await client.query("COMMIT");
      replaceSessionToken(request, token);
      response.setHeader("Set-Cookie", sessionCookie(token, options.security));
      response.setHeader("Cache-Control", "no-store");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  };
}

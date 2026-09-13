import assert from "node:assert/strict";
import test from "node:test";
import type { PermissionKey } from "../../permissions/model/permissions";
import { ServerAuthError, type ServerAuthClient, type ServerSessionUser } from "../server-auth-client";
import { serverSessionHasPermission } from "../server-session-model";
import {
  loginServerSession,
  logoutServerSession,
  restoreServerSession,
} from "../server-session-service";

const user: ServerSessionUser = { id: "server-user-1", username: "admin", name: "Server Admin" };

function fakeClient(overrides: Partial<ServerAuthClient> = {}): ServerAuthClient {
  return {
    login: async () => ({ user, permissions: ["order.view"] }),
    logout: async () => undefined,
    getMe: async () => user,
    getPermissions: async () => ["order.view"],
    ...overrides,
  };
}

test("session restore maps missing cookie to anonymous without treating 401 as an error", async () => {
  const state = await restoreServerSession(fakeClient({
    getMe: async () => { throw new ServerAuthError(401, "authentication_required"); },
  }));
  assert.equal(state.status, "anonymous");
  assert.equal(state.user, null);
});

test("session restore returns trusted identity and permissions", async () => {
  const state = await restoreServerSession(fakeClient());
  assert.equal(state.status, "authenticated");
  assert.equal(state.user?.username, "admin");
  assert.equal(serverSessionHasPermission(state, "order.view"), true);
  assert.equal(serverSessionHasPermission(state, "quote.edit"), false);
});

test("login refreshes identity and permissions from the server session", async () => {
  const calls: string[] = [];
  const state = await loginServerSession(fakeClient({
    login: async () => { calls.push("login"); return { user, permissions: [] }; },
    getMe: async () => { calls.push("me"); return user; },
    getPermissions: async () => { calls.push("permissions"); return ["order.view"] as PermissionKey[]; },
  }), "admin", "disposable-password");
  assert.deepEqual(calls, ["login", "me", "permissions"]);
  assert.equal(state.status, "authenticated");
  assert.equal(serverSessionHasPermission(state, "order.view"), true);
});

test("invalid credentials and rate limits remain typed and are never retried", async () => {
  for (const [status, code] of [[401, "invalid_credentials"], [429, "login_rate_limited"]] as const) {
    let attempts = 0;
    await assert.rejects(
      () => loginServerSession(fakeClient({
        login: async () => { attempts += 1; throw new ServerAuthError(status, code); },
      }), "admin", "wrong"),
      (error: unknown) => error instanceof ServerAuthError && error.status === status && error.code === code,
    );
    assert.equal(attempts, 1);
  }
});

test("logout returns anonymous even when the server already considers the session absent", async () => {
  const state = await logoutServerSession(fakeClient({
    logout: async () => { throw new ServerAuthError(401, "authentication_required"); },
  }));
  assert.equal(state.status, "anonymous");
});

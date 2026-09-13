import assert from "node:assert/strict";
import test from "node:test";
import { createServerAuthClient, ServerAuthError } from "../server-auth-client";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("server auth client uses same-origin credentialed no-store requests without cookie access", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/auth/login")) {
      return jsonResponse({
        user: { id: "server-user-1", username: "admin", name: "Server Admin" },
        permissions: ["order.view"],
      });
    }
    if (url.endsWith("/auth/logout")) return jsonResponse({ ok: true });
    if (url.endsWith("/auth/me")) {
      return jsonResponse({ user: { id: "server-user-1", username: "admin", name: "Server Admin" } });
    }
    return jsonResponse({ permissions: ["order.view", "quote.view", "not-a-permission"] });
  };
  const client = createServerAuthClient({ fetchImpl });

  const login = await client.login("admin", "disposable-password");
  assert.equal(login.user.username, "admin");
  assert.deepEqual(login.permissions, ["order.view"]);
  assert.equal((await client.getMe()).id, "server-user-1");
  assert.deepEqual(await client.getPermissions(), ["order.view", "quote.view"]);
  await client.logout();

  assert.equal(calls.length, 4);
  for (const call of calls) {
    assert.equal(call.url.startsWith("/api/v1/auth/"), true);
    assert.equal(call.init?.credentials, "include");
    assert.equal(call.init?.cache, "no-store");
    assert.equal(new Headers(call.init?.headers).has("Cookie"), false);
    assert.equal(call.url.includes("disposable-password"), false);
  }
  for (const call of [calls[0], calls[3]]) {
    assert.equal(call.init?.method, "POST");
    assert.equal(new Headers(call.init?.headers).get("X-Zhixu-Request"), "1");
  }
});

test("server auth client exposes safe 401, 429, unknown, and network failures", async () => {
  const invalid = createServerAuthClient({
    fetchImpl: async () => jsonResponse({ error: { code: "invalid_credentials", message: "ignored" } }, 401),
  });
  await assert.rejects(
    () => invalid.login("admin", "wrong"),
    (error: unknown) => error instanceof ServerAuthError
      && error.status === 401
      && error.code === "invalid_credentials"
      && error.message === "Server 账号或密码不正确。",
  );

  const limited = createServerAuthClient({
    fetchImpl: async () => jsonResponse({ error: { code: "login_rate_limited" } }, 429),
  });
  await assert.rejects(
    () => limited.login("admin", "wrong"),
    (error: unknown) => error instanceof ServerAuthError && error.status === 429 && error.code === "login_rate_limited",
  );

  const unknown = createServerAuthClient({
    fetchImpl: async () => jsonResponse({ error: { code: "unsafe_internal_detail", message: "secret" } }, 500),
  });
  await assert.rejects(
    () => unknown.getMe(),
    (error: unknown) => error instanceof ServerAuthError
      && error.code === "internal_error"
      && !error.message.includes("secret"),
  );

  const unavailable = createServerAuthClient({ fetchImpl: async () => { throw new TypeError("network detail"); } });
  await assert.rejects(
    () => unavailable.getMe(),
    (error: unknown) => error instanceof ServerAuthError
      && error.status === 0
      && error.code === "database_unavailable"
      && !error.message.includes("network detail"),
  );
});

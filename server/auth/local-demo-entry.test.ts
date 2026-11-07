import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import test from "node:test";
import type { Pool } from "pg";
import { createLocalDemoEntry } from "./local-demo-entry.js";

test("demo entry is opt-in and refuses public, proxied, cross-origin or non-entry requests before querying users", async () => {
  let queries = 0;
  const pool = { query: () => { queries++; throw Error("unexpected_database_access"); }, connect: () => { queries++; throw Error("unexpected_database_access"); } } as unknown as Pool;
  let config: unknown;
  const apply = createLocalDemoEntry({ pool, baseUrl: "http://127.0.0.1:63051", security: { secureCookies: false, sessionTtlSeconds: 3600 }, readConfig: async () => config });
  const request = (headers: Record<string, string> = {}, peer = "127.0.0.1", local = "127.0.0.1", url = "/order-center", method = "GET") => {
    const socket = new Socket();
    Object.defineProperties(socket, { remoteAddress: { value: peer }, localAddress: { value: local } });
    const req = new IncomingMessage(socket);
    req.headers = { host: "127.0.0.1:63051", accept: "text/html", ...headers }; req.method = method; req.url = url;
    return req;
  };
  for (config of [undefined, null, {}, { enabled: false }, { enabled: "true" }]) {
    const req = request(); await apply(req, new ServerResponse(req));
  }
  config = { enabled: true, username: "preview.real-orders", userId: "50f290ff-552c-428e-bb57-95649b9c9602" };
  const refused = [
    request({}, "192.0.2.1"), request({}, "127.0.0.1", "0.0.0.0"),
    request({ host: "staging.weaveops.top" }), request({ host: "other.invalid:63051" }),
    request({ "x-forwarded-for": "127.0.0.1" }), request({ forwarded: "for=127.0.0.1" }),
    request({ "cf-connecting-ip": "127.0.0.1" }), request({ origin: "https://staging.weaveops.top" }),
    request({}, undefined, undefined, "/assets/client.js"), request({}, undefined, undefined, "/api/v1/sales-orders"),
    request({}, undefined, undefined, "/order-center", "POST"),
    request({ "sec-fetch-site": "cross-site" }, undefined, undefined, "/api/v1/auth/me"),
  ];
  for (const req of refused) { const res = new ServerResponse(req); await apply(req, res); assert.equal(res.getHeader("Set-Cookie"), undefined); }
  assert.equal(queries, 0);
  for (const baseUrl of ["https://staging.weaveops.top", "http://0.0.0.0:63051", "http://127.0.0.1:63051/path", "http://user@127.0.0.1:63051"]) {
    assert.throws(() => createLocalDemoEntry({ pool, baseUrl, security: { secureCookies: false, sessionTtlSeconds: 3600 }, readConfig: async () => config }), /local_demo_loopback_required/);
  }
});

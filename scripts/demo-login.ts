/** Loopback-only, synthetic and disposable. Never reads a configured DATABASE_URL. */
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { bootstrapAdmin } from "../server/auth/bootstrap.js";
import { startCommercialSecurityFixture } from "../server/integration/commercial-security-fixture.js";

const build = JSON.parse(readFileSync("dist/client/build-info.json", "utf8"));
if (build.quoteAuthority !== "server" || build.identityMode !== "session") throw new Error("Build explicit Server session UI first");
const fixture = await startCommercialSecurityFixture(resolve("dist/client"));
let stopped = false;
async function stop() { if (stopped) return; stopped = true; await fixture.close(); }
try {
  await bootstrapAdmin(fixture.pool, { username: "demo.admin", displayName: "演示管理员", password: "Synthetic-Demo-2026" });
  process.stdout.write(JSON.stringify({ url: fixture.base + "/login", username: "demo.admin", password: "Synthetic-Demo-2026", syntheticOnly: true, expiresInMinutes: 120, build }) + "\n");
  const timer = setTimeout(() => { void stop(); }, 120 * 60_000);
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { clearTimeout(timer); void stop(); });
} catch (error) { await stop(); throw error; }

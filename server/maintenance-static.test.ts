import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assertRuntimeBuildIdentity } from "./build-identity.js";
import { assertMaintenanceEnvironment, createMaintenanceStaticApp } from "./maintenance-static-app.js";

const identity = {
  gitCommit: "a".repeat(40), buildId: "synthetic-frozen", buildTime: "2026-09-29T00:00:00Z",
  masterSettingsAuthority: "frozen" as const, identityMode: "session" as const, quoteWriterMode: "writable" as const,
};
const environment = {
  ZHIXU_GIT_COMMIT: identity.gitCommit,
  ZHIXU_BUILD_ID: identity.buildId,
  ZHIXU_BUILD_TIME: identity.buildTime,
  NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY: "frozen",
  ZHIXU_IDENTITY_MODE: "session",
};

test("compiled authority must match runtime identity", async () => {
  const directory = await mkdtemp(join(tmpdir(), "q3-static-unit-"));
  try {
    await writeFile(join(directory, "build-info.json"), JSON.stringify(identity));
    assert.deepEqual(await assertRuntimeBuildIdentity(directory, "frozen", environment), identity);
    await assert.rejects(assertRuntimeBuildIdentity(directory, "frozen", { ...environment, NEXT_PUBLIC_ZHIXU_QUOTE_WRITER_MODE: "frozen" }), /runtime_compiled_build_identity_mismatch/u);
    await assert.rejects(assertRuntimeBuildIdentity(directory, "frozen", { ...environment, NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY: "server" }), /runtime_compiled_build_identity_mismatch/u);
    await assert.rejects(assertRuntimeBuildIdentity(directory, "frozen", { ...environment, ZHIXU_IDENTITY_MODE: "local-single-user" }), /runtime_compiled_build_identity_mismatch/u);
    await assert.rejects(assertRuntimeBuildIdentity(directory, "server", environment), /unexpected_compiled_authority/u);
    await writeFile(join(directory, "build-info.json"), JSON.stringify({ ...identity, identityMode: "local-single-user" }));
    assert.deepEqual(await assertRuntimeBuildIdentity(directory, "frozen", { ...environment, ZHIXU_IDENTITY_MODE: "local-single-user" }), { ...identity, identityMode: "local-single-user" });
    await writeFile(join(directory, "build-info.json"), JSON.stringify({ ...identity, masterSettingsAuthority: "invalid" }));
    await assert.rejects(assertRuntimeBuildIdentity(directory, "frozen", environment), /compiled_build_identity_invalid/u);
  } finally { await rm(directory, { recursive: true }); }
});

test("maintenance static serves only files and static health, never an API fallback", async () => {
  const directory = await mkdtemp(join(tmpdir(), "q3-static-unit-"));
  await writeFile(join(directory, "index.html"), "synthetic static only");
  await writeFile(join(directory, "build-info.json"), JSON.stringify(identity));
  const server = createServer(createMaintenanceStaticApp(directory));
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test_port_unavailable");
    const origin = `http://127.0.0.1:${address.port}`;
    const health = await fetch(`${origin}/maintenance-health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "static_alive", database: "not_connected" });
    const build = await fetch(`${origin}/build-info.json`);
    assert.equal(build.status, 200);
    assert.deepEqual(await build.json(), identity);
    assert.match(await (await fetch(`${origin}/`)).text(), /synthetic static only/u);
    for (const method of ["GET", "POST"] as const) {
      const api = await fetch(`${origin}/api/v1/quote-masters/brands`, { method });
      assert.equal(api.status, 503);
      assert.deepEqual(await api.json(), { code: "api_unavailable_during_maintenance" });
    }
    assert.equal((await fetch(`${origin}/missing-route`)).status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true });
  }
});

test("maintenance mode rejects DB, PostgreSQL and admin secrets", () => {
  assert.doesNotThrow(() => assertMaintenanceEnvironment({ NODE_ENV: "production" }));
  for (const name of ["DATABASE_URL", "DB_HOST", "DB_PASSWORD", "POSTGRES_PASSWORD", "PGPASSWORD", "ZHIXU_ADMIN_PASSWORD"]) {
    assert.throws(() => assertMaintenanceEnvironment({ [name]: "synthetic" }), /maintenance_database_environment_forbidden/u);
  }
});

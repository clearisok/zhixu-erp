import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const image = "zhixu-server:q3b2h-ready-f0c252b52b6a";
const revision = "f0c252b52b6a626037e8ba70cf51d0e976e45447";
const migrationNames = [
  "0001_trusted_auth_rbac_operation_logs.sql",
  "0002_sales_order_foundation.sql",
  "0003_sales_order_number_sequence.sql",
  "0004_confirmed_commercial_terms.sql",
  "0005_quote_foundation.sql",
  "0006_quote_number_sequence.sql",
  "0007_quote_master_settings.sql",
];

function run(args, options = {}) {
  return spawnSync("docker", args, {
    cwd: root, encoding: "utf8", timeout: 120_000, windowsHide: true, ...options,
  });
}

function docker(args, options = {}) {
  const result = run(args, options);
  assert.equal(result.status, 0, `disposable Docker step failed: ${args[0]} ${args[1] ?? ""}`);
  return result.stdout.trim();
}

function sql(name, query) {
  return docker(["exec", name, "psql", "-X", "-w", "-U", "drill", "-d", "drill", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", query]);
}

async function until(check, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  assert.fail(`${label} did not reach expected disposable state`);
}

function createDatabase(name, password) {
  docker([
    "run", "-d", "--pull=never", "--name", name, "--network", "none",
    "--tmpfs", "/var/lib/postgresql/data:rw,size=256m",
    "--label", "io.zhixu.disposable-test=q3b2h-node-readiness",
    "-e", "POSTGRES_USER=drill", "-e", "POSTGRES_DB=drill",
    "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:16-alpine",
  ]);
  const metadata = JSON.parse(docker(["inspect", name]))[0];
  assert.equal(metadata.HostConfig.NetworkMode, "none");
  assert.deepEqual(metadata.HostConfig.PortBindings, {});
  assert.deepEqual(metadata.Mounts, []);
  assert.equal(metadata.Config.Labels["io.zhixu.disposable-test"], "q3b2h-node-readiness");
}

function databaseEnvironment(password) {
  return [
    "-e", "NODE_ENV=production",
    "-e", "DB_HOST=127.0.0.1", "-e", "DB_PORT=5432",
    "-e", "DB_NAME=drill", "-e", "DB_USER=drill", "-e", `DB_PASSWORD=${password}`,
    "-e", "ZHIXU_ALLOWED_ORIGINS=https://example.invalid",
    "-e", "ZHIXU_SERVER_HOST=127.0.0.1", "-e", "ZHIXU_SERVER_PORT=3000",
  ];
}

function startServer(name, database, password) {
  docker([
    "run", "-d", "--pull=never", "--name", name,
    "--network", `container:${database}`,
    "--label", "io.zhixu.disposable-test=q3b2h-node-readiness",
    ...databaseEnvironment(password),
    "-e", "ZHIXU_ADMIN_USERNAME=readiness-admin",
    "-e", `ZHIXU_ADMIN_PASSWORD=${password}`,
    image,
  ]);
}

function cleanUp(name) {
  const result = run(["inspect", name]);
  if (result.status !== 0) return;
  const metadata = JSON.parse(result.stdout)[0];
  assert.equal(metadata.Name, `/${name}`);
  assert.ok(name.startsWith("q3b2h-readiness-"));
  assert.equal(metadata.Config.Labels["io.zhixu.disposable-test"], "q3b2h-node-readiness");
  assert.deepEqual(metadata.HostConfig.PortBindings, {});
  assert.ok(metadata.Mounts.every((mount) => !/preparesystem_zhixu_data|zhixu-ainuoke-api_zhixu_data/.test(mount.Name ?? "")));
  docker(["rm", "-fv", name]);
}

test("current-main image starts on complete ledger and fails closed on pending ledger", { timeout: 360_000 }, async () => {
  const nonce = randomUUID().replaceAll("-", "").slice(0, 12);
  const completeDb = `q3b2h-readiness-complete-db-${nonce}`;
  const completeServer = `q3b2h-readiness-complete-server-${nonce}`;
  const pendingDb = `q3b2h-readiness-pending-db-${nonce}`;
  const pendingServer = `q3b2h-readiness-pending-server-${nonce}`;
  const password = `DisposableOnly-${randomUUID()}`;
  const created = [];

  try {
    const imageMetadata = JSON.parse(docker(["image", "inspect", image]))[0];
    assert.equal(imageMetadata.Config.Labels["org.opencontainers.image.revision"], revision);
    const imageFiles = docker(["run", "--rm", "--pull=never", "--network", "none", "--entrypoint", "sh", image,
      "-c", "for f in /app/database/migrations/000*.sql; do sha256sum \"$f\"; done"]);
    const actualFiles = imageFiles.split("\n").map((line) => line.trim().split(/\s+/));
    assert.equal(actualFiles.length, migrationNames.length);
    for (const [index, filename] of migrationNames.entries()) {
      assert.equal(actualFiles[index][1], `/app/database/migrations/${filename}`);
      assert.equal(actualFiles[index][0], createHash("sha256").update(readFileSync(join(root, "database/migrations", filename))).digest("hex"));
    }

    createDatabase(completeDb, password);
    created.push(completeDb);
    await until(() => run(["exec", completeDb, "pg_isready", "-U", "drill", "-d", "drill"]).status === 0, "complete PostgreSQL");
    const migrationRun = docker(["run", "--rm", "--pull=never", "--network", `container:${completeDb}`,
      ...databaseEnvironment(password), image, "node", "dist/server/server/db/migrate.js"]);
    const applied = JSON.parse(migrationRun.trim().split("\n").at(-1));
    assert.equal(applied.event, "migrations_complete");
    assert.deepEqual(applied.applied, migrationNames);
    const ledger = sql(completeDb, "SELECT filename || '|' || checksum FROM schema_migrations ORDER BY version;").split("\n");
    assert.deepEqual(ledger, migrationNames.map((filename) => `${filename}|${createHash("sha256").update(readFileSync(join(root, "database/migrations", filename))).digest("hex")}`));

    startServer(completeServer, completeDb, password);
    created.push(completeServer);
    await until(() => run(["exec", completeServer, "wget", "-qO-", "http://127.0.0.1:3000/api/v1/health"]).status === 0, "complete Server health");
    const health = JSON.parse(docker(["exec", completeServer, "wget", "-qO-", "http://127.0.0.1:3000/api/v1/health"]));
    assert.equal(health.status, "ok");
    assert.match(docker(["logs", completeServer]), /"event":"server_listening"/);
    assert.ok(Number(sql(completeDb, "SELECT count(*) FROM app_permissions;")) > 0);
    assert.equal(sql(completeDb, "SELECT count(*) FROM app_users WHERE username = 'readiness-admin';"), "1");
    assert.equal(sql(completeDb, "SELECT count(*) FROM app_user_roles WHERE user_id = (SELECT id FROM app_users WHERE username = 'readiness-admin');"), "1");
    console.log(`complete_ledger=${ledger.length}; server_health=${health.status}; permission_sync=pass; admin_bootstrap=pass`);

    createDatabase(pendingDb, password);
    created.push(pendingDb);
    await until(() => run(["exec", pendingDb, "pg_isready", "-U", "drill", "-d", "drill"]).status === 0, "pending PostgreSQL");
    sql(pendingDb, "CREATE TABLE schema_migrations(version BIGINT PRIMARY KEY, filename TEXT NOT NULL UNIQUE, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now(), duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0));");
    for (const [index, filename] of migrationNames.slice(0, 3).entries()) {
      const content = readFileSync(join(root, "database/migrations", filename), "utf8");
      docker(["exec", "-i", pendingDb, "psql", "-X", "-w", "-U", "drill", "-d", "drill", "-v", "ON_ERROR_STOP=1", "-q"], { input: content });
      const checksum = createHash("sha256").update(content).digest("hex");
      sql(pendingDb, `INSERT INTO schema_migrations(version,filename,checksum,duration_ms) VALUES (${index + 1},'${filename}','${checksum}',0);`);
    }
    startServer(pendingServer, pendingDb, password);
    created.push(pendingServer);
    await until(() => docker(["inspect", "--format", "{{.State.Status}}", pendingServer]) === "exited", "pending Server exit");
    assert.equal(docker(["inspect", "--format", "{{.State.ExitCode}}", pendingServer]), "1");
    const failureLogResult = run(["logs", pendingServer]);
    assert.equal(failureLogResult.status, 0);
    const failureLogs = failureLogResult.stdout + failureLogResult.stderr;
    assert.match(failureLogs, /"code":"pending_migrations"/);
    assert.doesNotMatch(failureLogs, /"event":"server_listening"/);
    assert.equal(sql(pendingDb, "SELECT count(*) FROM app_permissions;"), "0");
    assert.equal(sql(pendingDb, "SELECT count(*) FROM app_users WHERE username = 'readiness-admin';"), "0");
    assert.equal(sql(pendingDb, "SELECT count(*) FROM schema_migrations;"), "3");
    console.log("pending_ledger=0001-0003; startup=pending_migrations; permission_sync=not_run; admin_bootstrap=not_run; listen=not_run");
  } finally {
    for (const name of created.reverse()) cleanUp(name);
  }
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const backups = resolve(root, "backups");
const reviewedCommit = "f0c252b52b6a626037e8ba70cf51d0e976e45447";
const marker = "DISPOSABLE_MIGRATION_TEST_SECRET";

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root, encoding: "utf8", timeout: 360_000, windowsHide: true, ...options,
  });
}

function docker(args, options = {}) {
  const result = run("docker", args, options);
  assert.equal(result.status, 0, `disposable Docker step failed: ${args[0]} ${args[1] ?? ""}`);
  return result.stdout.trim();
}

function script(name, args) {
  return run("pwsh", ["-NoProfile", "-NonInteractive", "-File", join(root, name), ...args]);
}

function hash(value) { return createHash("sha256").update(value).digest("hex"); }

async function ready(name) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (run("docker", ["exec", name, "pg_isready", "-U", "drill", "-d", "drill"]).status === 0) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.fail("disposable PostgreSQL did not become ready");
}

test("guarded current-source migration only reaches an exact disposable target", { timeout: 480_000 }, async () => {
  const nonce = randomUUID().replaceAll("-", "").slice(0, 12);
  const project = `q3b2h${nonce}`;
  const container = `q3b2h-db-${nonce}`;
  const writer = `q3b2h-writer-${nonce}`;
  const created = [];
  let backupPath;
  const fingerprint = hash(`${project}|${container}|tmpfs|drill|local_socket|5432`);
  const targetArgs = [
    "-ExpectedContainerName", container,
    "-ExpectedComposeProject", project,
    "-ExpectedVolumeName", "tmpfs",
    "-ExpectedDatabaseName", "drill",
    "-ExpectedTargetFingerprint", fingerprint,
  ];
  const migrationArgs = [...targetArgs, "-ExpectedMigrationSourceCommit", reviewedCommit];

  try {
    docker([
      "run", "-d", "--pull=never", "--name", container, "--network", "none",
      "--tmpfs", "/var/lib/postgresql/data:rw,size=192m",
      "--label", `com.docker.compose.project=${project}`,
      "--label", "com.docker.compose.service=database",
      "-e", "POSTGRES_USER=drill", "-e", "POSTGRES_DB=drill",
      "-e", `POSTGRES_PASSWORD=${marker}`, "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
      "postgres:16-alpine",
    ]);
    created.push(container);
    const metadata = JSON.parse(docker(["inspect", container]))[0];
    assert.equal(metadata.HostConfig.NetworkMode, "none");
    assert.deepEqual(metadata.HostConfig.PortBindings, {});
    assert.deepEqual(metadata.Mounts, []);
    await ready(container);

    docker(["exec", container, "psql", "-X", "-w", "-U", "drill", "-d", "drill", "-v", "ON_ERROR_STOP=1", "-q", "-c",
      "CREATE TABLE schema_migrations(version BIGINT PRIMARY KEY, filename TEXT NOT NULL UNIQUE, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now(), duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0));"]);
    for (const version of ["0001", "0002", "0003"]) {
      const filename = {
        "0001": "0001_trusted_auth_rbac_operation_logs.sql",
        "0002": "0002_sales_order_foundation.sql",
        "0003": "0003_sales_order_number_sequence.sql",
      }[version];
      const sql = readFileSync(join(root, "database/migrations", filename), "utf8");
      docker(["exec", "-i", container, "psql", "-X", "-w", "-U", "drill", "-d", "drill", "-v", "ON_ERROR_STOP=1", "-q"], { input: sql });
      docker(["exec", container, "psql", "-X", "-w", "-U", "drill", "-d", "drill", "-v", "ON_ERROR_STOP=1", "-q", "-c",
        `INSERT INTO schema_migrations(version,filename,checksum,duration_ms) VALUES (${Number(version)},'${filename}','${hash(sql)}',0);`]);
    }

    const wrong = [...migrationArgs];
    wrong[wrong.indexOf("-ExpectedTargetFingerprint") + 1] = "0".repeat(64);
    const rejected = script("scripts/Invoke-ZhixuGuardedMigration.ps1", [...wrong, "-VerifyOnly"]);
    assert.notEqual(rejected.status, 0);
    assert.doesNotMatch(rejected.stdout + rejected.stderr, new RegExp(marker));

    const verified = script("scripts/Invoke-ZhixuGuardedMigration.ps1", [...migrationArgs, "-VerifyOnly"]);
    assert.equal(verified.status, 0, verified.stderr);
    assert.match(verified.stdout, /migration_target_verified/);
    assert.doesNotMatch(verified.stdout + verified.stderr, new RegExp(marker));

    const backup = script("Backup-Zhixu.ps1", targetArgs);
    assert.equal(backup.status, 0, backup.stderr);
    const filename = /filename=(zhixu-[A-Za-z0-9-]+\.dump)/.exec(backup.stdout)?.[1];
    assert.ok(filename);
    backupPath = resolve(backups, filename);
    assert.ok(backupPath.startsWith(backups + sep) && existsSync(backupPath));
    const backupHash = hash(readFileSync(backupPath));
    assert.notEqual(script("scripts/Invoke-ZhixuGuardedMigration.ps1", [
      ...migrationArgs, "-Execute", "-RollbackBackupFile", backupPath,
      "-ExpectedRollbackBackupSha256", "0".repeat(64),
    ]).status, 0);

    docker([
      "run", "-d", "--pull=never", "--name", writer, "--network", "none",
      "--label", `com.docker.compose.project=${project}`,
      "--label", "com.docker.compose.service=zhixu",
      "--entrypoint", "sh", "postgres:16-alpine", "-c", "sleep 120",
    ]);
    created.push(writer);
    const blocked = script("scripts/Invoke-ZhixuGuardedMigration.ps1", [
      ...migrationArgs, "-Execute", "-RollbackBackupFile", backupPath,
      "-ExpectedRollbackBackupSha256", backupHash,
    ]);
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /application_writer_not_frozen/);
    docker(["rm", "-fv", writer]);
    created.splice(created.indexOf(writer), 1);

    const executed = script("scripts/Invoke-ZhixuGuardedMigration.ps1", [
      ...migrationArgs, "-Execute", "-RollbackBackupFile", backupPath,
      "-ExpectedRollbackBackupSha256", backupHash,
    ]);
    assert.equal(executed.status, 0, executed.stderr);
    assert.match(executed.stdout, /guarded_migration_complete/);
    assert.doesNotMatch(executed.stdout + executed.stderr, new RegExp(marker));
    assert.equal(docker(["exec", container, "psql", "-X", "-w", "-U", "drill", "-d", "drill", "-A", "-t", "-c",
      "SELECT string_agg(version::text,',' ORDER BY version) FROM schema_migrations;"]), "1,2,3,4,5,6,7");
    assert.equal(docker(["exec", container, "psql", "-X", "-w", "-U", "drill", "-d", "drill", "-A", "-t", "-c",
      "SELECT count(*) FROM quote_master_brands;"]), "0");
  } finally {
    for (const name of created.reverse()) {
      const inspection = run("docker", ["inspect", name]);
      if (inspection.status !== 0) continue;
      const metadata = JSON.parse(inspection.stdout)[0];
      assert.equal(metadata.Name, `/${name}`);
      assert.equal(metadata.HostConfig.NetworkMode, "none");
      assert.ok(metadata.Mounts.every((mount) => !/preparesystem_zhixu_data|zhixu-ainuoke-api_zhixu_data|zhixu-prod_zhixu_data/.test(mount.Name ?? "")));
      docker(["rm", "-fv", name]);
    }
    if (backupPath) {
      if (!backupPath.startsWith(backups + sep)) throw new Error("unsafe_test_cleanup_path");
      rmSync(backupPath, { force: true });
    }
  }
});

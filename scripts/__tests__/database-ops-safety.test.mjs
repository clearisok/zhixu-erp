import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const backups = join(root, "backups");
const marker = "TEST_SECRET_DO_NOT_PRINT";

function run(command, args, timeout = 30_000) {
  return spawnSync(command, args, { cwd: root, encoding: "utf8", timeout, windowsHide: true });
}

function docker(args) {
  const result = run("docker", args);
  assert.equal(result.status, 0, `disposable Docker step failed: ${args[0]} ${args[1] ?? ""}`);
  return result.stdout.trim();
}

function script(name, args) {
  return run("pwsh", ["-NoProfile", "-NonInteractive", "-File", join(root, name), ...args]);
}

function digest(value) { return createHash("sha256").update(value).digest("hex"); }

function backupEntries() {
  try { return readdirSync(backups).sort(); }
  catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function ready(container) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (run("docker", ["exec", container, "pg_isready", "-U", "drill", "-d", "drill"]).status === 0) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.fail("disposable PostgreSQL did not become ready");
}

test("database ops fail closed and backup/restore only an isolated disposable target", { timeout: 120_000 }, async (t) => {
  const nonce = randomUUID().replaceAll("-", "").slice(0, 10);
  const project = `q3b2g${nonce}`;
  const container = `q3b2g-db-${nonce}`;
  const badService = `q3b2g-service-${nonce}`;
  const missingMount = `q3b2g-mount-${nonce}`;
  const extraMounts = `q3b2g-extra-mounts-${nonce}`;
  const writer = `q3b2g-writer-${nonce}`;
  const created = [];
  const files = [];
  const fingerprint = digest(`${project}|${container}|tmpfs|drill|local_socket|5432`);
  const args = [
    "-ExpectedContainerName", container,
    "-ExpectedComposeProject", project,
    "-ExpectedVolumeName", "tmpfs",
    "-ExpectedDatabaseName", "drill",
    "-ExpectedTargetFingerprint", fingerprint,
  ];
  const backupScript = (extra = []) => script("Backup-Zhixu.ps1", [...args, ...extra]);

  try {
    docker([
      "run", "-d", "--pull=never", "--name", container, "--network", "none",
      "--tmpfs", "/var/lib/postgresql/data:rw,size=128m",
      "--label", `com.docker.compose.project=${project}`,
      "--label", "com.docker.compose.service=database",
      "-e", "POSTGRES_USER=drill", "-e", "POSTGRES_DB=drill",
      "-e", "POSTGRES_HOST_AUTH_METHOD=trust", `-e`, `POSTGRES_PASSWORD=${marker}`,
      "postgres:16-alpine",
    ]);
    created.push(container);
    const metadata = JSON.parse(docker(["inspect", container]))[0];
    assert.equal(metadata.HostConfig.NetworkMode, "none");
    assert.deepEqual(metadata.HostConfig.PortBindings, {});
    assert.deepEqual(metadata.Mounts, []);
    assert.ok(metadata.HostConfig.Tmpfs["/var/lib/postgresql/data"]);
    await ready(container);

    const before = backupEntries();
    const verify = backupScript(["-VerifyTargetOnly"]);
    assert.equal(verify.status, 0, verify.stderr);
    assert.match(verify.stdout, /target_verified/);
    assert.deepEqual(backupEntries(), before);
    assert.doesNotMatch(verify.stdout + verify.stderr, new RegExp(marker));
    await t.test("wrong project, volume, database, fingerprint and absent container reject without dump", () => {
      const failures = [
        ["-ExpectedComposeProject", "wrong-project"],
        ["-ExpectedVolumeName", "wrong-volume"],
        ["-ExpectedDatabaseName", "wrong-db"],
        ["-ExpectedTargetFingerprint", "0".repeat(64)],
        ["-ExpectedContainerName", `missing-${nonce}`],
      ];
      for (const [flag, value] of failures) {
        const modified = [...args];
        modified[modified.indexOf(flag) + 1] = value;
        const result = script("Backup-Zhixu.ps1", [...modified, "-VerifyTargetOnly"]);
        assert.notEqual(result.status, 0, flag);
        assert.doesNotMatch(result.stdout + result.stderr, new RegExp(marker));
      }
      assert.deepEqual(backupEntries(), before);
      const wrongFingerprint = script("Backup-Zhixu.ps1", [...args.slice(0, -1), "0".repeat(64)]);
      assert.notEqual(wrongFingerprint.status, 0);
      assert.deepEqual(backupEntries(), before);
    });

    docker([
      "run", "-d", "--pull=never", "--name", badService, "--network", "none",
      "--tmpfs", "/var/lib/postgresql/data:rw,size=64m",
      "--label", `com.docker.compose.project=${project}bad`,
      "--label", "com.docker.compose.service=not-database",
      "-e", "POSTGRES_USER=drill", "-e", "POSTGRES_DB=drill",
      "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:16-alpine",
    ]);
    created.push(badService);
    const wrongServiceArgs = [...args];
    wrongServiceArgs[wrongServiceArgs.indexOf("-ExpectedContainerName") + 1] = badService;
    wrongServiceArgs[wrongServiceArgs.indexOf("-ExpectedComposeProject") + 1] = `${project}bad`;
    assert.notEqual(script("Backup-Zhixu.ps1", [...wrongServiceArgs, "-VerifyTargetOnly"]).status, 0);

    docker([
      "run", "-d", "--pull=never", "--name", missingMount, "--network", "none",
      "--label", `com.docker.compose.project=${project}missing`,
      "--label", "com.docker.compose.service=database",
      "--entrypoint", "sh", "postgres:16-alpine", "-c", "sleep 120",
    ]);
    created.push(missingMount);
    const missingMountArgs = [...args];
    missingMountArgs[missingMountArgs.indexOf("-ExpectedContainerName") + 1] = missingMount;
    missingMountArgs[missingMountArgs.indexOf("-ExpectedComposeProject") + 1] = `${project}missing`;
    assert.notEqual(script("Backup-Zhixu.ps1", [...missingMountArgs, "-VerifyTargetOnly"]).status, 0);

    docker([
      "run", "-d", "--pull=never", "--name", extraMounts, "--network", "none",
      "--tmpfs", "/var/lib/postgresql/data:rw,size=64m",
      "--mount", "type=volume,target=/scratch1", "--mount", "type=volume,target=/scratch2",
      "--label", `com.docker.compose.project=${project}extra`,
      "--label", "com.docker.compose.service=database",
      "-e", "POSTGRES_USER=drill", "-e", "POSTGRES_DB=drill",
      "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:16-alpine",
    ]);
    created.push(extraMounts);
    const extraMountMetadata = JSON.parse(docker(["inspect", extraMounts]))[0];
    assert.equal(extraMountMetadata.Mounts.length, 2);
    const extraMountArgs = [...args];
    extraMountArgs[extraMountArgs.indexOf("-ExpectedContainerName") + 1] = extraMounts;
    extraMountArgs[extraMountArgs.indexOf("-ExpectedComposeProject") + 1] = `${project}extra`;
    assert.notEqual(script("Backup-Zhixu.ps1", [...extraMountArgs, "-VerifyTargetOnly"]).status, 0);

    docker(["exec", container, "psql", "-X", "-w", "-U", "drill", "-d", "drill", "-v", "ON_ERROR_STOP=1", "-q", "-c",
      "CREATE TABLE q3b2g_synthetic(id integer PRIMARY KEY, value text NOT NULL); INSERT INTO q3b2g_synthetic VALUES (1,'synthetic');"]);
    const backup = backupScript();
    assert.equal(backup.status, 0, backup.stderr);
    assert.doesNotMatch(backup.stdout + backup.stderr, new RegExp(marker));
    const name = /filename=(zhixu-[A-Za-z0-9-]+\.dump)/.exec(backup.stdout)?.[1];
    assert.ok(name);
    const backupPath = resolve(backups, name);
    assert.ok(backupPath.startsWith(resolve(backups) + sep));
    files.push(backupPath);
    assert.ok(existsSync(backupPath));
    assert.ok(statSync(backupPath).size > 1024);
    const backupSha = digest(readFileSync(backupPath));
    assert.match(backup.stdout, new RegExp(`sha256=${backupSha}`));

    const restoreArgs = ["-BackupFile", backupPath, ...args, "-ExpectedBackupSha256", backupSha];
    assert.notEqual(script("Restore-Zhixu.ps1", [...restoreArgs, "-ConfirmTargetFingerprint", fingerprint]).status, 0);
    assert.notEqual(script("Restore-Zhixu.ps1", [...restoreArgs, "-ConfirmDataLoss"]).status, 0);
    assert.notEqual(script("Restore-Zhixu.ps1", [...restoreArgs.slice(0, -1), "0".repeat(64), "-ConfirmDataLoss", "-ConfirmTargetFingerprint", fingerprint]).status, 0);

    docker([
      "run", "-d", "--pull=never", "--name", writer, "--network", "none",
      "--label", `com.docker.compose.project=${project}`,
      "--label", "com.docker.compose.service=zhixu",
      "--entrypoint", "sh", "postgres:16-alpine", "-c", "sleep 120",
    ]);
    created.push(writer);
    const writerBlocked = script("Restore-Zhixu.ps1", [...restoreArgs, "-ConfirmDataLoss", "-ConfirmTargetFingerprint", fingerprint]);
    assert.notEqual(writerBlocked.status, 0);
    assert.match(writerBlocked.stderr, /application_writer_not_frozen/);
    docker(["rm", "-fv", writer]);
    created.splice(created.indexOf(writer), 1);

    const corruptPath = resolve(backups, `zhixu-corrupt-${nonce}.dump`);
    assert.ok(corruptPath.startsWith(resolve(backups) + sep));
    writeFileSync(corruptPath, Buffer.alloc(2048, 0));
    files.push(corruptPath);
    const corruptArgs = ["-BackupFile", corruptPath, ...args, "-ExpectedBackupSha256", digest(readFileSync(corruptPath)), "-ConfirmDataLoss", "-ConfirmTargetFingerprint", fingerprint];
    const corrupt = script("Restore-Zhixu.ps1", corruptArgs);
    assert.notEqual(corrupt.status, 0);
    assert.match(corrupt.stderr, /restore_archive_invalid/);

    docker(["exec", container, "psql", "-X", "-w", "-U", "drill", "-d", "drill", "-v", "ON_ERROR_STOP=1", "-q", "-c",
      "UPDATE q3b2g_synthetic SET value='changed' WHERE id=1;"]);
    const restored = script("Restore-Zhixu.ps1", [...restoreArgs, "-ConfirmDataLoss", "-ConfirmTargetFingerprint", fingerprint]);
    assert.equal(restored.status, 0, restored.stderr);
    assert.match(restored.stdout, /writers_remain_frozen=YES/);
    assert.equal(docker(["exec", container, "psql", "-X", "-w", "-U", "drill", "-d", "drill", "-A", "-t", "-c",
      "SELECT value FROM q3b2g_synthetic WHERE id=1;"]), "synthetic");

    const helper = readFileSync(join(root, "scripts/database-target-guard.ps1"), "utf8");
    const restoreSource = readFileSync(join(root, "Restore-Zhixu.ps1"), "utf8");
    assert.ok(!/Config\.Env|DATABASE_URL|docker compose restart/i.test(helper + restoreSource), "forbidden source pattern");
    assert.match(helper, /Mounts\.Count -ne 1/);
    assert.doesNotMatch(helper + restoreSource, /preparesystem_zhixu_data/);
  } finally {
    for (const name of created.reverse()) {
      const inspection = run("docker", ["inspect", name]);
      if (inspection.status !== 0) continue;
      const metadata = JSON.parse(inspection.stdout)[0];
      assert.equal(metadata.Name, `/${name}`);
      assert.equal(metadata.HostConfig.NetworkMode, "none");
      assert.ok(metadata.Mounts.every((mount) => !/preparesystem_zhixu_data|zhixu-ainuoke-api_zhixu_data/.test(mount.Name ?? "")));
      docker(["rm", "-fv", name]);
    }
    for (const path of files) {
      if (!path.startsWith(resolve(backups) + sep)) throw new Error("unsafe_test_cleanup_path");
      rmSync(path, { force: true });
    }
  }
});

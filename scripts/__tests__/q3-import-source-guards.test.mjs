import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const git = (...args) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const hash = "a".repeat(64);

test("reviewed-source guards bind maintenance static and handoff safety paths", () => {
  const guarded = readFileSync(join(root, "scripts", "Invoke-Q3GuardedMasterImport.ps1"), "utf8");
  const rehearsal = readFileSync(join(root, "scripts", "Invoke-Q3IsolatedRehearsal.ps1"), "utf8");
  for (const path of ["server/build-identity.ts", "server/maintenance-static.ts", "server/maintenance-static-app.ts",
    "server/static-files.ts", "scripts/Invoke-Q3MaintenanceStaticHandoff.ps1",
    "scripts/q3-split-topology.ps1", "scripts/Invoke-Q3IndependentFrozenFrontend.ps1",
    "scripts/Invoke-Q3IndependentWriterFreeze.ps1", "features/data-management",
    "features/permissions", "Dockerfile.server", "vite.config.ts"]) {
    assert.ok(guarded.includes(path), `guarded importer misses ${path}`);
    assert.ok(rehearsal.includes(path), `rehearsal misses ${path}`);
  }
});

function verifyWithReviewedCommit(commit) {
  return spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-File", join(root, "scripts", "Invoke-Q3GuardedMasterImport.ps1"),
    "-ExpectedContainerName", "disposable-unreachable", "-ExpectedComposeProject", "synthetic",
    "-ExpectedVolumeName", "tmpfs", "-ExpectedDatabaseName", "synthetic", "-ExpectedTargetFingerprint", hash,
    "-ExpectedImportSourceCommit", commit, "-ExpectedBrowserOrigin", "http://127.0.0.1:3001",
    "-ExpectedBrowserNamespace", "synthetic", "-ExpectedBrowserEnvironment", "development",
    "-ExpectedBrowserSchemaVersion", "13", "-ExpectedFrozenBuildId", "synthetic-build",
    "-ExpectedFrontendTopology", "colocated",
    "-FreshBackupFile", "nonexistent", "-ExpectedBackupFileSha256", hash,
    "-ExpectedSourceHash", hash, "-ExpectedProjectionContentHash", hash,
    "-RehearsalProofFile", "nonexistent", "-ExpectedRehearsalProofSha256", hash,
    "-FrozenEvidenceFile", "nonexistent", "-ExpectedFrozenEvidenceSha256", hash,
    "-RollbackBackupFile", "nonexistent", "-ExpectedRollbackBackupSha256", hash,
    "-RollbackBackupManifestFile", "nonexistent", "-ExpectedRollbackBackupManifestSha256", hash,
    "-VerifyOnly"], { cwd: root, encoding: "utf8", timeout: 30_000, windowsHide: true });
}

test("Q3 guarded wrapper rejects reviewed code drift before any target or source access", () => {
  const prior = git("rev-parse", "origin/main");
  const result = verifyWithReviewedCommit(prior);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /import_code_differs_from_reviewed_commit/u);
  assert.doesNotMatch(result.stdout + result.stderr, /password|cookie|token|DATABASE_URL/iu);
});

test("Q3 guarded wrapper rejects an untracked critical source before any target access", () => {
  const path = join(root, "server", "quote-masters", `__q3_guard_test_${randomUUID().replaceAll("-", "")}.txt`);
  assert.equal(existsSync(path), false);
  try {
    writeFileSync(path, "synthetic guard test only\n", { flag: "wx" });
    const result = verifyWithReviewedCommit(git("rev-parse", "HEAD"));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /untracked_import_critical_source/u);
    assert.doesNotMatch(result.stdout + result.stderr, /password|cookie|token|DATABASE_URL/iu);
  } finally {
    if (existsSync(path)) unlinkSync(path);
  }
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const script = join(root, "scripts", "Publish-Q3EvidenceBundle.ps1");
const sha = (input) => createHash("sha256").update(input).digest("hex");
const commit = "a".repeat(40);
const sourceHash = "b".repeat(64);
const projectionHash = "c".repeat(64);
const attempt = "synthetic-attempt-001";
const confirm = "I_UNDERSTAND_Q3_EVIDENCE_COPY_CREATES_INDEPENDENT_CUSTODY";
const counts = { brands: 0, customerSalespeople: 0, fabrics: 0, trims: 0, manufacturingPresets: 0,
  brandDefaultTrims: 0, salespersonDefaultTrims: 0, globalSettings: 0, total: 0 };

function run(args) {
  return spawnSync("pwsh", ["-NoProfile", "-NonInteractive", "-File", script, ...args],
    { cwd: root, encoding: "utf8", timeout: 30_000, windowsHide: true });
}
function fixture() {
  const temp = mkdtempSync(join(tmpdir(), `q3-custody-${randomUUID().slice(0, 8)}-`));
  assert.ok(resolve(temp).startsWith(resolve(tmpdir()) + sep));
  const anchor = join(temp, "cloud-like");
  const destination = join(anchor, "Zhixu-ERP", "Evidence", "Q3B2I-C");
  const source = join(temp, "source-bundle");
  mkdirSync(anchor);
  const backupPath = join(temp, "fresh-backup.json");
  writeFileSync(backupPath, JSON.stringify({ synthetic: true, payload: "synthetic-test-only".repeat(6) }));
  const backupSha = sha(readFileSync(backupPath));
  const capture = { timestamp: "2026-09-29T09:01:00Z", environment: "development",
    origin: "http://127.0.0.1:3001", namespace: "zhixu.erp.synthetic", backupVersion: 1, schemaVersion: 13 };
  const frozen = { gitCommit: commit, buildId: "synthetic-build", buildTime: "2026-09-29T09:00:00Z", masterSettingsAuthority: "frozen" };
  const freeze = { evidenceVersion: 1, result: "PASS", browserOrigin: capture.origin, browserProfileLabel: "synthetic-profile",
    namespace: capture.namespace, schemaVersion: 13, expected: frozen, observed: frozen,
    freezeStartedAt: "2026-09-29T09:00:00Z", verifiedAt: "2026-09-29T09:00:01Z",
    operatorLabel: "synthetic-operator", allOldTabsClosedBeforeFrozenReopen: true };
  const proof = { proofVersion: 1, result: "PASS", sourceFileSha256: backupSha, sourceHash, projectionContentHash: projectionHash,
    reviewedCommit: commit, projectedCounts: counts, migrationLedger: [{ version: "7", filename: "0007_quote_master_settings.sql", checksum: "f".repeat(64) }],
    postgresMajor: 16, rehearsedAt: "2026-09-29T09:02:00Z", importCounts: counts, readbackCounts: counts,
    readbackContentHash: projectionHash, rollbackValidated: true, postCommitUnverifiedValidated: true,
    secondImportRejected: true, disposableContainerRemoved: true };
  const rollback = { contract: "zhixu-exact-target-backup.v1", sha256: "d".repeat(64),
    targetFingerprint: "e".repeat(64), archiveListVerified: true, filename: "synthetic.dump",
    createdAt: "2026-09-29T09:03:00Z", bytes: 2048, containerName: "synthetic-db",
    composeProject: "synthetic", volumeName: "tmpfs", databaseName: "synthetic" };
  const preview = { contract: "quote-master-settings-backup-preview.v1", capture, sourceHash,
    sensitiveFieldPaths: [], preview: { blockingErrors: [], warnings: [], projectedServerRows: counts } };
  const files = { freeze: join(temp, "freeze.json"), proof: join(temp, "proof.json"),
    rollback: join(temp, "rollback.manifest.json"), preview: join(temp, "preview.json") };
  for (const [key, value] of Object.entries({ freeze, proof, rollback, preview })) writeFileSync(files[key], JSON.stringify(value));
  const common = ["-SourceEvidenceDirectory", source, "-DestinationRoot", destination,
    "-DestinationAnchor", anchor, "-AttemptId", attempt];
  const prepare = [...common, "-ReviewedCommit", commit, "-FreezeEvidenceFile", files.freeze,
    "-FreshBackupFile", backupPath, "-CanonicalPreviewReportFile", files.preview,
    "-RehearsalProofFile", files.proof, "-RollbackManifestFile", files.rollback, "-Prepare"];
  const close = () => { if (resolve(temp).startsWith(resolve(tmpdir()) + sep)) rmSync(temp, { recursive: true, force: true }); };
  return { temp, anchor, destination, source, common, prepare, files, close };
}

test("D-091 disposable custody: prepare, zero-write VerifyOnly, confirmed copy, destination readback, duplicate reject", () => {
  const f = fixture();
  try {
    const prepared = run(f.prepare);
    assert.equal(prepared.status, 0, prepared.stderr);
    assert.match(prepared.stdout, /q3_evidence_prepared/u);
    const sourceNames = readdirSync(f.source).sort();
    assert.deepEqual(sourceNames, ["freeze-evidence.json", "manifest.json", "rehearsal-proof.json", "rollback-manifest.json", "source-identity-summary.json"]);
    const before = readdirSync(f.anchor);
    const verify = run([...f.common, "-VerifyOnly"]);
    assert.equal(verify.status, 0, verify.stderr);
    assert.match(verify.stdout, /destination_attempt_directory_pending=YES/u);
    assert.deepEqual(readdirSync(f.anchor), before);
    assert.equal(existsSync(f.destination), false);
    const unconfirmed = run([...f.common, "-Execute"]);
    assert.notEqual(unconfirmed.status, 0);
    assert.match(unconfirmed.stderr, /independent_evidence_copy_confirmation_required/u);
    const copied = run([...f.common, "-Execute", "-ConfirmEvidenceCopy", confirm]);
    assert.equal(copied.status, 0, copied.stderr);
    assert.match(copied.stdout, /destination_readback=PASS/u);
    const destinationStage = join(f.destination, attempt, "pre-execute");
    assert.deepEqual(readdirSync(destinationStage).sort(), sourceNames);
    for (const name of sourceNames) assert.equal(sha(readFileSync(join(destinationStage, name))), sha(readFileSync(join(f.source, name))));
    const readback = run([...f.common, "-VerifyOnly"]);
    assert.equal(readback.status, 0, readback.stderr);
    assert.match(readback.stdout, /destination_verified=YES/u);
    const duplicate = run([...f.common, "-Execute", "-ConfirmEvidenceCopy", confirm]);
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /evidence_attempt_directory_already_exists/u);
    writeFileSync(join(destinationStage, "rollback-manifest.json"), "{}");
    const tampered = run([...f.common, "-VerifyOnly"]);
    assert.notEqual(tampered.status, 0);
  } finally { f.close(); }
});

test("D-091 custody rejects source drift, unknown files, raw dump and raw Browser backup", () => {
  for (const filename of ["freeze-evidence.json", "unknown.json", "raw.dump", "browser-backup.json"]) {
    const f = fixture();
    try {
      assert.equal(run(f.prepare).status, 0);
      if (filename === "freeze-evidence.json") writeFileSync(join(f.source, filename), "{}");
      else writeFileSync(join(f.source, filename), "synthetic prohibited artifact");
      const result = run([...f.common, "-VerifyOnly"]);
      assert.notEqual(result.status, 0, filename);
      assert.equal(existsSync(f.destination), false);
    } finally { f.close(); }
  }
});

test("D-091 custody rejects extra, raw payload-like and credential fields inside allowlisted JSON", () => {
  for (const [file, mutate] of [
    ["freeze", (value) => { value.unexpectedBusinessField = "synthetic"; }],
    ["proof", (value) => { value.payload = { businessRows: ["synthetic"] }; }],
    ["freeze", (value) => { value.password = "synthetic-test-only"; }],
    ["freeze", (value) => { value.expected.rawBusinessFact = "synthetic"; }],
  ]) {
    const f = fixture();
    try {
      const value = JSON.parse(readFileSync(f.files[file], "utf8"));
      mutate(value);
      writeFileSync(f.files[file], JSON.stringify(value));
      const result = run(f.prepare);
      assert.notEqual(result.status, 0, file);
      assert.match(result.stderr, /evidence_unexpected_field_forbidden|evidence_secret_field_forbidden/u);
      assert.equal(existsSync(f.source), false);
      assert.equal(existsSync(f.destination), false);
    } finally { f.close(); }
  }
});

test("D-091 custody rejects unknown artifact kind and extra pre-execute manifest fields", () => {
  for (const mutate of [
    (manifest) => { manifest.artifacts[0].kind = "unknown_artifact"; },
    (manifest) => { manifest.rawPayload = { synthetic: true }; },
  ]) {
    const f = fixture();
    try {
      assert.equal(run(f.prepare).status, 0);
      const path = join(f.source, "manifest.json");
      const manifest = JSON.parse(readFileSync(path, "utf8"));
      mutate(manifest);
      writeFileSync(path, JSON.stringify(manifest));
      const result = run([...f.common, "-VerifyOnly"]);
      assert.notEqual(result.status, 0);
      assert.equal(existsSync(f.destination), false);
    } finally { f.close(); }
  }
});

test("D-091 custody rejects a reparse destination path when Windows permits one", (t) => {
  const f = fixture();
  try {
    assert.equal(run(f.prepare).status, 0);
    const link = join(f.anchor, "linked-root");
    try { symlinkSync(f.source, link, "junction"); }
    catch { t.skip("Windows symlink/junction creation unavailable"); return; }
    const args = [...f.common];
    args[args.indexOf("-DestinationRoot") + 1] = join(link, "Evidence", "Q3B2I-C");
    const result = run([...args, "-VerifyOnly"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /evidence_reparse_path_forbidden|evidence_destination_invalid/u);
  } finally { f.close(); }
});

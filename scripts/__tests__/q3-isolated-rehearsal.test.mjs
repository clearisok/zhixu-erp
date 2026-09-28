import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const envelope = (data) => JSON.stringify({ schemaVersion: 13, initializedAt: "2026-09-28T00:00:00Z", updatedAt: "2026-09-28T00:00:00Z", data });
const namespace = "zhixu.erp.synthetic-q3b2i";
const backup = {
  product: "zhixu-erp", backupVersion: 1, schemaVersion: 13, createdAt: "2026-09-28T10:01:00Z", environment: "test",
  origin: "http://127.0.0.1:3001", namespace, attachments: [], templates: [],
  localRecords: {
    [`${namespace}.basic-settings`]: envelope({
      brands: [{ id: "brand-synthetic", name: "Synthetic Brand", status: "active", defaults: { defaultUsdCnyRate: null, defaultOtherCost: null, defaultTrims: [{ id: "brand-trim-synthetic", trimLibraryItemId: "trim-synthetic", quantity: 3, overrideLossRate: null, overrideUnitPrice: 0 }] } }],
      customerSalespeople: [{ id: "sales-synthetic", name: "Synthetic Salesperson", brandId: "brand-synthetic", status: "active", defaults: { defaultUsdCnyRate: 0, defaultOtherCost: { name: "Synthetic Cost", amount: null }, defaultTrims: [] } }],
      fabricLibrary: [{ id: "fabric-synthetic", name: "Synthetic Fabric", composition: "Cotton", netWidthCm: 140, gsm: 180, defaultLossRate: 0, supplier: "Synthetic Supplier", unitPrice: 12.5, purchaseUnit: "kg", createdAt: "2026-01-01", updatedAt: "2026-01-01" }],
      trimLibrary: [{ id: "trim-synthetic", name: "Synthetic Trim", specification: "", supplier: "Synthetic Supplier", unit: "pcs", defaultLossRate: null, unitPrice: 0, createdAt: "2026-01-01", updatedAt: "2026-01-01" }],
      systemDefaults: { usdCnyRate: null, markupRate: null, laborCurrency: "CNY", defaultOtherCost: null },
    }),
    [`${namespace}.quote-global-settings`]: envelope({ defaultUsdCnyRate: 7.2, defaultMarkupRate: 0, defaultLaborCurrency: "CNY", defaultLaborDescription: "Synthetic labor", defaultOtherCost: null, defaultManufacturingPresetId: "preset-synthetic", manufacturingPresets: [{ id: "preset-synthetic", name: "Synthetic Preset", country: "CN", laborCurrency: "CNY", markupRate: 0, includeFreight: false, freightName: "Freight", freightAmount: null, status: "active" }] }),
  },
};

function run(command, args, timeout = 30_000) { return spawnSync(command, args, { cwd: root, encoding: "utf8", timeout, windowsHide: true }); }
const sha = (value) => createHash("sha256").update(value).digest("hex");

test("Q3 rehearsal uses a portless tmpfs PostgreSQL 16 and publishes proof only after cleanup", { timeout: 600_000 }, () => {
  const nonce = randomUUID().replaceAll("-", "").slice(0, 10);
  const temp = mkdtempSync(join(tmpdir(), `q3-isolated-${nonce}-`));
  const evidence = join(root, "backups", `q3-isolated-test-${nonce}`);
  const guardedEvidence = join(root, "backups", `q3-guarded-test-${nonce}`);
  assert.ok(resolve(temp).startsWith(resolve(tmpdir()) + sep));
  assert.ok(resolve(evidence).startsWith(resolve(root, "backups") + sep));
  assert.ok(resolve(guardedEvidence).startsWith(resolve(root, "backups") + sep));
  try {
    const path = join(temp, "source.json");
    writeFileSync(path, JSON.stringify(backup));
    const sourcePath = realpathSync(path);
    const fileSha = sha(readFileSync(sourcePath));
    const preview = run(process.execPath, [join(root, "node_modules", "tsx", "dist", "cli.mjs"), join(root, "scripts", "preview-quote-master-settings-backup.ts"), "--backup", sourcePath], 120_000);
    assert.equal(preview.status, 0, preview.stderr?.slice(-1000));
    const report = JSON.parse(preview.stdout.slice(preview.stdout.indexOf("{\n")));
    assert.equal(report.preview.blockingErrors.length, 0);
    const commit = run("git", ["rev-parse", "HEAD"]).stdout.trim();
    const result = run("pwsh", ["-NoProfile", "-NonInteractive", "-File", join(root, "scripts", "Invoke-Q3IsolatedRehearsal.ps1"),
      "-BackupFile", sourcePath, "-ExpectedBackupFileSha256", fileSha, "-ExpectedSourceHash", report.sourceHash,
      "-ReviewedCommit", commit, "-EvidenceDirectory", evidence], 540_000);
    assert.equal(result.status, 0, `${result.stdout?.slice(-1200)} ${result.stderr?.slice(-1200)}`);
    const proof = JSON.parse(readFileSync(join(evidence, "proof.json"), "utf8"));
    assert.equal(proof.result, "PASS");
    assert.equal(proof.sourceFileSha256, fileSha);
    assert.equal(proof.sourceHash, report.sourceHash);
    assert.equal(proof.rollbackValidated, true);
    assert.equal(proof.secondImportRejected, true);
    assert.equal(proof.disposableContainerRemoved, true);
    assert.equal(proof.importCounts.total, proof.projectedCounts.total);
    assert.equal(proof.readbackContentHash, proof.projectionContentHash);
    const frozenBuild = { gitCommit: commit, buildId: `synthetic-build-${nonce}`, buildTime: "2026-09-28T10:00:00Z", masterSettingsAuthority: "frozen" };
    const freezePath = join(temp, "freeze.json");
    writeFileSync(freezePath, JSON.stringify({ evidenceVersion: 1, result: "PASS", browserOrigin: backup.origin,
      browserProfileLabel: "synthetic-profile", namespace, schemaVersion: 13, expected: frozenBuild, observed: frozenBuild,
      freezeStartedAt: "2026-09-28T10:00:00Z", verifiedAt: "2026-09-28T10:00:01Z",
      operatorLabel: "synthetic-operator", allOldTabsClosedBeforeFrozenReopen: true }));
    const guarded = run("pwsh", ["-NoProfile", "-NonInteractive", "-File", join(root, "scripts", "Invoke-Q3IsolatedGuardedImportTest.ps1"),
      "-BackupFile", sourcePath, "-ProofFile", join(evidence, "proof.json"), "-FreezeFile", freezePath,
      "-EvidenceDirectory", guardedEvidence, "-ReviewedCommit", commit], 540_000);
    assert.equal(guarded.status, 0, `${guarded.stdout?.slice(-1200)} ${guarded.stderr?.slice(-1200)}`);
    assert.match(guarded.stdout, /q3_disposable_guarded_verify_execute_pass/u);
  } finally {
    if (resolve(temp).startsWith(resolve(tmpdir()) + sep)) rmSync(temp, { recursive: true, force: true });
    if (resolve(evidence).startsWith(resolve(root, "backups") + sep)) rmSync(evidence, { recursive: true, force: true });
    if (resolve(guardedEvidence).startsWith(resolve(root, "backups") + sep)) rmSync(guardedEvidence, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { inspectQ3SourceFile, readHashedEvidence, validateFreezeEvidence, validateRehearsalProof, verifyRunningFrozenBuild, type Q3FreezeEvidence, type Q3RehearsalProof } from "./import-readiness.js";

const commit = "a".repeat(40);
const envelope = (data: object) => JSON.stringify({ schemaVersion: 13, initializedAt: "2026-09-28T00:00:00.000Z", updatedAt: "2026-09-28T00:00:00.000Z", data });
const source = (capture = "2026-09-28T10:01:00.000Z") => ({
  product: "zhixu-erp", backupVersion: 1, schemaVersion: 13, createdAt: capture,
  environment: "test", origin: "http://127.0.0.1:3001", namespace: "zhixu.erp.synthetic-q3b2i",
  localRecords: {
    "zhixu.erp.synthetic-q3b2i.basic-settings": envelope({ brands: [], customerSalespeople: [], fabricLibrary: [], trimLibrary: [], systemDefaults: {} }),
    "zhixu.erp.synthetic-q3b2i.quote-global-settings": envelope({ defaultUsdCnyRate: null, defaultMarkupRate: 0, defaultLaborCurrency: "CNY", defaultLaborDescription: "Synthetic", defaultOtherCost: null, defaultManufacturingPresetId: null, manufacturingPresets: [] }),
  }, attachments: [], templates: [],
});

test("immutable source binds file SHA separately from canonical source and projection hashes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zhixu-q3-source-"));
  const path = join(directory, "source.json");
  try {
    await writeFile(path, JSON.stringify(source()));
    assert.equal((await lstat(path)).isFile(), true);
    const canonicalPath = await realpath(path);
    const first = await inspectQ3SourceFile(canonicalPath);
    assert.equal(first.identity.fileSha256, createHash("sha256").update(await readFile(path)).digest("hex"));
    assert.equal(first.identity.blockers, 0);
    assert.equal(first.identity.projectedCounts.globalSettings, 1);
    await writeFile(path, JSON.stringify(source("2026-09-28T10:02:00.000Z")));
    const second = await inspectQ3SourceFile(canonicalPath);
    assert.notEqual(first.identity.fileSha256, second.identity.fileSha256);
    assert.equal(first.identity.sourceHash, second.identity.sourceHash);
    assert.equal(first.identity.projectionContentHash, second.identity.projectionContentHash);
    await assert.rejects(() => inspectQ3SourceFile("source.json"), /canonical/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("frozen verifier checks exact running origin, commit, build and authority without credentialed fetch", async () => {
  const expected = { gitCommit: commit, buildId: "build-1", buildTime: "2026-09-28T10:00:00Z", masterSettingsAuthority: "frozen" as const };
  const origin = "http://127.0.0.1:3001";
  const calls: Array<{ input: unknown; init: RequestInit | undefined }> = [];
  const fetchImpl: typeof fetch = async (input, init) => { calls.push({ input, init }); return new Response(JSON.stringify(expected), { status: 200 }); };
  assert.deepEqual(await verifyRunningFrozenBuild(origin, expected, fetchImpl), expected);
  assert.equal(calls[0].input, `${origin}/build-info.json`);
  assert.equal(calls[0].init?.credentials, "omit");
  await assert.rejects(() => verifyRunningFrozenBuild(origin, expected, async () => new Response(JSON.stringify({ ...expected, masterSettingsAuthority: "browser" }))), /mismatch/u);
  await assert.rejects(() => verifyRunningFrozenBuild("http://user:secret@127.0.0.1:3001", expected, fetchImpl), /origin/u);
});

test("freeze evidence requires explicit old-tab attestation and exact reviewed identity", () => {
  const frozen = { gitCommit: commit, buildId: "build-1", buildTime: "2026-09-28T10:00:00Z", masterSettingsAuthority: "frozen" as const };
  const evidence: Q3FreezeEvidence = { evidenceVersion: 1, result: "PASS", browserOrigin: "http://127.0.0.1:3001", browserProfileLabel: "synthetic-profile", namespace: "synthetic", schemaVersion: 13, expected: frozen, observed: frozen, freezeStartedAt: "2026-09-28T10:00:00Z", verifiedAt: "2026-09-28T10:00:01Z", operatorLabel: "operator-1", allOldTabsClosedBeforeFrozenReopen: true };
  const expected = { origin: evidence.browserOrigin, namespace: evidence.namespace, schemaVersion: 13, commit, buildId: "build-1" };
  assert.equal(validateFreezeEvidence(evidence, expected).result, "PASS");
  assert.throws(() => validateFreezeEvidence({ ...evidence, allOldTabsClosedBeforeFrozenReopen: false as true }, expected), /mismatch/u);
  assert.throws(() => validateFreezeEvidence(evidence, { ...expected, commit: "b".repeat(40) }), /mismatch/u);
});

test("rehearsal proof rejects wrong source/hash/code/ledger/rollback/readback", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zhixu-q3-proof-"));
  const path = join(directory, "source.json");
  try {
    await writeFile(path, JSON.stringify(source()));
    assert.equal((await lstat(path)).isFile(), true);
    const canonicalPath = await realpath(path);
    const { identity } = await inspectQ3SourceFile(canonicalPath);
    const ledger = Array.from({ length: 7 }, (_, index) => ({ version: String(index + 1), filename: `000${index + 1}_synthetic.sql`, checksum: "b".repeat(64) }));
    const proof: Q3RehearsalProof = { proofVersion: 1, result: "PASS", sourceFileSha256: identity.fileSha256, sourceHash: identity.sourceHash, projectionContentHash: identity.projectionContentHash, projectedCounts: identity.projectedCounts, reviewedCommit: commit, migrationLedger: ledger, postgresMajor: 16, rehearsedAt: "2026-09-28T10:03:00Z", importCounts: identity.projectedCounts, readbackCounts: identity.projectedCounts, readbackContentHash: identity.projectionContentHash, rollbackValidated: true, postCommitUnverifiedValidated: true, secondImportRejected: true, disposableContainerRemoved: true };
    assert.equal(validateRehearsalProof(proof, identity, commit, ledger).result, "PASS");
    for (const wrong of [
      { ...proof, sourceFileSha256: "c".repeat(64) }, { ...proof, sourceHash: "c".repeat(64) },
      { ...proof, projectionContentHash: "c".repeat(64) }, { ...proof, reviewedCommit: "c".repeat(40) },
      { ...proof, rollbackValidated: false as true }, { ...proof, postCommitUnverifiedValidated: false as true }, { ...proof, readbackContentHash: "c".repeat(64) },
      { ...proof, disposableContainerRemoved: false as true },
    ]) assert.throws(() => validateRehearsalProof(wrong, identity, commit, ledger), /mismatch/u);
    assert.throws(() => validateRehearsalProof(proof, identity, commit, []), /mismatch/u);
    const proofPath = join(directory, "proof.json");
    await writeFile(proofPath, JSON.stringify(proof));
    const hash = createHash("sha256").update(await readFile(proofPath)).digest("hex");
    const canonicalProofPath = await realpath(proofPath);
    assert.deepEqual(await readHashedEvidence(canonicalProofPath, hash), proof);
    await assert.rejects(() => readHashedEvidence(canonicalProofPath, "c".repeat(64)), /hash_mismatch/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

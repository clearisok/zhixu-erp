import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parseMigrationExecutionEvidence, serializeMigrationExecutionEvidence } from "./migration-evidence.js";

const hash = "a".repeat(64);
const fixture = {
  evidenceVersion: 1,
  executionId: "execution-1",
  executionType: "quote_master_settings_import",
  outcome: "COMMITTED",
  startedAt: "2026-09-28T01:00:00Z",
  finishedAt: "2026-09-28T01:00:01Z",
  operator: "human:operator-1",
  authorizationRef: "approval-123",
  repoCommit: "b".repeat(40),
  targetFingerprint: hash,
  databaseName: "zhixu",
  postgresVersion: "16.14",
  migrationLedger: [{ version: "7", filename: "0007_quote_master_settings.sql", checksum: hash, state: "applied" }],
  rollbackBackupSha256: hash,
  sourceFileSha256: hash,
  sourceHash: hash,
  projectionContentHash: hash,
  plannedCounts: { trims: 18, brands: 4 },
  committedCounts: { brands: 4, trims: 18 },
  readbackCounts: { trims: 18, brands: 4 },
  readbackContentHash: hash,
};

test("migration evidence preserves bounded sanitized provenance and deterministic counts", () => {
  const parsed = parseMigrationExecutionEvidence(fixture);
  assert.deepEqual(parsed.plannedCounts, { brands: 4, trims: 18 });
  assert.equal(serializeMigrationExecutionEvidence(fixture), serializeMigrationExecutionEvidence({ ...fixture }));
  assert.equal(parsed.outcome, "COMMITTED");
});

test("migration evidence rejects missing required fields, unknown keys and secret-like values", () => {
  assert.throws(() => parseMigrationExecutionEvidence({ ...fixture, operator: undefined }));
  assert.throws(() => parseMigrationExecutionEvidence({ ...fixture, password: "unsafe" }));
  assert.throws(() => parseMigrationExecutionEvidence({ ...fixture, authorizationRef: "postgresql://unsafe" }));
  assert.throws(() => parseMigrationExecutionEvidence({ ...fixture, rawBusinessRows: [] }));
  assert.throws(() => parseMigrationExecutionEvidence({ ...fixture, plannedCounts: { brands: -1 } }));
  assert.throws(() => parseMigrationExecutionEvidence({ ...fixture, plannedCounts: undefined }));
  assert.throws(() => parseMigrationExecutionEvidence({ ...fixture, sourceFileSha256: undefined }));
  assert.throws(() => parseMigrationExecutionEvidence({ ...fixture, readbackContentHash: undefined }));
});

test("prepared cannot claim commits; failed execution carries bounded failure evidence", () => {
  assert.throws(() => parseMigrationExecutionEvidence({ ...fixture, outcome: "PREPARED" }));
  assert.throws(() => parseMigrationExecutionEvidence({ ...fixture, outcome: "FAILED" }));
  const failed = parseMigrationExecutionEvidence({
    ...fixture,
    outcome: "FAILED",
    committedCounts: undefined,
    readbackCounts: undefined,
    readbackContentHash: undefined,
    failure: { code: "checksum_mismatch", phase: "preflight" },
  });
  assert.equal(failed.failure?.code, "checksum_mismatch");
  assert.throws(() => parseMigrationExecutionEvidence({ ...fixture, failure: { code: "x", phase: "x" } }));
});

test("evidence contract is storage-neutral and never creates runtime OperationLogs", async () => {
  const source = await readFile(new URL("./migration-evidence.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /appendOperationLog|INSERT INTO operation_logs|from .*operation-logs\/repository/);
});

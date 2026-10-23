import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { garmentOperatorArguments, parseGarmentOperatorJob, readGarmentOperatorJson,
  parseGarmentOperatorVerification, garmentOperatorSummary, garmentOperatorExitCode } from "../ainuoke-source/garment-operator-cli.js";
import { validateGarmentFilterEvidence } from "../ainuoke-source/garment-contract-verification.js";
import { paymentPrivateFixture } from "./payment-operator-private-fixture.js";
import { collectionRequest, configFor } from "./garment-collection-fixture.js";

const base = () => ["--job=" + resolve("outputs/synthetic-job.json"), "--expected-job=" + "a".repeat(64),
  "--private-output=" + resolve("outputs/synthetic-private"), "--request-id=" + randomUUID()];
const expiry = "--expires-at=2026-10-23T15:00:00.000Z";
const intent = () => {
  const { password, operatorUsername, ...source } = configFor(); void password;
  return { schemaVersion: "ainuoke-garment-operator-job.v1", databaseUrl: "postgresql://synthetic:private@127.0.0.1/synthetic",
    operatorUsername, source, salesOrderId: randomUUID(), verification: null };
};

test("garment operator requires exactly one fixed action and never accepts target/SQL/worker/retry flags", () => {
  assert.equal(garmentOperatorArguments(["--receipt=6086979", ...base()]).action, "receipt");
  assert.equal(garmentOperatorArguments(["--plan-collection=6086979", ...base(), expiry]).action, "plan-collection");
  const collect = ["--collect-once=6086979", ...base(), expiry, "--scope-hash=" + "b".repeat(64),
    "--execute=I_CONFIRM_EXACT_SCOPE", "--credential-file=" + resolve("outputs/synthetic-key.txt")];
  assert.equal(garmentOperatorArguments(collect).action, "collect-once");
  for (const args of [[], ["--receipt=6086941", ...base()], ["--receipt=6086979", "--plan-collection=6086979", ...base(), expiry],
    ["--receipt=6086979", ...base(), "--receipt=6086979"], ["--plan-collection=6086979", ...base()],
    ["--plan-collection=6086979", ...base(), "--expires-at=2026-02-30T00:00:00.000Z"],
    ["--receipt=6086979", ...base(), expiry], ["--collect-once=6086979", ...base(), expiry],
    ...["enable", "sql", "migrate", "bootstrap", "schedule", "retry", "worker", "max-pages", "source-contract", "python"].map(flag => [...collect, "--" + flag + "=yes"])])
    assert.throws(() => garmentOperatorArguments(args), { code: "garment_operator_explicit_action_required" });
});

test("job accepts only a bounded single SO private intent, with no credential or supplied permission", () => {
  const job = intent(); assert.equal(parseGarmentOperatorJob(job).salesOrderId, job.salesOrderId);
  assert.equal(parseGarmentOperatorJob(job).verification, null);
  for (const bad of [{ ...job, password: "not-allowed" }, { ...job, permissions: ["ainuoke.sync"] },
    { ...job, targets: [] }, { ...job, verification: { path: "relative.json", sha256: "a".repeat(64) } },
    { ...job, source: { ...job.source, password: "not-allowed" } }, { ...job, salesOrderId: "style-number" },
    ...["https://localhost/synthetic", "postgresql://localhost/synthetic", "postgresql://synthetic@localhost/", "postgresql://synthetic@localhost/db#fragment"].map(databaseUrl => ({ ...job, databaseUrl }))])
    assert.throws(() => parseGarmentOperatorJob(bad), { code: "garment_operator_invalid_job" });
});

test("protected JSON rejects duplicate decoded keys, wrong hash, UTF8 and size without coercing proof framing", () => {
  const files = paymentPrivateFixture();
  try {
    const good = files.write("framing.json", '{"httpAttempts":4,"reportRequests":3,"raw":"{\\\"Num\\\":9007199254740993.000000000001}"}');
    assert.deepEqual(readGarmentOperatorJson(good.path, good.sha256, 4096), { httpAttempts: 4, reportRequests: 3,
      raw: '{"Num":9007199254740993.000000000001}' });
    for (const text of ['{"job":1,"job":2}', '{"outer":{"n":1,"\\u006e":2}}']) {
      const file = files.write(randomUUID() + ".json", text);
      assert.throws(() => readGarmentOperatorJson(file.path, file.sha256, 4096), { code: "garment_operator_invalid_json" });
    }
    assert.throws(() => readGarmentOperatorJson(good.path, "0".repeat(64), 4096), { code: "payment_operator_private_file_invalid" });
    assert.throws(() => readGarmentOperatorJson(good.path, good.sha256, 1), { code: "payment_operator_private_file_invalid" });
    const invalid = files.write("invalid-utf8.json", Buffer.from([0xff]));
    assert.throws(() => readGarmentOperatorJson(invalid.path, invalid.sha256, 4096), { code: "payment_operator_private_file_invalid" });
    assert.throws(() => readGarmentOperatorJson(join(files.directory, "missing.json"), good.sha256, 4096), { code: "payment_operator_private_file_invalid" });
  } finally { files.close(); }
});

test("original producer wrapper is reconstructed at the original checkedAt; copied labels, changed metadata and bare triples are rejected", () => {
  const stamp = Date.parse("2026-10-23T00:00:00.000Z"), request = collectionRequest(randomUUID(), "SYN-OPERATOR-PROOF", stamp);
  const report = { ...validateGarmentFilterEvidence(request.verification.evidence, request.config, request.verification.selection, stamp).privateReport,
    toolingCommit: "d".repeat(40) };
  assert.deepEqual(parseGarmentOperatorVerification(report, request.config, stamp + 86400000), request.verification);
  for (const value of [request.verification, { ...report, extra: true }, { ...report, validationStatus: "rejected" },
    { ...report, databaseAccess: "read-write" }, { ...report, rawNumericTextIsAuthoritative: false },
    { ...report, queryManifest: { ...report.queryManifest, page: 2 } }, { ...report, toolingCommit: "unknown" },
    { ...report, checkedAt: new Date(stamp + 1).toISOString() }, { ...report, evidence: { result: "complete" } }])
    assert.throws(() => parseGarmentOperatorVerification(value, request.config, stamp), { code: "garment_operator_verification_invalid" });
  assert.throws(() => parseGarmentOperatorVerification(report, { ...request.config, username: "wrong-account" }, stamp), { code: "garment_operator_verification_invalid" });
});

test("unverified claim/COMMIT/started/unknown is never successful or a retry lease, even with a provisional publication", () => {
  for (const receiptState of ["unverified_claim", "unverified_commit", "unverified_started", "unknown"]) {
    const summary = garmentOperatorSummary("collect-once", randomUUID(), { receiptState, result: { outcome: "published",
      publicationId: randomUUID(), snapshotId: "a".repeat(64), generation: 1 }, rawSecret: "never-public", code: "untrusted failure",
    });
    assert.equal(summary.result, "COLLECTION_UNVERIFIED"); assert.equal(garmentOperatorExitCode(summary), 2);
    assert.equal(summary.automaticRetry, false); assert.equal("publicationId" in summary, false);
    assert.equal(JSON.stringify(summary).includes("never-public"), false); assert.equal(JSON.stringify(summary).includes("untrusted failure"), false);
  }
  const published = garmentOperatorSummary("receipt", randomUUID(), { receiptState: "completed", sourceReadThisInvocation: "none",
    result: { outcome: "published", requestCounts: { httpAttempts: 3, reportRequests: 2 }, publicationId: randomUUID(), snapshotId: "a".repeat(64), generation: 1 } });
  assert.equal(published.result, "COLLECTION_PUBLISHED"); assert.ok("receiptIsHistorical" in published); assert.equal(published.receiptIsHistorical, true);
  assert.equal(garmentOperatorExitCode(published), 0); assert.equal(published.sourceReadThisInvocation, "none");
  assert.equal(garmentOperatorExitCode({ result: "PRIVATE_REPORT_UNAVAILABLE" }), 2);
  assert.equal(garmentOperatorExitCode({ result: "COLLECTION_NOT_PUBLISHED" }), 2);
});

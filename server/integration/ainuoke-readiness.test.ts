import test from "node:test";
import assert from "node:assert/strict";
import { parseReadinessArguments, probeSource, readinessFingerprint, validateProbeSummary } from "../ainuoke-source/readiness.js";

const config = { sourceKey: "synthetic", baseUrl: "https://example.invalid", username: "synthetic", password: "Synthetic-Only", operatorUsername: "operator" };
const summary = () => ({ schemaVersion: "ainuoke-connection-probe.v1", authenticated: true, scope: "first-visible-contract-first-pages-only",
  reports: [6086103, 6087105, 6087050].map(reportId => ({ reportId, status: "readable", returnedRows: 50, totalRows: 51, complete: false })) });

test("readiness arguments require one explicit action and pinned source", () => {
  assert.equal(parseReadinessArguments(["--check", "--config=/private.json"]).action, "check");
  assert.equal(parseReadinessArguments(["--probe", "--config=/private.json", "--expected-source=" + "a".repeat(64), "--verified-tunnel"]).verifiedTunnel, true);
  for (const args of [[], ["--check"], ["--check", "--probe"], ["--check", "--check", "--config=/p"],
    ["--probe", "--config=/p"], ["--check=yes", "--config=/p"], ["--check", "--config=/p", "--execute"],
    ["--check", "--config=/p", "--verified-tunnel"], ["--probe", "--config=/p", "--expected-source=" + "a".repeat(64), "--verified-tunnel=false"],
    ["--probe", "--config=/p", "--expected-source=wrong"]]) assert.throws(() => parseReadinessArguments(args), /explicit_probe_action_required/);
});

test("summary never upgrades first-page counts to complete coverage", () => {
  assert.deepEqual(validateProbeSummary(summary()), summary());
  const empty = summary();
  Object.assign(empty.reports[0], { returnedRows: 0, totalRows: 0, complete: true });
  const pending = { ...empty, reports: [empty.reports[0], ...empty.reports.slice(1).map(r => ({ ...r, status: "not-probed", returnedRows: null, totalRows: null }))] };
  assert.deepEqual(validateProbeSummary(pending), pending);
  assert.throws(() => validateProbeSummary(empty), /source_probe_invalid/);
});

test("forged, partial or leaking receipts fail closed", () => {
  const corruptions: ((value: ReturnType<typeof summary>) => unknown)[] = [
    v => ({ ...v, authenticated: false }), v => ({ ...v, password: "secret" }), v => ({ ...v, reports: v.reports.slice(1) }),
    v => ({ ...v, reports: [...v.reports].reverse() }), v => { v.reports[0].complete = true; return v; },
    v => { v.reports[0].returnedRows = 49; return v; }, v => { v.reports[0].totalRows = -1; return v; },
    v => { v.reports[0].totalRows = Number.MAX_SAFE_INTEGER + 1; return v; },
    v => ({ ...v, reports: v.reports.map(r => ({ ...r, rawRows: [] })) }),
    v => ({ ...v, reports: v.reports.map(r => ({ ...r, status: "not-probed", returnedRows: null, totalRows: null })) }),
  ];
  for (const corrupt of corruptions) assert.throws(() => validateProbeSummary(corrupt(summary())), /source_probe_invalid/);
});

test("source pin survives password rotation but changes with endpoint/account/operator/scope", () => {
  const fingerprint = readinessFingerprint(config);
  assert.equal(readinessFingerprint({ ...config, password: "Rotated-Only" }), fingerprint);
  for (const change of [{ baseUrl: "https://other.invalid" }, { username: "other" }, { operatorUsername: "other" }, { sourceKey: "other" }])
    assert.notEqual(readinessFingerprint({ ...config, ...change }), fingerprint);
});

test("public HTTP, mismatched identity and unverified loopback are rejected before I/O", async () => {
  await assert.rejects(probeSource({ ...config, baseUrl: "http://example.invalid" }, "a".repeat(64), true), /protected_source_transport_required/);
  await assert.rejects(probeSource(config, "a".repeat(64), false), /source_target_mismatch/);
  const loopback = { ...config, baseUrl: "http://127.0.0.1:1" };
  await assert.rejects(probeSource(loopback, readinessFingerprint(loopback), false), /verified_tunnel_required/);
});

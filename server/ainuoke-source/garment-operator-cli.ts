import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createDatabasePool } from "../db/pool.js";
import { verifyMigrationsCurrent } from "../db/migration-runner.js";
import { BootstrapGuardError, loadExistingBootstrapActor } from "../sales-orders/bootstrap-runner.js";
import { identityUuid } from "../sales-orders/identity-model.js";
import { parseCollectorConfig, type CollectorConfig } from "./collector.js";
import { hash, SourceError } from "./contract.js";
import { garmentFilterConfig, validateGarmentFilterEvidence, type GarmentFilterSelection } from "./garment-contract-verification.js";
import { assertExactSourceJsonRuntime, strictExactSourceJson } from "./exact-source-json.js";
import { assertPrivateOutput, writePrivateReport } from "./live-preflight.js";
import { readPaymentCredential, readPaymentPrivateFile } from "./payment-private-files.js";
import { collectGarmentOnce, planGarmentCollection, readGarmentCollectionReceipt,
  type GarmentCollectionRequest } from "./garment-collection-control.js";

const fail = (code: string): never => { throw new SourceError(code); };
const sha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const actions = ["plan-collection", "collect-once", "receipt"] as const;
type Action = typeof actions[number];
function iso(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
export function garmentOperatorArguments(args: string[]) {
  const values = new Map<string, string>();
  for (const arg of args) {
    const match = /^--([a-z-]+)=(.+)$/u.exec(arg);
    if (!match || values.has(match[1])) return fail("garment_operator_explicit_action_required");
    values.set(match[1], match[2]);
  }
  const selected = actions.filter(action => values.has(action));
  if (selected.length !== 1) fail("garment_operator_explicit_action_required");
  const action = selected[0];
  const allowed = [action, "job", "expected-job", "private-output", "request-id",
    ...(action !== "receipt" ? ["expires-at"] : []),
    ...(action === "collect-once" ? ["scope-hash", "execute", "credential-file"] : [])];
  if ([...values.keys()].some(key => !allowed.includes(key)) || values.get(action) !== "6086979"
    || !isAbsolute(values.get("job") ?? "") || !sha(values.get("expected-job"))
    || !isAbsolute(values.get("private-output") ?? "") || !identityUuid.test(values.get("request-id") ?? "")
    || action !== "receipt" && !iso(values.get("expires-at"))
    || action === "collect-once" && (!sha(values.get("scope-hash")) || values.get("execute") !== "I_CONFIRM_EXACT_SCOPE"
      || !isAbsolute(values.get("credential-file") ?? ""))) fail("garment_operator_explicit_action_required");
  values.set("request-id", values.get("request-id")!.toLowerCase());
  return { action, values };
}

export function parseGarmentOperatorJob(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail("garment_operator_invalid_job");
  const job = input as Record<string, unknown>;
  if (Object.keys(job).sort().join(",") !== "databaseUrl,operatorUsername,salesOrderId,schemaVersion,source,verification"
    || job.schemaVersion !== "ainuoke-garment-operator-job.v1" || typeof job.databaseUrl !== "string"
    || typeof job.salesOrderId !== "string" || !identityUuid.test(job.salesOrderId)
    || !job.source || typeof job.source !== "object" || Array.isArray(job.source)) return fail("garment_operator_invalid_job");
  const source = job.source as Record<string, unknown>;
  if (!["baseUrl,sourceKey,username", "baseUrl,sourceKey,transportPolicy,username"].includes(Object.keys(source).sort().join(",")))
    return fail("garment_operator_invalid_job");
  let uri: URL;
  try { uri = new URL(job.databaseUrl); } catch { return fail("garment_operator_invalid_job"); }
  if (!["postgres:", "postgresql:"].includes(uri.protocol) || !uri.hostname || !uri.username || uri.pathname.length < 2 || uri.hash
    || job.databaseUrl.length > 4096 || /[\u0000-\u001f\u007f]/u.test(job.databaseUrl)) return fail("garment_operator_invalid_job");
  const config = parseCollectorConfig({ ...source, operatorUsername: job.operatorUsername, password: "NOT-LOADED-FOR-PLAN" });
  let verification: { path: string; sha256: string } | null = null;
  if (job.verification !== null) {
    const value = job.verification as Record<string, unknown>;
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "path,sha256"
      || typeof value.path !== "string" || !isAbsolute(value.path) || !sha(value.sha256)) return fail("garment_operator_invalid_job");
    verification = { path: value.path, sha256: value.sha256 };
  }
  return { databaseUrl: job.databaseUrl, config, salesOrderId: job.salesOrderId.toLowerCase(), verification };
}

/** Validate duplicate decoded keys without changing the proof's framing integers.
 * The controller still reparses every upstream raw JSON number without rounding. */
export function readGarmentOperatorJson(path: string, expectedSha256: string, limit: number) {
  const text = readPaymentPrivateFile(path, limit, { expectedSha256, ignoredReport: true });
  strictExactSourceJson(text, "garment_operator_invalid_json");
  try { return JSON.parse(text) as unknown; } catch { return fail("garment_operator_invalid_json"); }
}

/** Consume the original diagnostic/recovery producer's complete private file.
 * Rebuild every wrapper field at its original checkedAt, rather than trusting
 * a copied validation label or stamping old observations with the current time. */
export function parseGarmentOperatorVerification(input: unknown, config: CollectorConfig, now = Date.now()): GarmentCollectionRequest["verification"] {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) return fail("garment_operator_verification_invalid");
    const value = input as Record<string, unknown>;
    if (Object.keys(value).sort().join(",") !== "businessSnapshotPublication,checkedAt,databaseAccess,evidence,queryManifest,rawNumericTextIsAuthoritative,reportId,schemaVersion,selection,sourceActivation,toolingCommit,validationCode,validationStatus"
      || typeof value.toolingCommit !== "string" || !/^[a-f0-9]{40}$/u.test(value.toolingCommit) || !iso(value.checkedAt)
      || !Number.isFinite(now) || Date.parse(value.checkedAt) > now) return fail("garment_operator_verification_invalid");
    const selection = value.selection as GarmentFilterSelection;
    const verified = validateGarmentFilterEvidence(value.evidence, garmentFilterConfig(config, selection), selection, Date.parse(value.checkedAt));
    const { toolingCommit, ...wrapper } = value; void toolingCommit;
    if (verified.summary.result !== "SCOPED_FILTER_OBSERVED" || hash(wrapper) !== hash(verified.privateReport))
      return fail("garment_operator_verification_invalid");
    return { selection, evidence: value.evidence, checkedAt: value.checkedAt };
  } catch { return fail("garment_operator_verification_invalid"); }
}

/** Closed public projection. An unverified COMMIT can contain a provisional
 * published outcome; it must never be presented as a successful publication. */
export function garmentOperatorSummary(action: Action, requestId: string, value: Record<string, unknown>) {
  if (action === "plan-collection") return {
    schemaVersion: "ainuoke-garment-operator.v1", result: "READ_ONLY_PLAN_RECORDED", action, requestId,
    scopeHash: value.scopeHash, expiresAt: value.expiresAt, humanApproval: "still_required",
    sourceReadThisInvocation: "none", databaseWrites: "none", automaticRetry: false,
  };
  const completed = value.receiptState === "completed";
  const outcome = completed && value.result && typeof value.result === "object" ? value.result as Record<string, unknown> : null;
  const published = outcome?.outcome === "published";
  return {
    schemaVersion: "ainuoke-garment-operator.v1",
    result: published ? "COLLECTION_PUBLISHED" : completed ? "COLLECTION_NOT_PUBLISHED" : "COLLECTION_UNVERIFIED",
    action, requestId, receiptState: value.receiptState, replayed: value.replayed === true,
    receiptIsHistorical: action === "receipt" || value.receiptIsHistorical === true,
    sourceReadThisInvocation: value.sourceReadThisInvocation,
    requestCounts: completed ? outcome?.requestCounts : "unknown",
    ...(published ? { publicationId: outcome.publicationId, snapshotId: outcome.snapshotId, generation: outcome.generation } : {}),
    ...(value.receiptState === "unknown" ? { absenceProvesNoPriorWork: false } : {}),
    nextAction: completed ? "none" : "inspect_original_request", automaticRetry: false,
    databaseWrites: action === "receipt" ? "none" : "explicit_action_only",
  };
}
export const garmentOperatorExitCode = (output: { result: string }) =>
  ["READ_ONLY_PLAN_RECORDED", "COLLECTION_PUBLISHED"].includes(output.result) ? 0 : output.result === "FAIL" ? 1 : 2;

/** Testable orchestration of the existing one-shot service. Only in-process
 * engineering tests may inject a clock/worker; the executable has no such flag. */
export async function runGarmentOperator(parsed: ReturnType<typeof garmentOperatorArguments>, toolingCommit: string,
  options: Parameters<typeof collectGarmentOnce>[4] = {}) {
  if (!/^[a-f0-9]{40}$/u.test(toolingCommit)) fail("garment_operator_committed_clean_worktree_required");
  assertExactSourceJsonRuntime();
  const { action, values } = parsed, now = options.now ?? Date.now;
  assertPrivateOutput(values.get("private-output")!);
  const job = parseGarmentOperatorJob(readGarmentOperatorJson(values.get("job")!, values.get("expected-job")!, 65536));
  const requestId = values.get("request-id")!;
  const pool = createDatabasePool({ connectionString: job.databaseUrl, max: 2, applicationName: "zhixu-garment-operator" });
  pool.options.statement_timeout = 15000; pool.options.query_timeout = 20000;
  let result: Record<string, unknown>;
  try {
    // Verify only: never migrate, bootstrap an account, bind or enable a target.
    await verifyMigrationsCurrent(pool, resolve("database/migrations"));
    const actor = await loadExistingBootstrapActor(pool, job.config.operatorUsername).catch(error => {
      if (error instanceof BootstrapGuardError) return fail("garment_operator_actor_unavailable");
      throw error;
    });
    if (action === "receipt") {
      // Recovery deliberately does not open verification/credential files, build
      // a new plan or require the original target to remain enabled.
      result = await readGarmentCollectionReceipt(pool, actor, { sourceKey: job.config.sourceKey, salesOrderId: job.salesOrderId, requestId });
    } else {
      const proofFile = job.verification;
      if (!proofFile) return fail("garment_operator_verification_required");
      const verification = parseGarmentOperatorVerification(readGarmentOperatorJson(proofFile.path, proofFile.sha256, 48 * 1024 * 1024), job.config, now());
      const request: GarmentCollectionRequest = { config: job.config, salesOrderId: job.salesOrderId, verification };
      const expiresAt = values.get("expires-at")!;
      if (action === "plan-collection") result = await planGarmentCollection(pool, actor, request, { requestId, expiresAt }, now());
      else {
        const permit = { requestId, expiresAt, scopeHash: values.get("scope-hash")! };
        const existing = await readGarmentCollectionReceipt(pool, actor, { sourceKey: job.config.sourceKey, salesOrderId: job.salesOrderId, requestId });
        if (existing.receiptState === "unknown") {
          const plan = await planGarmentCollection(pool, actor, request, { requestId, expiresAt }, now());
          if (plan.scopeHash !== permit.scopeHash) fail("garment_operator_scope_changed");
          job.config.password = readPaymentCredential(values.get("credential-file")!, job.config.username);
        }
        result = await collectGarmentOnce(pool, actor, request, permit, options);
      }
    }
  } finally { job.config.password = "CLEARED"; await pool.end().catch(() => undefined); }
  // Keep the shared secret inspector strict; only rename this literal disclaimer.
  if (result.authorization === "not_granted_by_plan") {
    const { authorization, ...facts } = result; void authorization; result = { ...facts, humanApproval: "still_required" };
  }
  let report: ReturnType<typeof writePrivateReport>;
  try {
    report = writePrivateReport(values.get("private-output")!, { schemaVersion: "ainuoke-garment-operator-private.v1", toolingCommit,
      action, requestId, jobSha256: values.get("expected-job"), result }, "garment-operator");
  } catch {
    return { schemaVersion: "ainuoke-garment-operator.v1", result: "PRIVATE_REPORT_UNAVAILABLE", action, requestId,
      nextAction: "inspect_original_request", receiptState: "inspect_durable_receipt_before_any_retry", automaticRetry: false };
  }
  return { ...garmentOperatorSummary(action, requestId, result), ...report };
}

export function assertGarmentOperatorCheckout() {
  try {
    const normalized = (path: string) => process.platform === "win32" ? realpathSync.native(path).toLowerCase() : realpathSync.native(path);
    const actual = fileURLToPath(import.meta.url), entry = "server/ainuoke-source/garment-operator-cli.ts";
    if (normalized(actual) !== normalized(resolve(entry))) return fail("garment_operator_committed_clean_worktree_required");
    const git = (args: string[]) => execFileSync("git", args, { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 262144 }).trimEnd();
    const head = git(["rev-parse", "--verify", "HEAD"]);
    if (!/^[a-f0-9]{40}$/u.test(head) || git(["status", "--porcelain", "--untracked-files=normal"]))
      return fail("garment_operator_committed_clean_worktree_required");
    const committed = git(["show", head + ":" + entry]);
    if (readFileSync(actual, "utf8").replace(/\r\n/g, "\n").trimEnd() !== committed.replace(/\r\n/g, "\n"))
      return fail("garment_operator_committed_clean_worktree_required");
    return head;
  } catch { return fail("garment_operator_committed_clean_worktree_required"); }
}
const safeCodes = new Set(["garment_operator_explicit_action_required", "garment_operator_invalid_job", "garment_operator_invalid_json",
  "garment_operator_committed_clean_worktree_required", "garment_operator_verification_required", "garment_operator_verification_invalid", "garment_operator_scope_changed",
  "payment_operator_private_file_invalid", "preflight_private_output_required", "source_exact_runtime_required", "pending_migrations",
  "garment_operator_actor_unavailable", "authentication_required", "permission_denied", "garment_collection_invalid_request", "garment_collection_invalid_permit",
  "garment_collection_permit_expired", "garment_collection_request_conflict", "garment_collection_operator_mismatch",
  "garment_collection_filter_scope_mismatch", "garment_collection_scope_changed", "garment_collection_receipt_integrity_failed",
  "garment_source_not_connected", "garment_binding_changed", "garment_binding_unavailable", "garment_order_not_available"]);
export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write("6086979 operator: --plan-collection=6086979, --collect-once=6086979 or --receipt=6086979.\nAll require --job=<absolute protected JSON> --expected-job=<SHA256> --private-output=<protected ignored directory> --request-id=<UUID>.\nPlan/collect require --expires-at=<UTC ISO>; collect also --scope-hash=<exact plan> --execute=I_CONFIRM_EXACT_SCOPE --credential-file=<private local file>.\nA plan/hash does not grant Source authorization. No target enable, migrations, bootstrap, scheduler, automatic retries or deployments. Receipt needs no verification/credential file.\n"); return;
  }
  try {
    const parsed = garmentOperatorArguments(args);
    const output = await runGarmentOperator(parsed, assertGarmentOperatorCheckout());
    process.stdout.write(JSON.stringify(output) + "\n"); process.exitCode = garmentOperatorExitCode(output);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" && safeCodes.has(error.code)
      ? error.code : "garment_operator_unavailable";
    process.stdout.write(JSON.stringify({ schemaVersion: "ainuoke-garment-operator.v1", result: "FAIL", code, automaticRetry: false }) + "\n"); process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();

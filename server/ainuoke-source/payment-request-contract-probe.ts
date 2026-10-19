import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { openSync, readSync, closeSync, lstatSync, fstatSync, constants } from "node:fs";
import { resolve, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY, accountFingerprint, parseCollectorConfig, type CollectorConfig } from "./collector.js";
import { SourceError, hash, inspect } from "./contract.js";
import { assertPrivateOutput, writePrivateReport } from "./live-preflight.js";
import { CANDIDATE_FIELDS } from "./payment-request-fields.js";

export const CONTRACT_LIMITS = Object.freeze({ contracts: 2, pagesPerContract: 2, pageSize: 100,
  passes: 2, reportRequests: 8, httpAttempts: 9, responseBytes: 4 * 1024 * 1024,
  totalReportBytes: 16 * 1024 * 1024, workerBytes: 96 * 1024 * 1024, timeoutMs: 180000 });
type Obj = Record<string, unknown>;
export type ContractSelection = { schemaVersion: "ainuoke-payment-contract-selection.v1"; sourceFingerprint: string;
  samplesSha256: string; targets: Array<{ alias: string; salesContractNo: string; witness: { id: string; BillNo: string; PurContractNo: string } }> };
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const sha = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
function fail(code: string): never { throw new SourceError(code); }
function object(value: unknown): Obj { if (!value || typeof value !== "object" || Array.isArray(value)) fail("payment_contract_invalid_evidence"); return value as Obj; }
function exactKeys(value: Obj, names: string) { if (Object.keys(value).sort().join(",") !== names.split(",").sort().join(",")) fail("payment_contract_invalid_evidence"); }
const idText = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9/._-]{0,79}$/u.test(value);

export function selectionFromPrivateSamples(input: unknown, samplesSha256: string): ContractSelection {
  const value = object(input); inspect(value);
  if (value.schemaVersion !== "ainuoke-payment-row-confirmation-private.v1"
    || value.scope !== "two-exact-source-observations-only" || !sha(value.originalPrivateReportSha256)
    || !sha(samplesSha256) || !Array.isArray(value.rows) || value.rows.length !== 2) fail("payment_contract_selection_invalid");
  const rows = value.rows.map(object), fingerprint = rows[0].sourceFingerprint;
  if (!sha(fingerprint)) fail("payment_contract_selection_invalid");
  const targets = rows.map((row, index) => {
    const sourceId = object(row.sourceRecordId);
    if (row.alias !== "S" + (index + 1) || row.reportId !== "6086941" || row.sourceFingerprint !== fingerprint
      || !sha(row.rawResponseSha256) || !sha(row.rowContentHash) || sourceId.state !== "known"
      || !idText(sourceId.raw) || !idText(row.applicationNo) || !idText(row.purchaseContractNo)
      || typeof row.salesContractNo !== "string" || !/^[A-Z0-9][A-Z0-9/._-]{0,79}$/u.test(row.salesContractNo))
      fail("payment_contract_selection_invalid");
    return { alias: row.alias as string, salesContractNo: row.salesContractNo,
      witness: { id: sourceId.raw, BillNo: row.applicationNo as string, PurContractNo: row.purchaseContractNo as string } };
  });
  if (targets[0].salesContractNo === targets[1].salesContractNo) fail("payment_contract_selection_invalid");
  return { schemaVersion: "ainuoke-payment-contract-selection.v1", sourceFingerprint: fingerprint, samplesSha256, targets };
}
export function readPrivateSamples(path: string, expectedHash: string) {
  if (!isAbsolute(path) || !sha(expectedHash)) fail("payment_contract_samples_invalid");
  assertPrivateOutput(dirname(path));
  if (process.platform === "win32")
    execFileSync("pwsh", ["-NoProfile", "-NonInteractive", "-File", resolve("scripts/ainuoke-live-preflight.ps1"),
      "-ValidateOnly", "-PrivateDirectory", dirname(path), "-PrivateFile", path], { windowsHide: true, stdio: "ignore", timeout: 15000 });
  let fd: number | undefined;
  try {
    const before = lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink() || before.size > 256 * 1024
      || process.platform !== "win32" && ((before.mode & 0o077) !== 0 || before.uid !== process.getuid?.())) fail("payment_contract_samples_invalid");
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const actual = fstatSync(fd);
    if (!actual.isFile() || actual.ino !== before.ino || actual.dev !== before.dev || actual.size !== before.size) fail("payment_contract_samples_invalid");
    const bytes = Buffer.alloc(256 * 1024 + 1), length = readSync(fd, bytes, 0, bytes.length, 0), content = bytes.subarray(0, length);
    if (length !== actual.size || digest(content) !== expectedHash) fail("payment_contract_samples_invalid");
    return selectionFromPrivateSamples(JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(content)), expectedHash);
  } finally { if (fd !== undefined) closeSync(fd); }
}
function assertSelection(selection: ContractSelection) {
  const value = object(selection); exactKeys(value, "schemaVersion,sourceFingerprint,samplesSha256,targets");
  if (value.schemaVersion !== "ainuoke-payment-contract-selection.v1" || !sha(value.sourceFingerprint) || !sha(value.samplesSha256)
    || !Array.isArray(value.targets) || value.targets.length !== 2) fail("payment_contract_selection_invalid");
  const targets = value.targets.map((item, index) => {
    const target = object(item); exactKeys(target, "alias,salesContractNo,witness");
    const witness = object(target.witness); exactKeys(witness, "id,BillNo,PurContractNo");
    if (target.alias !== "S" + (index + 1) || typeof target.salesContractNo !== "string" || !/^[A-Z0-9][A-Z0-9/._-]{0,79}$/u.test(target.salesContractNo)
      || Object.values(witness).some(v => !idText(v))) fail("payment_contract_selection_invalid");
    return target.salesContractNo;
  });
  if (targets[0] === targets[1]) fail("payment_contract_selection_invalid");
}
/** Internal scope check, also used before an explicitly controlled collection. */
export function configForSelection(input: unknown, selection: ContractSelection): CollectorConfig {
  assertSelection(selection);
  const config = parseCollectorConfig(input);
  if (config.baseUrl !== APPROVED_HTTP_ORIGIN || config.transportPolicy !== APPROVED_HTTP_POLICY
    || selection.sourceFingerprint !== accountFingerprint(config)) fail("payment_contract_account_mismatch");
  return config;
}
export async function collectPaymentContracts(input: unknown, selection: ContractSelection, options: {
  pythonCommand?: string; timeoutMs?: number; spawnWorker?: typeof spawn;
} = {}): Promise<unknown> {
  const config = configForSelection(input, selection);
  // Refuse unsupported JSON source-text runtimes before sending any credential.
  if (parseExact("9007199254740993") !== "9007199254740993") fail("payment_contract_exact_runtime_required");
  return new Promise((accept, reject) => {
    const child = (options.spawnWorker ?? spawn)(options.pythonCommand ?? (process.platform === "win32" ? "python" : "python3"),
      ["-m", "ainuoke_bridge.payment_request_contract_probe", "--stdin-request"],
      { cwd: resolve("tools/ainuoke-bridge"), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let settled = false, size = 0; const chunks: Buffer[] = [];
    const stop = (code: string) => { if (settled) return; settled = true; clearTimeout(timer); child.kill(); reject(new SourceError(code)); };
    const timer = setTimeout(() => stop("payment_contract_timeout"), Math.min(options.timeoutMs ?? CONTRACT_LIMITS.timeoutMs, CONTRACT_LIMITS.timeoutMs));
    child.stdout.on("data", (chunk: Buffer) => { size += chunk.length; if (size > CONTRACT_LIMITS.workerBytes) stop("payment_contract_worker_limit"); else chunks.push(chunk); });
    child.stderr.resume(); child.on("error", () => stop("payment_contract_worker_unavailable")); child.stdin.on("error", () => stop("payment_contract_worker_unavailable"));
    child.on("close", exitCode => {
      if (settled) return;
      try { const result: unknown = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(Buffer.concat(chunks)));
        const envelope = object(result);
        if (!(exitCode === 0 && envelope.result === "complete" || exitCode === 1 && envelope.result === "failed")) { stop("payment_contract_worker_invalid"); return; }
        settled = true; clearTimeout(timer); accept(result);
      } catch { stop("payment_contract_worker_invalid"); }
    });
    child.stdin.end(JSON.stringify({ baseUrl: config.baseUrl, username: config.username, password: config.password,
      transportPolicy: config.transportPolicy, action: "read-two-verified-contracts", selection }));
  });
}
function parseExact(text: string): unknown {
  const parser = JSON.parse as (text: string, reviver: (key: string, value: unknown, context?: { source?: string }) => unknown) => unknown;
  return parser(text, (_key, value, context) => {
    if (typeof value !== "number") return value;
    if (typeof context?.source !== "string") fail("payment_contract_exact_runtime_required");
    return context.source;
  });
}
function decoded(value: unknown): Obj { return object(typeof value === "string" ? parseExact(value) : value); }
function count(value: unknown) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value) || !Number.isSafeInteger(Number(value))) fail("payment_contract_count_mismatch");
  return Number(value);
}
const safeCodes = new Set(("payment_contract_input_invalid payment_contract_selection_invalid payment_contract_account_mismatch payment_contract_scope_refused payment_contract_response_limit payment_contract_identity_mismatch payment_contract_count_mismatch payment_contract_page_limit payment_contract_repeated_page payment_contract_source_changed payment_contract_witness_missing payment_contract_empty_unverified payment_contract_paging_mismatch payment_contract_failed payment_observation_duplicate_json_key payment_observation_invalid_json payment_observation_invalid_shape payment_observation_invalid_count redirect_refused auth_expired invalid_credential network_unavailable upstream_http_error upstream_schema_error payment_probe_endpoint_refused payment_probe_scope_refused payment_probe_request_limit payment_probe_response_limit payment_probe_invalid_json payment_probe_invalid_metadata payment_probe_structure_limit payment_probe_secret_field payment_probe_secret_reflection payment_probe_invalid_number payment_probe_page_limit payment_probe_report_mismatch payment_probe_report_metadata_invalid_json payment_probe_report_metadata_shape payment_probe_column_metadata_invalid_json payment_probe_column_metadata_shape").split(" "));
export const CONTRACT_FAILURE_CODES = Object.freeze([...safeCodes, "payment_contract_timeout", "payment_contract_worker_limit", "payment_contract_worker_unavailable", "payment_contract_worker_invalid", "payment_contract_invalid_evidence", "payment_contract_exact_runtime_required", "payment_contract_samples_invalid", "payment_contract_explicit_scope_required", "payment_contract_clean_commit_required", "source_secret_field"]);
function safeEvidence(input: unknown, config: CollectorConfig, selection: ContractSelection, now: number) {
  const value = object(input);
  exactKeys(value, "schemaVersion,result,code,workerStage,selectionHash,httpAttempts,reportRequests,pages");
  if (value.schemaVersion !== "ainuoke-payment-contract-evidence.v1" || !["complete", "failed"].includes(String(value.result))
    || value.selectionHash !== hash(selection) || !["not-started", "login", "report", "validation"].includes(String(value.workerStage))
    || !Number.isSafeInteger(value.httpAttempts) || (value.httpAttempts as number) < 0 || (value.httpAttempts as number) > 9
    || !Number.isSafeInteger(value.reportRequests) || (value.reportRequests as number) < 0 || (value.reportRequests as number) > 8
    || ![0, 1].includes((value.httpAttempts as number) - (value.reportRequests as number))
    || !Array.isArray(value.pages) || value.pages.length > 8 || value.pages.length > (value.reportRequests as number)
    || value.result === "complete" && (value.code !== null || value.workerStage !== "validation")
    || value.result === "failed" && (typeof value.code !== "string" || !safeCodes.has(value.code))) fail("payment_contract_invalid_evidence");
  let totalBytes = 0;
  const pages = value.pages.map(item => {
    const page = object(item);
    exactKeys(page, "alias,pass,page,capturedAt,rawReportResponse,rawResponseSha256");
    if (!["S1", "S2"].includes(String(page.alias)) || ![1, 2].includes(page.pass as number) || ![1, 2].includes(page.page as number)
      || typeof page.rawReportResponse !== "string" || Buffer.byteLength(page.rawReportResponse, "utf8") > CONTRACT_LIMITS.responseBytes
      || page.rawResponseSha256 !== digest(page.rawReportResponse) || typeof page.capturedAt !== "string"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/u.test(page.capturedAt)
      || !Number.isFinite(Date.parse(page.capturedAt)) || new Date(page.capturedAt).toISOString().slice(0,10) !== page.capturedAt.slice(0,10) || Date.parse(page.capturedAt) > now
      || now - Date.parse(page.capturedAt) > CONTRACT_LIMITS.timeoutMs) fail("payment_contract_invalid_evidence");
    totalBytes += Buffer.byteLength(page.rawReportResponse, "utf8");
    const raw = decoded(page.rawReportResponse), data: Obj = raw.dataList == null ? {} : decoded(raw.dataList);
    const meta: Obj = raw.reportObj == null ? {} : decoded(raw.reportObj);
    if (typeof meta.cellList === "string" && meta.cellList.trim()) meta.cellList = parseExact(meta.cellList);
    for (const part of [raw, data, meta]) {
      inspect(part); if (JSON.stringify(part).includes(config.password)) fail("source_secret_field");
    }
    return { ...page, alias: page.alias, pass: page.pass, page: page.page,
      capturedAt: page.capturedAt, rawResponseSha256: page.rawResponseSha256, raw, data, meta };
  });
  if (totalBytes > CONTRACT_LIMITS.totalReportBytes) fail("payment_contract_response_limit");
  return { value, pages };
}
export function validateContractEvidence(input: unknown, configInput: unknown, selection: ContractSelection, now = Date.now()) {
  if (!Number.isFinite(now) || now < 0) fail("payment_contract_invalid_evidence");
  const config = configForSelection(configInput, selection);
  const checked = safeEvidence(input, config, selection, now), { value, pages } = checked;
  const privateBase = { schemaVersion: "ainuoke-payment-contract-private.v1", sourceFingerprint: accountFingerprint(config),
    selection, selectionHash: hash(selection), evidence: input, databaseAccess: "none", sourceActivation: "not-activated" };
  function failure(code: string) {
    return { summary: { schemaVersion: "ainuoke-payment-contract-probe.v1", result: "FAIL", code, reportId: "6086941", sourceFingerprint: selection.sourceFingerprint, samplesSha256: selection.samplesSha256, selectionHash: hash(selection),
      httpAttempts: value.httpAttempts as number, reportRequests: value.reportRequests as number,
      workerStage: value.workerStage as string, databaseAccess: "none", sourceActivation: "not-activated" },
      privateReport: { ...privateBase, validationStatus: "rejected", failureCode: code } };
  }
  if (value.result === "failed") return failure(value.code as string);
  try {
    const contracts = [], allowed = new Set(CANDIDATE_FIELDS); let index = 0;
    const originals = new Map<string, { total: number; rows: Obj[] }>();
    for (const pass of [1, 2]) for (const target of selection.targets) {
      const rows: Obj[] = [], pageHashes = new Set<string>(); let total: number | null = null, requestedPage = 1;
      while (true) {
        const page = pages[index++];
        if (!page || page.alias !== target.alias || page.pass !== pass || page.page !== requestedPage
          || object(page.raw.reObj).isOk !== true || page.meta.reportId !== "6086941"
          || page.raw.reportId !== undefined && page.raw.reportId !== "6086941") fail("payment_contract_identity_mismatch");
        const reported = count(Object.hasOwn(page.raw, "dataCount") ? page.raw.dataCount : page.data.total);
        if (reported < 1) fail("payment_contract_empty_unverified");
        if (reported > 200) fail("payment_contract_page_limit");
        if (total !== null && total !== reported) fail("payment_contract_source_changed");
        total = reported;
        if (![0, requestedPage].includes(count(page.raw.pageIndex)) || ![0, 100].includes(count(page.raw.pageSize))) fail("payment_contract_paging_mismatch");
        if (!Array.isArray(page.data.rows) || page.data.rows.length !== Math.min(100, total - (requestedPage - 1) * 100)) fail("payment_contract_count_mismatch");
        const currentRows = page.data.rows.map(item => {
          const row = object(item);
          if (row.ExpContractNo !== target.salesContractNo || Object.keys(row).some(key => !allowed.has(key))
            || Object.values(row).some(v => v !== null && (typeof v !== "string" || v.length > 2048))) fail("payment_contract_identity_mismatch");
          return row;
        });
        const pageHash = hash(currentRows);
        if (pageHashes.has(pageHash)) fail("payment_contract_repeated_page");
        pageHashes.add(pageHash); rows.push(...currentRows);
        if (requestedPage * 100 >= total) break;
        requestedPage++;
      }
      if (!rows.some(row => Object.entries(target.witness).every(([key, expected]) => row[key] === expected))) fail("payment_contract_witness_missing");
      if (pass === 1) { originals.set(target.alias, { total, rows }); contracts.push({ alias: target.alias, salesContractNo: target.salesContractNo, total, rows }); }
      else if (hash(originals.get(target.alias)) !== hash({ total, rows })) fail("payment_contract_source_changed");
    }
    if (index !== pages.length || value.reportRequests !== index || value.httpAttempts !== index + 1) fail("payment_contract_count_mismatch");
    return { summary: { schemaVersion: "ainuoke-payment-contract-probe.v1", result: "READ_ONLY_CONTRACT_PROBE_RECORDED",
      reportId: "6086941", sourceFingerprint: selection.sourceFingerprint, samplesSha256: selection.samplesSha256, selectionHash: hash(selection),
      selectedContracts: 2, contractSummaries: contracts.map(c => ({ alias: c.alias, rowCount: c.total, pageCount: Math.ceil(c.total! / 100), contentHash: hash(c.rows) })),
      httpAttempts: value.httpAttempts as number, reportRequests: value.reportRequests as number,
      collectionValidation: "complete-selected-contracts", queryValidation: "two-positive-contracts-two-pass-row-parity",
      consistencyScope: "two-pass-observed-rows-not-upstream-transaction", databaseAccess: "none", sourceActivation: "not-activated",
      mappingVerified: false, bankPaymentStatus: "not-inferred" },
      privateReport: { ...privateBase, validationStatus: "accepted", contracts } };
  } catch (error) { return failure(error instanceof SourceError && safeCodes.has(error.code) ? error.code : "payment_contract_invalid_evidence"); }
}
/** Extract only after the existing raw-response, scope, count and two-pass checks.
 * No caller-built rows or old private receipt are accepted as a new capture. */
export function paymentContractSnapshotInputs(input: unknown, configInput: unknown, selection: ContractSelection, now = Date.now()) {
  const config = configForSelection(configInput, selection);
  const result = validateContractEvidence(input, config, selection, now);
  if (result.privateReport.validationStatus !== "accepted")
    fail("code" in result.summary ? result.summary.code : "payment_contract_invalid_evidence");
  const { pages } = safeEvidence(input, config, selection, now);
  return selection.targets.map(target => {
    const pageInput = (pass: number) => pages.filter(page => page.alias === target.alias && page.pass === pass).map(page => ({
      schemaVersion: "ainuoke-payment-observation-page.v2" as const, reportId: "6086941" as const,
      sourceFingerprint: selection.sourceFingerprint, capturedAt: page.capturedAt as string,
      page: page.page as number, pageSize: 100 as const,
      reportedTotal: count(Object.hasOwn(page.raw, "dataCount") ? page.raw.dataCount : page.data.total),
      rawResponseSha256: page.rawResponseSha256 as string, rows: page.data.rows as Array<Record<string, string | null>>,
    }));
    return { alias: target.alias,
      scope: { sourceFingerprint: selection.sourceFingerprint, salesContractNo: target.salesContractNo, witness: structuredClone(target.witness) },
      input: { schemaVersion: "ainuoke-payment-contract-snapshot-input.v1" as const, firstPass: pageInput(1), secondPass: pageInput(2) } };
  });
}
export function contractProbeArguments(args: string[]) {
  const output = args.find(a => a.startsWith("--private-output="))?.slice(17);
  const samples = args.find(a => a.startsWith("--samples-file="))?.slice(15);
  const expected = args.find(a => a.startsWith("--expected-samples="))?.slice(19);
  if (args.length !== 5 || new Set(args).size !== 5 || !args.includes("--run-read-contracts") || !args.includes("--stdin-config")
    || !output || !isAbsolute(output) || !samples || !isAbsolute(samples) || !sha(expected)) fail("payment_contract_explicit_scope_required");
  return { privateOutput: output, samplesFile: samples, expectedSamples: expected };
}
export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === "--help") { process.stdout.write("Fixed 6086941, two verified samples, <=2 pages/contract, two passes; no DB or activation.\n"); return; }
  let stage = "arguments";
  try {
    const parsed = contractProbeArguments(args);
    stage = "private_output"; assertPrivateOutput(parsed.privateOutput);
    stage = "worktree";
    const toolingCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
    if (!/^[a-f0-9]{40}$/u.test(toolingCommit) || execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { encoding: "utf8", windowsHide: true }).trim())
      fail("payment_contract_clean_commit_required");
    stage = "samples"; const selection = readPrivateSamples(parsed.samplesFile, parsed.expectedSamples);
    stage = "configuration"; let size = 0; const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) { size += chunk.length; if (size > 16384) fail("invalid_collector_configuration"); chunks.push(Buffer.from(chunk)); }
    const config = configForSelection(JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(Buffer.concat(chunks))), selection);
    stage = "collection"; const evidence = await collectPaymentContracts(config, selection);
    stage = "validation"; const result = validateContractEvidence(evidence, config, selection);
    stage = "report_write"; const receipt = writePrivateReport(parsed.privateOutput, { ...result.privateReport, toolingCommit }, "payment-request");
    process.stdout.write(JSON.stringify({ ...result.summary, toolingCommit, ...receipt, evidenceRetained: true }) + "\n");
    if (result.summary.result === "FAIL") process.exitCode = 1;
  } catch (error) {
    const code = error instanceof SourceError && CONTRACT_FAILURE_CODES.includes(error.code) ? error.code : "payment_contract_failed";
    process.stdout.write(JSON.stringify({ schemaVersion: "ainuoke-payment-contract-probe.v1", result: "FAIL", code, stage,
      databaseAccess: "none", sourceActivation: "not-activated" }) + "\n"); process.exitCode = 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) void main();

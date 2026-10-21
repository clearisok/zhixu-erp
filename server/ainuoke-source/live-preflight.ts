import { execFileSync } from "node:child_process";
import { constants, closeSync, fstatSync, lstatSync, openSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { previewBindings, type BindingBundle } from "./binding.js";
import { APPROVED_HTTP_POLICY, collectWithPython, parseCollectorConfig, type CollectorConfig } from "./collector.js";
import { discoveryContentHash, inspect, SourceError, validateBundle, type SourceBundle } from "./contract.js";
import { readinessFingerprint } from "./readiness.js";
import { projectMaterialProgress } from "../../features/ainuoke-material-progress/projection.js";

export const PREFLIGHT_LIMITS = { workerTimeoutMs: 600000, sourceMaxAgeMs: 600000, maxContracts: 1000, pageSize: 50,
  maxPagesPerReport: 200, maxRowsPerWorker: 100000, maxBytesPerWorker: 32 * 1024 * 1024 } as const;
type Collect = (config: CollectorConfig, contracts: string[], options: { mode?: "bindings"; timeoutMs: number }) => Promise<unknown>;
const streams = ["purchases", "inbounds", "shipments", "outbounds"] as const;
const quantityKeys = { purchases: "purchased", inbounds: "inbound", shipments: "shipped", outbounds: "outbound" } as const;
const safeErrors = new Set(["source_timeout", "source_limit", "source_unavailable", "invalid_credential", "auth_expired",
  "source_collector_unavailable", "discovery_changed", "preflight_discovery_changed", "preflight_scope_mismatch",
  "binding_quantity_missing", "binding_date_invalid", "binding_scope_limit", "source_stale_or_invalid"]);
const errorCode = (error: unknown) => error instanceof SourceError && safeErrors.has(error.code)
  ? error.code : "preflight_collection_or_validation_failed";

function metrics(bundle: BindingBundle | SourceBundle) {
  const detail = "colors" in bundle ? bundle.colors : bundle.materials;
  const pages = [...bundle.discoveryBefore, ...bundle.discoveryAfter, ...Object.values(detail).flat()];
  if (pages.some(page => page.pageSize !== PREFLIGHT_LIMITS.pageSize)) throw new SourceError("source_limit");
  const rowCount = pages.reduce((sum, page) => sum + page.rows.length, 0);
  const serializedBytes = Buffer.byteLength(JSON.stringify(bundle), "utf8");
  if (rowCount > PREFLIGHT_LIMITS.maxRowsPerWorker || serializedBytes > PREFLIGHT_LIMITS.maxBytesPerWorker)
    throw new SourceError("source_limit");
  return { returnedReportPages: pages.length, returnedSourceRows: rowCount, serializedBytes,
    httpAttempts: "not-instrumented", discoveryPages: bundle.discoveryBefore.length + bundle.discoveryAfter.length,
    detailPages: Object.values(detail).flat().length };
}

/** Explicit operator-only source read. No Pool, server config, migration or persistence command is invoked. */
export async function runFullPreflight(input: CollectorConfig, options: {
  collect?: Collect; now?: () => number; monotonic?: () => number;
} = {}) {
  const config = parseCollectorConfig(input);
  // Loopback HTTP still needs the existing independently verified tunnel workflow; this wrapper cannot attest it.
  if (new URL(config.baseUrl).protocol === "http:" && config.transportPolicy !== APPROVED_HTTP_POLICY)
    throw new SourceError("protected_source_transport_required");
  const collect = options.collect ?? collectWithPython, now = options.now ?? Date.now, monotonic = options.monotonic ?? (() => performance.now());
  const startedAt = new Date(now()).toISOString();
  const stageResults: Array<{ stage: "bindings" | "materials"; status: "validated" | "failed"; elapsedMs: number;
    completedAt: string; code?: string; metrics?: ReturnType<typeof metrics> }> = [];
  let stage: "bindings" | "materials" = "bindings", stageStart = monotonic();
  const base = { schemaVersion: "ainuoke-live-preflight.v1", transport: config.transportPolicy === APPROVED_HTTP_POLICY
    ? "user-approved-plaintext-http" : "https", sourceFingerprint: readinessFingerprint(config), startedAt,
    visibilityScope: "current_account_visible", databaseAccess: "none", sourceActivation: "not-activated",
    operatorAuthorization: "not-checked", humanBusinessAcceptance: "not-performed", limits: PREFLIGHT_LIMITS };
  try {
    const bindingData = await collect(config, [], { mode: "bindings", timeoutMs: PREFLIGHT_LIMITS.workerTimeoutMs });
    const binding = await previewBindings(bindingData, now(), PREFLIGHT_LIMITS.sourceMaxAgeMs);
    const bindingMetrics = metrics(bindingData as BindingBundle);
    const elapsed = Math.ceil(monotonic() - stageStart);
    if (elapsed < 0 || elapsed > PREFLIGHT_LIMITS.workerTimeoutMs) throw new SourceError("source_timeout");
    stageResults.push({ stage, status: "validated", elapsedMs: elapsed, completedAt: new Date(now()).toISOString(), metrics: bindingMetrics });
    // All account-visible contracts participate, across lifecycle statuses. No sampling or style-number lookup.
    const targets = binding.preview.candidates.map((candidate, i) => ({ id: "readonly-" + (i + 1), version: 1,
      salesContractNo: candidate.source.salesContractNo, styleNo: candidate.source.styleNo,
      insideOrderNo: candidate.source.insideOrderNo }));
    stage = "materials"; stageStart = monotonic();
    const materialData = await collect(config, targets.map(order => order.salesContractNo), { timeoutMs: PREFLIGHT_LIMITS.workerTimeoutMs });
    const material = await validateBundle(materialData, targets, now(), PREFLIGHT_LIMITS.sourceMaxAgeMs);
    const bindingBundle = bindingData as BindingBundle;
    if (discoveryContentHash(bindingBundle.discoveryAfter) !== discoveryContentHash(material.bundle.discoveryBefore))
      throw new SourceError("preflight_discovery_changed");
    // Runtime capture may preserve disappeared orders. A full readiness run must not report complete if any vanished.
    if (material.rows.length !== targets.length || Object.keys(material.bundle.materials).length !== targets.length)
      throw new SourceError("preflight_scope_mismatch");
    const materialMetrics = metrics(material.bundle);
    const materialElapsed = Math.ceil(monotonic() - stageStart);
    if (materialElapsed < 0 || materialElapsed > PREFLIGHT_LIMITS.workerTimeoutMs) throw new SourceError("source_timeout");
    const orders = material.rows.map((row, index) => {
      const view = projectMaterialProgress({ salesContractNo: row.contract, styleNo: row.order.styleNo, insideOrderNo: row.order.insideOrderNo ?? "" }, row.pages);
      const candidate = binding.preview.candidates[index];
      return { label: "R" + String(index + 1).padStart(4, "0"), salesContractNo: row.contract,
        insideOrderNo: row.order.insideOrderNo, colorDetailStatus: candidate.colorDetailStatus,
        colorRows: candidate.colors.length, sourceContentHash: row.contentHash,
        sourceRows: row.pages.reduce((n, page) => n + page.rows.length, 0), sourceStatus: view.sourceStatus,
        demandItems: view.rows.length, factoryExcluded: view.factoryExcluded,
        duplicateSourceRows: view.duplicateSourceRows, duplicateEvents: view.duplicateEvents,
        units: { known: view.rows.filter(r => r.unitStatus === "known").length,
          missing: view.rows.filter(r => r.unitStatus === "missing").length, conflict: view.rows.filter(r => r.unitStatus === "conflict").length },
        streams: Object.fromEntries(streams.map(stream => [stream, {
          eventCount: view.rows.reduce((n, r) => n + r[stream].length, 0),
          unknownQuantityItems: view.rows.filter(r => r[quantityKeys[stream]] === null).length,
        }])),
        // Private allowlist: identities and facts required for human sample selection; no prices, suppliers or raw payloads.
        demands: view.rows.map(r => ({ id: r.demand.id, materialCode: r.demand.materialCode, materialName: r.demand.materialName,
          materialColor: r.demand.materialColor, specification: r.demand.specification, unit: r.unit, unitStatus: r.unitStatus,
          requiredQuantity: r.demand.requiredQuantity, issues: r.issues,
          purchases: r.purchases.map(e => ({ id: e.id, documentNo: e.purchaseOrderNo, eventDate: e.purchaseDate, quantity: e.quantity })),
          inbounds: r.inbounds, shipments: r.shipments, outbounds: r.outbounds })) };
    });
    stageResults.push({ stage, status: "validated", elapsedMs: materialElapsed, completedAt: new Date(now()).toISOString(), metrics: materialMetrics });
    const summary = { ...base, result: "READ_ONLY_FULL_PREFLIGHT_RECORDED", collectionValidation: "complete",
      completedAt: new Date(now()).toISOString(), stages: stageResults,
      freshnessScope: "validated-at-each-stage-end-refetch-required-before-binding", consistencyScope: "discovery-only-not-cross-report-transaction",
      discovery: { contracts: targets.length, complete: true, stableAcrossStages: true, contentHash: discoveryContentHash(bindingBundle.discoveryAfter) },
      bindingPreview: { reviewHash: binding.reviewHash, colors: binding.preview.coverage, parity: binding.preview.colorQuantityParity },
      materials: { contracts: orders.length, allVisibleContracts: true, emptyContracts: orders.filter(o => !o.sourceRows).length,
        demandItems: orders.reduce((n, o) => n + o.demandItems, 0),
        units: Object.fromEntries(["known", "missing", "conflict"].map(key => [key, orders.reduce((n, o) => n + o.units[key as keyof typeof o.units], 0)])),
        duplicateSourceRows: orders.reduce((n, o) => n + o.duplicateSourceRows, 0), duplicateEvents: orders.reduce((n, o) => n + o.duplicateEvents, 0),
        quantitiesAggregatedAcrossMaterials: false, unknownQuantityRemainsUnknown: true,
        streams: Object.fromEntries(streams.map(stream => [stream, {
          observedContracts: orders.filter(o => o.streams[stream].eventCount > 0).length,
          eventCount: orders.reduce((n, o) => n + o.streams[stream].eventCount, 0),
          unknownQuantityItems: orders.reduce((n, o) => n + o.streams[stream].unknownQuantityItems, 0),
        }])) },
      demoReady: false, nextGate: "explicit-isolated-target-authorization-and-real-persisted-refresh" };
    return { summary, privateReport: { ...summary, orders } };
  } catch (error) {
    stageResults.push({ stage, status: "failed", elapsedMs: Math.max(0, Math.ceil(monotonic() - stageStart)),
      completedAt: new Date(now()).toISOString(), code: errorCode(error) });
    const summary = { ...base, result: "READ_ONLY_FULL_PREFLIGHT_INCOMPLETE", collectionValidation: "incomplete",
      completedAt: new Date(now()).toISOString(), stages: stageResults, demoReady: false, nextGate: "resolve-failed-stage-before-binding" };
    return { summary, privateReport: { ...summary } };
  }
}

export function parsePreflightArguments(args: string[]) {
  if (args.length !== 3 || !args.includes("--run-read-only") || !args.includes("--stdin-config"))
    throw new SourceError("preflight_explicit_action_required");
  const output = args.find(arg => arg.startsWith("--private-output="))?.slice("--private-output=".length);
  if (!output || !isAbsolute(output)) throw new SourceError("preflight_explicit_action_required");
  return { privateOutput: resolve(output) };
}

export function assertPrivateOutput(path: string, root = process.cwd()) {
  const output = resolve(root, "outputs"), target = resolve(path);
  const child = relative(output, target);
  if (!child || child.startsWith(".." + sep) || child === ".." || isAbsolute(child)) throw new SourceError("preflight_private_output_required");
  const parts = child.split(sep);
  for (let i = 0; i <= parts.length; i++) {
    const current = join(output, ...parts.slice(0, i)), stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() || resolve(realpathSync(current)).toLowerCase() !== resolve(current).toLowerCase())
      throw new SourceError("preflight_private_output_required");
  }
  // Parent ignores must be verified rather than assumed from a familiar directory name.
  try { execFileSync("git", ["check-ignore", "--quiet", "--", join(target, "private-report.json")], { cwd: root, windowsHide: true, stdio: "ignore" }); }
  catch { throw new SourceError("preflight_private_output_required"); }
  if (process.platform === "win32") {
    // A fresh ACL read in this process; caller cannot replace it with an 'ACL checked' flag.
    try { execFileSync("pwsh", ["-NoProfile", "-NonInteractive", "-File", resolve(root, "scripts/ainuoke-live-preflight.ps1"),
      "-ValidateOnly", "-PrivateDirectory", target], { cwd: root, windowsHide: true, stdio: "ignore", timeout: 15000 }); }
    catch { throw new SourceError("preflight_private_output_required"); }
  } else {
    const stat = lstatSync(target);
    if ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()) throw new SourceError("preflight_private_output_required");
  }
}

export function writePrivateReport(directory: string, report: unknown, kind: "full-preflight" | "payment-request" | "garment-shipment" = "full-preflight") {
  if (!["full-preflight", "payment-request", "garment-shipment"].includes(kind)) throw new SourceError("preflight_private_output_required");
  // This fixed lifecycle status is metadata, not an Authorization credential.
  // Keep the shared source inspector strict, including for nested fields and all
  // other values of this key; only this source-only envelope may carry it.
  if (report && typeof report === "object" && !Array.isArray(report) && Object.hasOwn(report, "operatorAuthorization")) {
    const { operatorAuthorization, ...facts } = report as Record<string, unknown>;
    if (operatorAuthorization !== "not-checked" || facts.schemaVersion !== "ainuoke-live-preflight.v1"
      || facts.databaseAccess !== "none" || facts.sourceActivation !== "not-activated") throw new SourceError("source_secret_field");
    inspect(facts);
  } else inspect(report);
  assertPrivateOutput(directory);
  const prefix = kind === "payment-request" ? "ainuoke-payment-request-private-"
    : kind === "garment-shipment" ? "ainuoke-garment-shipment-private-" : "ainuoke-live-preflight-private-";
  const path = join(directory, prefix + randomUUID() + ".json");
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new SourceError("preflight_private_output_required");
    // Verify inherited NTFS ACL before any business facts enter the file.
    if (process.platform === "win32") {
      execFileSync("pwsh", ["-NoProfile", "-NonInteractive", "-File", resolve("scripts/ainuoke-live-preflight.ps1"),
        "-ValidateOnly", "-PrivateDirectory", directory, "-PrivateFile", path], { windowsHide: true, stdio: "ignore", timeout: 15000 });
    }
    const bytes = Buffer.from(JSON.stringify(report, null, 2) + "\n", "utf8");
    writeFileSync(fd, bytes);
    return { privateReportPath: path, privateReportSha256: createHash("sha256").update(bytes).digest("hex") };
  } catch { throw new SourceError("preflight_private_output_required"); }
  finally { if (fd !== undefined) closeSync(fd); }
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write("Operator-only full source read; no database, binding, scheduler or deployment. Use the private PowerShell wrapper.\n"); return;
  }
  let stage = "arguments";
  try {
    const { privateOutput } = parsePreflightArguments(args);
    stage = "private_output_validation"; assertPrivateOutput(privateOutput);
    stage = "worktree_validation";
    const toolingCommit = execFileSync("git", ["rev-parse", "--verify", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { encoding: "utf8", windowsHide: true }).trim();
    if (!/^[a-f0-9]{40}$/u.test(toolingCommit) || dirty) throw new SourceError("preflight_committed_clean_worktree_required");
    stage = "configuration";
    let length = 0; const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) { length += chunk.length; if (length > 16384) throw new SourceError("invalid_collector_configuration"); chunks.push(Buffer.from(chunk)); }
    const config = parseCollectorConfig(JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(Buffer.concat(chunks))));
    stage = "collection"; const report = await runFullPreflight(config);
    stage = "report_write";
    const privateReceipt = writePrivateReport(privateOutput, { ...report.privateReport, toolingCommit });
    process.stdout.write(JSON.stringify({ ...report.summary, toolingCommit, ...privateReceipt }) + "\n");
    if (report.summary.collectionValidation !== "complete") process.exitCode = 1;
  } catch (error) {
    const allowed = new Set(["preflight_explicit_action_required", "preflight_private_output_required", "preflight_committed_clean_worktree_required",
      "invalid_collector_configuration", "invalid_source_origin", "http_approval_target_mismatch", "protected_source_transport_required", "source_secret_field"]);
    const code = error instanceof SourceError && allowed.has(error.code) ? error.code : "preflight_invalid_or_unavailable";
    process.stdout.write(JSON.stringify({ schemaVersion: "ainuoke-live-preflight.v1", result: "FAIL", stage, code,
      databaseAccess: "none", sourceActivation: "not-activated" }) + "\n"); process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main();

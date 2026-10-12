import { pathToFileURL } from "node:url";
import { accountFingerprint, collectWithPython, parseCollectorConfig, readPrivateCollectorConfig, type CollectorConfig } from "./collector.js";
import { hash, SourceError } from "./contract.js";

const reportIds = [6086103, 6087105, 6087050];
type Receipt = { reportId: number; status: "readable" | "not-probed"; returnedRows: number | null; totalRows: number | null; complete: boolean };
export function validateProbeSummary(input: unknown) {
  const invalid = () => { throw new SourceError("source_probe_invalid"); };
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalid();
  const o = input as Record<string, unknown>;
  if (Object.keys(o).sort().join(",") !== "authenticated,reports,schemaVersion,scope"
    || o.schemaVersion !== "ainuoke-connection-probe.v1" || o.authenticated !== true
    || o.scope !== "first-visible-contract-first-pages-only" || !Array.isArray(o.reports) || o.reports.length !== 3) return invalid();
  const reports = o.reports.map((raw: unknown, index: number): Receipt => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return invalid();
    const r = raw as Receipt;
    if (Object.keys(r).sort().join(",") !== "complete,reportId,returnedRows,status,totalRows" || r.reportId !== reportIds[index]) return invalid();
    if (r.status === "not-probed") {
      if (index === 0 || r.returnedRows !== null || r.totalRows !== null || r.complete !== false) return invalid();
    } else if (r.status !== "readable" || !Number.isSafeInteger(r.totalRows) || r.totalRows! < 0
      || !Number.isSafeInteger(r.returnedRows) || r.returnedRows !== Math.min(50, r.totalRows!)
      || r.complete !== (r.returnedRows === r.totalRows)) return invalid();
    return { reportId: r.reportId, status: r.status, returnedRows: r.returnedRows, totalRows: r.totalRows, complete: r.complete };
  });
  const empty = reports[0].totalRows === 0;
  if (reports.slice(1).some(r => r.status !== (empty ? "not-probed" : "readable"))) return invalid();
  return { schemaVersion: "ainuoke-connection-probe.v1", authenticated: true, scope: "first-visible-contract-first-pages-only", reports };
}

export function parseReadinessArguments(args: string[]) {
  const values = new Map<string, string>();
  for (const arg of args) {
    const m = /^--([a-z-]+)(?:=(.+))?$/u.exec(arg);
    if (!m || values.has(m[1])) throw new SourceError("explicit_probe_action_required");
    values.set(m[1], m[2] ?? "");
  }
  const actions = ["check", "probe"].filter(a => values.has(a));
  if (actions.length !== 1 || values.get(actions[0]) !== "" || !values.get("config")) throw new SourceError("explicit_probe_action_required");
  const action = actions[0];
  const allowed = action === "check" ? ["check", "config"] : ["probe", "config", "expected-source", "verified-tunnel"];
  if ([...values.keys()].some(k => !allowed.includes(k)) || values.has("verified-tunnel") && values.get("verified-tunnel") !== ""
    || action === "probe" && !/^[a-f0-9]{64}$/u.test(values.get("expected-source") ?? "")) throw new SourceError("explicit_probe_action_required");
  return { action, configPath: values.get("config")!, expectedSource: values.get("expected-source"), verifiedTunnel: values.has("verified-tunnel") };
}

export function readinessFingerprint(config: CollectorConfig) {
  return hash({ sourceKey: config.sourceKey, account: accountFingerprint(config), operatorUsername: config.operatorUsername });
}

export async function probeSource(config: CollectorConfig, expectedSource: string, verifiedTunnel: boolean) {
  config = parseCollectorConfig(config);
  if (expectedSource !== readinessFingerprint(config)) throw new SourceError("source_target_mismatch");
  if (new URL(config.baseUrl).protocol === "http:" && !verifiedTunnel) throw new SourceError("verified_tunnel_required");
  return validateProbeSummary(await collectWithPython(config, [], { mode: "probe", timeoutMs: 90000 }));
}

/** Operator-only read path. No server config, DATABASE_URL, DB pool, migration or writer. */
export async function main(args = process.argv.slice(2)) {
  if (!args.length || args.length === 1 && args[0] === "--help") {
    process.stdout.write("No database or deployment. --check --config=<absolute private Linux file>\nExplicit read-only login/report probe: --probe --config=<file> --expected-source=<check fingerprint>\nLiteral loopback HTTP additionally requires --verified-tunnel after end-to-end protection is independently verified. Never tunnel from a VPS to a public HTTP upstream and call it protected.\nOnly first pages for one visible contract are inspected; no rows, credentials or identifiers are printed.\n");
    return;
  }
  const options = parseReadinessArguments(args);
  const config = readPrivateCollectorConfig(options.configPath);
  const sourceFingerprint = readinessFingerprint(config);
  if (options.action === "check") {
    process.stdout.write(JSON.stringify({ result: "CHECKED_NO_SOURCE_READ_NO_DATABASE", sourceFingerprint,
      transport: new URL(config.baseUrl).protocol === "https:" ? "https-required" : "loopback-proof-required",
      operatorAuthorization: "not-checked" }) + "\n");
    return;
  }
  const summary = await probeSource(config, options.expectedSource!, options.verifiedTunnel);
  process.stdout.write(JSON.stringify({ result: "READ_ONLY_CONNECTION_PROBED", sourceFingerprint,
    sourceActivation: "not-activated", businessValidation: "not-performed", operatorAuthorization: "not-checked", ...summary }) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { process.stderr.write(JSON.stringify({ result: "FAIL", code: error instanceof SourceError ? error.code : "source_probe_failed" }) + "\n"); process.exitCode = 1; });
}

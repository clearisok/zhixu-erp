import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";
import { mkdirSync, writeFileSync, lstatSync, realpathSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { adaptAinuokeOrderDiscoverySnapshots } from "../../features/ainuoke-api/source/ainuoke-order-discovery-adapter.js";
import { projectMaterialProgress, type ReadPurchase, type ReadMovement } from "../../features/ainuoke-material-progress/projection.js";
import { normalizeAinuokeInsideOrderNo } from "../../features/ainuoke-sync/source/ainuoke-garment-color-size-adapter.js";
import type { AinuokeReportSnapshot, AinuokeOrderDiscoveryQuery } from "../../features/ainuoke-api/model/ainuoke-api.js";
import { discoveryContentHash, inspect, pagesValid, SourceError } from "./contract.js";

const MAX_BYTES = 32 * 1024 * 1024;
const streams = ["purchases", "inbounds", "shipments", "outbounds"] as const;
const quantityFields = { purchases: "purchased", inbounds: "inbound", shipments: "shipped", outbounds: "outbound" } as const;
type AuditBundle = {
  schemaVersion: "ainuoke-readonly-audit.v1";
  discoveryBefore: AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>[];
  discoveryAfter: AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>[];
  materials: Record<string, AinuokeReportSnapshot[]>;
  selection: { strategy: "sorted-contract-even-spread-v1"; maximumContracts: 80 };
  reportRequests: number;
};

export function selectedContracts(keys: string[]): string[] {
  const sorted = [...keys].sort(), n = Math.min(80, sorted.length);
  return n < 2 ? sorted : Array.from({ length: n }, (_, i) => sorted[Math.floor(i * (sorted.length - 1) / (n - 1))]);
}

/** Offline only: reuses the actual page projection; no DB, HTTP or persistence writer imports. */
export async function analyzeReadonlyAudit(input: unknown, now = Date.now()) {
  inspect(input);
  if (!input || typeof input !== "object" || Buffer.byteLength(JSON.stringify(input), "utf8") > MAX_BYTES)
    throw new SourceError("audit_invalid");
  const bundle = input as AuditBundle;
  if (bundle.schemaVersion !== "ainuoke-readonly-audit.v1"
    || Object.keys(bundle).sort().join(",") !== "discoveryAfter,discoveryBefore,materials,reportRequests,schemaVersion,selection"
    || JSON.stringify(bundle.selection) !== JSON.stringify({ strategy: "sorted-contract-even-spread-v1", maximumContracts: 80 })
    || !Number.isSafeInteger(bundle.reportRequests) || bundle.reportRequests < 2 || bundle.reportRequests > 2000
    || !bundle.materials || Array.isArray(bundle.materials)) throw new SourceError("audit_invalid");
  pagesValid(bundle.discoveryBefore, now, 1800000); pagesValid(bundle.discoveryAfter, now, 1800000);
  const before = await adaptAinuokeOrderDiscoverySnapshots(bundle.discoveryBefore);
  const after = await adaptAinuokeOrderDiscoverySnapshots(bundle.discoveryAfter);
  if (before.total > 1000 || before.snapshotHash !== after.snapshotHash
    || discoveryContentHash(bundle.discoveryBefore) !== discoveryContentHash(bundle.discoveryAfter)) throw new SourceError("audit_discovery_changed");
  const selected = selectedContracts(before.rows.map(row => row.salesContractNo));
  if (JSON.stringify(Object.keys(bundle.materials).sort()) !== JSON.stringify(selected)) throw new SourceError("audit_scope_mismatch");
  const orders = selected.map((contract, index) => {
    const discovered = before.rows.find(row => row.salesContractNo === contract)!;
    const pages = bundle.materials[contract];
    pagesValid(pages, now, 1800000);
    if (pages.some(page => normalizeAinuokeInsideOrderNo(page.queryContext.insideOrderNo) !== normalizeAinuokeInsideOrderNo(discovered.insideOrderNo)))
      throw new SourceError("audit_scope_mismatch");
    const view = projectMaterialProgress({ salesContractNo: contract, styleNo: discovered.styleNo, insideOrderNo: discovered.insideOrderNo }, pages);
    const details = Object.fromEntries(streams.map(stream => {
      const events = view.rows.flatMap<ReadPurchase | ReadMovement>(row => row[stream]);
      const valid = events.filter(event => event.quantity > 0 && Number.isFinite(event.quantity)
        && ("purchaseOrderNo" in event ? event.purchaseOrderNo && event.purchaseDate : event.documentNo && event.eventDate));
      return [stream, { eventCount: events.length, positiveDatedEvents: valid.length,
        unknownQuantityItems: view.rows.filter(row => row[quantityFields[stream]] === null).length,
        // Explicit allowlist, no raw row, supplier, source price or unrelated business fields.
        examples: valid.slice(0, 3).map(event => ({
          documentNo: "purchaseOrderNo" in event ? event.purchaseOrderNo : event.documentNo,
          eventDate: "purchaseDate" in event ? event.purchaseDate : event.eventDate,
          quantity: event.quantity, unit: null,
        })) }];
    })) as Record<typeof streams[number], { eventCount: number; positiveDatedEvents: number; unknownQuantityItems: number; examples: unknown[] }>;
    return { label: "R" + String(index + 1).padStart(2, "0"), salesContractNo: contract, insideOrderNo: discovered.insideOrderNo,
      sourceStatus: view.sourceStatus, sourceRows: pages.reduce((n, p) => n + p.rows.length, 0),
      demandItems: view.rows.length, factoryExcluded: view.factoryExcluded,
      duplicateSourceRows: view.duplicateSourceRows, duplicateEvents: view.duplicateEvents, streams: details };
  });
  const representatives = Object.fromEntries(streams.map(stream => [stream,
    orders.filter(order => order.sourceStatus === "ready" && order.streams[stream].positiveDatedEvents > 0).slice(0, 3)])) as Record<typeof streams[number], typeof orders>;
  const summary = {
    schemaVersion: "ainuoke-readonly-validation.v1", result: "READ_ONLY_AUDIT_RECORDED",
    transport: "user-approved-plaintext-http", sourceActivation: "not-activated", databaseAccess: "none",
    operatorAuthorization: "not-checked", humanBusinessAcceptance: "not-performed",
    discovery: { visibilityScope: "current_account_visible", total: before.total, uniqueContracts: before.rows.length,
      pageCount: before.pageCount, complete: true, beforeAfterStable: true, contentHash: discoveryContentHash(bundle.discoveryBefore) },
    materials: { strategy: bundle.selection.strategy, sampledContracts: selected.length, allContractsSampled: selected.length === before.total,
      emptyContracts: orders.filter(o => o.sourceRows === 0 && o.sourceStatus === "ready").length,
      invalidContracts: orders.filter(o => o.sourceStatus !== "ready").length,
      requestedRepresentativeContractsPerStream: 3, quantitiesAggregatedAcrossMaterials: false,
      unitSemantics: "not-mapped-not-verified", reportRequests: bundle.reportRequests,
      streams: Object.fromEntries(streams.map(stream => [stream, {
        observedContracts: orders.filter(o => o.sourceStatus === "ready" && o.streams[stream].positiveDatedEvents > 0).length,
        representatives: representatives[stream].map(o => o.label),
        missingRepresentatives: Math.max(0, 3 - representatives[stream].length),
        unknownQuantityItems: orders.reduce((n, o) => n + o.streams[stream].unknownQuantityItems, 0),
      }])) },
    assessment: orders.some(o => o.sourceStatus !== "ready") || streams.some(s => representatives[s].length < 3)
      ? "needs-follow-up" : "representative-source-records-found",
  };
  return { summary, privateReport: { ...summary, representatives: Object.fromEntries(streams.map(s => [s, representatives[s]])),
    issueOrders: orders.filter(o => o.sourceStatus !== "ready" || streams.some(s => o.streams[s].unknownQuantityItems > 0)) } };
}

export async function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || args[0] !== "--analyze-stdin") throw new SourceError("audit_explicit_action_required");
  let length = 0; const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) { length += chunk.length; if (length > MAX_BYTES) throw new SourceError("audit_limit"); chunks.push(Buffer.from(chunk)); }
  const report = await analyzeReadonlyAudit(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  const output = resolve("outputs");
  mkdirSync(output, { recursive: true });
  if (lstatSync(output).isSymbolicLink() || realpathSync(output) !== output) throw new SourceError("audit_output_path");
  const privateReportPath = join(output, "ainuoke-readonly-private-" + randomUUID() + ".json");
  writeFileSync(privateReportPath, JSON.stringify(report.privateReport, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  process.stdout.write(JSON.stringify({ ...report.summary, privateReportPath }) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { process.stdout.write('{"error":"audit_invalid_or_unavailable"}\n'); process.exitCode = 1; });
}

/** Explicit offline diagnostic only. Never imported by the live read/commit service. */
import { randomUUID } from "node:crypto";
import { mkdirSync, lstatSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { adaptAinuokeOrderDiscoverySnapshots } from "../../features/ainuoke-api/source/ainuoke-order-discovery-adapter.js";
import { projectMaterialProgress } from "../../features/ainuoke-material-progress/projection.js";
import { buildAinuokeMaterialApiPreview } from "../../features/style-progress/service/ainuoke-material-api-preview.js";
import { adaptAinuokeMaterialApiSnapshots } from "../../features/style-progress/source/ainuoke-material-api-adapter.js";
import type { AinuokeOrderDiscoveryQuery, AinuokeReportSnapshot } from "../../features/ainuoke-api/model/ainuoke-api.js";
import type { MaterialNormalizedSourceRow } from "../../features/style-progress/source/material-source-row.js";
import { inspect, pagesValid, SourceError } from "./contract.js";

type Bundle = {
  schemaVersion: "ainuoke-targeted-diagnostic.v1";
  discovery: AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>[];
  materials: Record<string, AinuokeReportSnapshot[]>;
  targetSalesContractNo: string;
  targetPurchaseOrderNo: string;
  expectedQuantities: number[];
  reportRequests: number;
  authRenewals: number;
};
const streams = [
  { name: "purchases", quantity: "purchaseQuantity", document: "purchaseOrderNo" },
  { name: "inbounds", quantity: "inboundQuantity", document: "inboundDocumentNo" },
  { name: "shipments", quantity: "shipmentQuantity", document: "shipmentDocumentNo" },
  { name: "outbounds", quantity: "outboundQuantity", document: "outboundDocumentNo" },
] as const;
const text = (value: unknown) => String(value ?? "").normalize("NFKC").trim();
const key = (value: unknown) => text(value).toLocaleUpperCase("en-US").replace(/\s+/gu, "");
const quantity = (value: unknown): { kind: "blank" | "invalid" | "negative" | "zero" | "positive"; value: number | null } => {
  if (value === null || value === undefined || text(value) === "") return { kind: "blank", value: null };
  if (typeof value !== "number" && typeof value !== "string") return { kind: "invalid", value: null };
  const parsed = Number(typeof value === "string" ? value.replaceAll(",", "") : value);
  if (!Number.isFinite(parsed)) return { kind: "invalid", value: null };
  if (parsed < 0) return { kind: "negative", value: parsed };
  return { kind: parsed === 0 ? "zero" : "positive", value: parsed };
};
const unitCandidates = (fields: Record<string, unknown>) => Object.entries(fields)
  .filter(([field, value]) => /(?:unit|单位|^dw$)/iu.test(field) && value !== null && text(value))
  .map(([field, value]) => ({ field, value: text(value), status: "unverified_candidate" as const }));
const identityFields = (raw: MaterialNormalizedSourceRow) => ({
  materialName: text(raw.values.materialName), materialCode: text(raw.values.materialCode),
  materialColor: text(raw.values.materialColor), specification: text(raw.values.specification),
  purchasedMaterialName: text(raw.values.purchasedMaterialName), purchaseColor: text(raw.values.purchaseColor),
  purchaseSpecification: text(raw.values.purchaseSpecification),
});
function classify(raw: MaterialNormalizedSourceRow, stream: typeof streams[number]) {
  const parsed = quantity(raw.values[stream.quantity]);
  const document = text(raw.values[stream.document]);
  if (parsed.kind === "blank") return document ? "source_quantity_blank_with_document" : "no_event_candidate_unverified";
  if (parsed.kind === "invalid") return "source_quantity_invalid";
  if (parsed.kind === "negative") return "source_quantity_negative";
  if (parsed.kind === "positive" && !document) return "positive_quantity_without_document";
  if (parsed.kind === "zero") return "literal_zero_observed_not_unknown";
  return "positive_quantity_with_document";
}

export async function analyzeTargetedDiagnostic(input: unknown, now = Date.now()) {
  inspect(input);
  if (!input || typeof input !== "object" || Buffer.byteLength(JSON.stringify(input), "utf8") > 32 * 1024 * 1024)
    throw new SourceError("target_invalid");
  const bundle = input as Bundle;
  if (Object.keys(bundle).sort().join(",") !== "authRenewals,discovery,expectedQuantities,materials,reportRequests,schemaVersion,targetPurchaseOrderNo,targetSalesContractNo"
    || bundle.schemaVersion !== "ainuoke-targeted-diagnostic.v1" || !bundle.materials || Array.isArray(bundle.materials)
    || !key(bundle.targetSalesContractNo) || !key(bundle.targetPurchaseOrderNo)
    || !Array.isArray(bundle.expectedQuantities) || bundle.expectedQuantities.length !== 3
    || bundle.expectedQuantities.some(x => !Number.isSafeInteger(x) || x <= 0)
    || !Number.isSafeInteger(bundle.reportRequests) || bundle.reportRequests < 2 || bundle.reportRequests > 80
    || !Number.isSafeInteger(bundle.authRenewals) || bundle.authRenewals < 0 || bundle.authRenewals > 1)
    throw new SourceError("target_invalid");
  pagesValid(bundle.discovery, now, 1800000);
  const discovery = await adaptAinuokeOrderDiscoverySnapshots(bundle.discovery);
  const contracts = Object.keys(bundle.materials);
  if (discovery.total > 1000 || contracts.length < 1 || contracts.length > 3
    || !contracts.includes(key(bundle.targetSalesContractNo))
    || contracts.some(contract => contract !== key(contract) || !discovery.rows.some(row => row.salesContractNo === contract)))
    throw new SourceError("target_scope_mismatch");
  const result = [];
  let pageCount = bundle.discovery.length;
  for (const contract of contracts) {
    const discovered = discovery.rows.find(row => row.salesContractNo === contract)!;
    const pages = bundle.materials[contract];
    pagesValid(pages, now, 1800000);
    pageCount += pages.length;
    if (pages.some(page => key(page.queryContext.insideOrderNo) !== key(discovered.insideOrderNo)
      || page.rows.some(row => key(row.values.ExpContractNo) !== contract))) throw new SourceError("target_scope_mismatch");
    const view = projectMaterialProgress({ salesContractNo: contract, insideOrderNo: discovered.insideOrderNo, styleNo: discovered.styleNo }, pages);
    if (view.sourceStatus !== "ready") throw new SourceError("target_source_incomplete");
    const source = adaptAinuokeMaterialApiSnapshots(pages);
    const preview = buildAinuokeMaterialApiPreview({ snapshots: pages });
    const raw = preview.pipeline.rawRows;
    const candidateUnitsByDemand = new Map<string, Set<string>>();
    for (const row of raw) if (row.normalizedDemandId) {
      const values = candidateUnitsByDemand.get(row.normalizedDemandId) ?? new Set<string>();
      for (const candidate of unitCandidates(row.rawFields)) values.add(candidate.value);
      candidateUnitsByDemand.set(row.normalizedDemandId, values);
    }
    const streamReasons = Object.fromEntries(streams.map(stream => [stream.name, {
      unknownDemandItems: view.rows.filter(row => row[stream.name === "purchases" ? "purchased" : stream.name === "inbounds" ? "inbound" : stream.name === "shipments" ? "shipped" : "outbound"] === null).length,
      sourceRowsByObservation: Object.fromEntries([...new Set(raw.map(row => classify(row, stream)))].sort().map(reason => [reason, raw.filter(row => classify(row, stream) === reason).length])),
      mappingFieldError: "not_determinable_without_upstream_field_confirmation",
    }]));
    const purchaseEvents = preview.pipeline.purchaseEvents;
    const targetRows = contract === key(bundle.targetSalesContractNo) ? raw.filter(row => key(row.values.purchaseOrderNo) === key(bundle.targetPurchaseOrderNo)) : [];
    const purchaseTrace = targetRows.map(row => {
      const sourceRowIdentity = row.trace.sourceKind === "api" ? row.trace.sourceRowIdentity : null;
      const linkedEvents = purchaseEvents.filter(event => sourceRowIdentity && event.sourceReferences?.includes(sourceRowIdentity));
      return { sourceRowIdentity, normalizedDemandId: row.normalizedDemandId,
        validationIssues: row.validationIssues, ...identityFields(row),
        purchaseOrderNo: text(row.values.purchaseOrderNo), purchaseDate: text(row.values.purchaseDate),
        purchaseQuantity: quantity(row.values.purchaseQuantity),
        unitCandidates: unitCandidates(row.rawFields),
        normalizedEvents: linkedEvents.map(event => ({ eventId: event.id, quantity: event.quantity,
          sourceReferences: event.sourceReferences ?? [], mergedSourceRows: event.sourceReferences?.length ?? 0 })),
      };
    });
    result.push({ salesContractNo: contract, insideOrderNo: discovered.insideOrderNo,
      materialSourceRows: source.metadata.sourceRowCount,
      duplicateSourceRows: source.metadata.duplicateSourceRowsPrevented,
      duplicateEvents: preview.pipeline.stats.duplicateEventRows,
      unitCandidateConflictsWithinDemand: [...candidateUnitsByDemand.values()].filter(values => values.size > 1).length,
      unitFieldMeaning: "unverified",
      streamReasons, targetPurchaseRows: purchaseTrace });
  }
  if (pageCount + bundle.authRenewals !== bundle.reportRequests) throw new SourceError("target_request_count_mismatch");
  const target = result.find(row => row.salesContractNo === key(bundle.targetSalesContractNo))!;
  const slots = bundle.expectedQuantities.map((expectedQuantity, index) => {
    const candidates = target.targetPurchaseRows.filter(row => row.purchaseQuantity.kind === "positive" && row.purchaseQuantity.value === expectedQuantity);
    return { line: index + 1, expectedQuantity, screenshotUnit: "not_attested_by_api", status: "pending_human_identity_confirmation",
      quantityMatchedSourceRows: candidates.map(row => row.sourceRowIdentity),
      note: candidates.length ? "quantity_only_not_material_identity" : "no_equal_quantity_in_target_purchase_rows" };
  });
  const summary = { schemaVersion: "ainuoke-targeted-diagnostic.v1", result: "READ_ONLY_TARGETED_DIAGNOSTIC_RECORDED",
    transport: "user-approved-plaintext-http", sourceActivation: "not-activated", databaseAccess: "none",
    humanBusinessAcceptance: "not-performed", discoveryScope: "current_account_visible_single_pass_identity_lookup",
    materialContracts: contracts.length, reportRequests: bundle.reportRequests,
    targetPurchaseSourceRows: target.targetPurchaseRows.length,
    expectedLines: 3, lineIdentityVerified: 0, unitMappingVerified: false,
    unknownQuantityRemainsUnknown: true };
  return { summary, privateReport: { ...summary, discovery: { reportId: "6086103", total: discovery.total, pageCount: discovery.pageCount,
      targetSalesContractNo: target.salesContractNo, targetInsideOrderNo: target.insideOrderNo },
    targetPurchaseOrderNo: bundle.targetPurchaseOrderNo, slots, orders: result,
    limitation: "Quantity equality and candidate unit field names cannot prove source material identity or unit semantics. No 62-contract root-cause census was performed." } };
}

export async function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || args[0] !== "--analyze-stdin") throw new SourceError("target_explicit_action_required");
  let length = 0; const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) { length += chunk.length; if (length > 32 * 1024 * 1024) throw new SourceError("target_limit"); chunks.push(Buffer.from(chunk)); }
  const report = await analyzeTargetedDiagnostic(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  const output = resolve("outputs");
  mkdirSync(output, { recursive: true });
  if (lstatSync(output).isSymbolicLink() || realpathSync(output) !== output) throw new SourceError("target_output_path");
  const privateReportPath = join(output, "ainuoke-targeted-private-" + randomUUID() + ".json");
  writeFileSync(privateReportPath, JSON.stringify(report.privateReport, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  process.stdout.write(JSON.stringify({ ...report.summary, privateReportPath }) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => { process.stdout.write('{"error":"target_invalid_or_unavailable"}\n'); process.exitCode = 1; });

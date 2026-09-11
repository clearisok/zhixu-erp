import type {
  AinuokeOrderDiscoveryRow,
  AinuokeOrderDiscoverySnapshot,
  AinuokeReportSnapshot,
} from "../../ainuoke-api/model/ainuoke-api.ts";
import type { AinuokeColorMirrorInput, AinuokeContractMirrorInput } from "../../../server/sales-orders/model.ts";
import { buildAinuokeMirrorFromApi } from "../source/ainuoke-contract-api-adapter.ts";
import { isApiSourceTrace } from "../source/ainuoke-contract-source.ts";

export const SALES_ORDER_BOOTSTRAP_ORDER_NO_POLICY = "NEEDS_USER_DECISION" as const;

export type SalesOrderBootstrapContractStrategy = "DISCOVERY_ROW_REUSE" | "PER_ORDER_DETAIL";
export type SalesOrderBootstrapIssueSeverity = "blocking" | "warning" | "informational";

export type SalesOrderBootstrapIssueCode =
  | "duplicate_source_id"
  | "duplicate_source_row_identity"
  | "duplicate_inside_order_no"
  | "duplicate_sales_contract_no"
  | "inside_order_multiple_contracts"
  | "sales_contract_multiple_inside_orders"
  | "contract_detail_failure"
  | "color_detail_failure"
  | "identity_mismatch"
  | "contract_quantity_invalid"
  | "color_quantity_invalid"
  | "color_quantity_difference"
  | "status_preserved_without_filter";

export type SalesOrderBootstrapIssue = {
  severity: SalesOrderBootstrapIssueSeverity;
  code: SalesOrderBootstrapIssueCode;
  sourceId: string | null;
  message: string;
};

export type SalesOrderBootstrapDetail = {
  insideOrderNo: string;
  contractSnapshots?: AinuokeReportSnapshot[];
  colorSnapshots?: AinuokeReportSnapshot[];
  contractError?: string;
  colorError?: string;
};

export type SalesOrderBootstrapCandidate = {
  sequence: number;
  previewOnlyOrderNo: string;
  source: AinuokeContractMirrorInput;
  colors: AinuokeColorMirrorInput[];
  contractSourceHash: string;
  colorSourceHashes: string[];
  fetchedAt: string;
  disposition: "candidate";
};

export type SalesOrderBootstrapSnapshotStability = {
  beforeHash: string;
  afterHash: string;
  beforeTotal: number;
  afterTotal: number;
  added: string[];
  removed: string[];
  changedIdentityCount: number;
  stable: boolean;
};

export type SalesOrderBootstrapPreview = {
  schemaVersion: "sales-order-bootstrap-preview.v1";
  orderNoPolicy: typeof SALES_ORDER_BOOTSTRAP_ORDER_NO_POLICY;
  contractStrategy: SalesOrderBootstrapContractStrategy;
  discoveryTotal: number;
  statusDistribution: Array<{ status: string; count: number }>;
  contractDetail: { success: number; failure: number };
  colorDetail: { success: number; failure: number };
  candidates: SalesOrderBootstrapCandidate[];
  issues: SalesOrderBootstrapIssue[];
  snapshot: SalesOrderBootstrapSnapshotStability;
  previewHash: string;
  readyForDisposableDryRun: boolean;
};

type RawDiscoveryRow = {
  snapshot: AinuokeReportSnapshot<Record<string, never>>;
  row: AinuokeReportSnapshot<Record<string, never>>["rows"][number];
};

const normalizeIdentity = (value: string): string => value.normalize("NFKC").trim().toLocaleUpperCase("en-US");

function stableRows(rows: ReadonlyArray<AinuokeOrderDiscoveryRow>): AinuokeOrderDiscoveryRow[] {
  return [...rows].sort((left, right) =>
    left.sourceId.localeCompare(right.sourceId, "en", { numeric: true })
    || left.insideOrderNo.localeCompare(right.insideOrderNo)
    || left.salesContractNo.localeCompare(right.salesContractNo));
}

function groupDuplicates(rows: ReadonlyArray<AinuokeOrderDiscoveryRow>, select: (row: AinuokeOrderDiscoveryRow) => string): Map<string, AinuokeOrderDiscoveryRow[]> {
  const groups = new Map<string, AinuokeOrderDiscoveryRow[]>();
  for (const row of rows) {
    const key = select(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return new Map([...groups].filter(([, values]) => values.length > 1));
}

function addDuplicateIssues(
  issues: SalesOrderBootstrapIssue[],
  rows: ReadonlyArray<AinuokeOrderDiscoveryRow>,
  code: Extract<SalesOrderBootstrapIssueCode, "duplicate_source_id" | "duplicate_source_row_identity" | "duplicate_inside_order_no" | "duplicate_sales_contract_no">,
  label: string,
  select: (row: AinuokeOrderDiscoveryRow) => string,
): void {
  for (const [value, duplicates] of groupDuplicates(rows, select)) {
    issues.push({ severity: "blocking", code, sourceId: duplicates[0].sourceId, message: `${label} ${value} 出现 ${duplicates.length} 次` });
  }
}

function crossIdentityIssues(rows: ReadonlyArray<AinuokeOrderDiscoveryRow>): SalesOrderBootstrapIssue[] {
  const issues: SalesOrderBootstrapIssue[] = [];
  const insideToContracts = new Map<string, Set<string>>();
  const contractToInside = new Map<string, Set<string>>();
  for (const row of rows) {
    const inside = normalizeIdentity(row.insideOrderNo);
    const contract = normalizeIdentity(row.salesContractNo);
    insideToContracts.set(inside, new Set([...(insideToContracts.get(inside) ?? []), contract]));
    contractToInside.set(contract, new Set([...(contractToInside.get(contract) ?? []), inside]));
  }
  for (const [insideOrderNo, contracts] of insideToContracts) if (contracts.size > 1) {
    issues.push({ severity: "blocking", code: "inside_order_multiple_contracts", sourceId: null, message: `${insideOrderNo} 对应多个销售合同：${[...contracts].sort().join(", ")}` });
  }
  for (const [salesContractNo, insideOrders] of contractToInside) if (insideOrders.size > 1) {
    issues.push({ severity: "blocking", code: "sales_contract_multiple_inside_orders", sourceId: null, message: `${salesContractNo} 对应多个工厂单号：${[...insideOrders].sort().join(", ")}` });
  }
  return issues;
}

function identitySignature(row: AinuokeOrderDiscoveryRow): string {
  return [row.sourceRowIdentity, normalizeIdentity(row.insideOrderNo), normalizeIdentity(row.salesContractNo)].join("\u0000");
}

export function compareSalesOrderBootstrapSnapshots(
  before: AinuokeOrderDiscoverySnapshot,
  after: AinuokeOrderDiscoverySnapshot,
): SalesOrderBootstrapSnapshotStability {
  const beforeBySource = new Map(before.rows.map((row) => [row.sourceId, row]));
  const afterBySource = new Map(after.rows.map((row) => [row.sourceId, row]));
  const added = [...afterBySource.keys()].filter((sourceId) => !beforeBySource.has(sourceId)).sort();
  const removed = [...beforeBySource.keys()].filter((sourceId) => !afterBySource.has(sourceId)).sort();
  const changedIdentityCount = [...beforeBySource].filter(([sourceId, row]) => {
    const afterRow = afterBySource.get(sourceId);
    return afterRow && identitySignature(row) !== identitySignature(afterRow);
  }).length;
  return {
    beforeHash: before.snapshotHash,
    afterHash: after.snapshotHash,
    beforeTotal: before.total,
    afterTotal: after.total,
    added,
    removed,
    changedIdentityCount,
    stable: before.snapshotHash === after.snapshotHash
      && before.total === after.total
      && added.length === 0
      && removed.length === 0
      && changedIdentityCount === 0,
  };
}

function rawDiscoveryRows(snapshots: ReadonlyArray<AinuokeReportSnapshot<Record<string, never>>>): Map<string, RawDiscoveryRow> {
  const result = new Map<string, RawDiscoveryRow>();
  for (const snapshot of snapshots) for (const row of snapshot.rows) {
    const sourceId = String(row.values.id ?? "").normalize("NFKC").trim();
    if (sourceId && !result.has(sourceId)) result.set(sourceId, { snapshot, row });
  }
  return result;
}

export function discoveryContractSnapshot(
  discovery: AinuokeOrderDiscoveryRow,
  raw: RawDiscoveryRow,
): AinuokeReportSnapshot {
  return {
    ...raw.snapshot,
    page: 1,
    pageSize: 1,
    total: 1,
    queryContext: { insideOrderNo: discovery.insideOrderNo },
    rows: [raw.row],
  };
}

function toCandidate(
  sequence: number,
  discovery: AinuokeOrderDiscoveryRow,
  contractSnapshots: AinuokeReportSnapshot[],
  colorSnapshots: AinuokeReportSnapshot[],
): { candidate: SalesOrderBootstrapCandidate; issue?: SalesOrderBootstrapIssue } {
  const result = buildAinuokeMirrorFromApi({ contractSnapshots, colorSnapshots });
  if (result.contracts.length !== 1) throw new Error(`6086103 detail 应返回 1 个合同，实际 ${result.contracts.length}`);
  const mirror = result.contracts[0];
  if (!isApiSourceTrace(mirror)) throw new Error("6086103 detail 未产生 API source trace");
  if (normalizeIdentity(mirror.salesContractNo) !== normalizeIdentity(discovery.salesContractNo)
    || normalizeIdentity(mirror.factoryStyleNo) !== normalizeIdentity(discovery.insideOrderNo)) {
    throw new Error(`Discovery/detail identity mismatch: ${discovery.insideOrderNo}/${discovery.salesContractNo}`);
  }
  if (!Number.isFinite(mirror.quantity) || mirror.quantity < 0) throw new Error("contract quantity invalid");
  if (mirror.colorRows.some((row) => !Number.isFinite(row.quantity) || row.quantity < 0)) throw new Error("color quantity invalid");
  const apiColorRows = mirror.colorRows.map((row) => {
    if (!isApiSourceTrace(row)) throw new Error("6086997 detail 未产生 API source trace");
    return row;
  });
  const colors = apiColorRows
    .sort((left, right) => left.sourceRowIdentity.localeCompare(right.sourceRowIdentity) || left.colorName.localeCompare(right.colorName))
    .map((row): AinuokeColorMirrorInput => ({
      sourceLineIdentity: row.sourceRowIdentity,
      colorName: row.colorName,
      quantity: row.quantity,
      deliveryDate: row.deliveryDate,
      sourceHash: row.sourceHash,
      sourceMetadata: { reportId: row.reportId, snapshotHash: row.snapshotHash },
    }));
  const source: AinuokeContractMirrorInput = {
    sourceId: discovery.sourceId,
    sourceRowIdentity: mirror.sourceRowIdentity,
    salesContractNo: mirror.salesContractNo,
    insideOrderNo: mirror.factoryStyleNo,
    lifecycleStatusRaw: mirror.statusRaw,
    contractDate: mirror.contractDate,
    contractDeliveryDate: mirror.contractDeliveryDate,
    styleNo: mirror.styleNoRaw,
    companyNameSnapshot: mirror.companyName,
    customerNameSnapshot: mirror.customerName,
    brandNameSnapshot: mirror.brandRaw,
    quantity: mirror.quantity,
    sourceHash: mirror.sourceHash,
    fetchedAt: mirror.fetchedAt,
    sourceMetadata: { reportId: mirror.reportId, snapshotHash: mirror.snapshotHash, visibilityScope: "current_account_visible" },
  };
  const candidate: SalesOrderBootstrapCandidate = {
    sequence,
    previewOnlyOrderNo: `PREVIEW-${String(sequence).padStart(6, "0")}`,
    source,
    colors,
    contractSourceHash: mirror.sourceHash,
    colorSourceHashes: colors.map((color) => color.sourceHash).sort(),
    fetchedAt: [source.fetchedAt, result.metadata.fetchedAt].sort().at(-1)!,
    disposition: "candidate",
  };
  return mirror.quantityDifference === 0
    ? { candidate }
    : {
        candidate,
        issue: {
          severity: "warning",
          code: "color_quantity_difference",
          sourceId: discovery.sourceId,
          message: `${mirror.salesContractNo} 分色合计与合同数量相差 ${mirror.quantityDifference}`,
        },
      };
}

function canonicalPreviewPayload(preview: Omit<SalesOrderBootstrapPreview, "previewHash">) {
  return {
    schemaVersion: preview.schemaVersion,
    orderNoPolicy: preview.orderNoPolicy,
    contractStrategy: preview.contractStrategy,
    discoveryTotal: preview.discoveryTotal,
    statusDistribution: preview.statusDistribution,
    candidates: preview.candidates.map((candidate) => ({
      sequence: candidate.sequence,
      previewOnlyOrderNo: candidate.previewOnlyOrderNo,
      sourceId: candidate.source.sourceId,
      sourceRowIdentity: candidate.source.sourceRowIdentity,
      salesContractNo: candidate.source.salesContractNo,
      insideOrderNo: candidate.source.insideOrderNo,
      lifecycleStatusRaw: candidate.source.lifecycleStatusRaw,
      contractDate: candidate.source.contractDate,
      contractDeliveryDate: candidate.source.contractDeliveryDate,
      styleNo: candidate.source.styleNo,
      companyNameSnapshot: candidate.source.companyNameSnapshot,
      customerNameSnapshot: candidate.source.customerNameSnapshot,
      brandNameSnapshot: candidate.source.brandNameSnapshot,
      quantity: candidate.source.quantity,
      contractSourceHash: candidate.contractSourceHash,
      colorLines: candidate.colors.map((color) => ({
        sourceLineIdentity: color.sourceLineIdentity,
        colorName: color.colorName,
        quantity: color.quantity,
        deliveryDate: color.deliveryDate,
        sourceHash: color.sourceHash,
      })),
    })),
    issues: preview.issues,
    snapshot: preview.snapshot,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildSalesOrderBootstrapPreview(input: {
  discoveryBefore: AinuokeOrderDiscoverySnapshot;
  discoveryAfter: AinuokeOrderDiscoverySnapshot;
  discoveryRawSnapshots: ReadonlyArray<AinuokeReportSnapshot<Record<string, never>>>;
  details: ReadonlyArray<SalesOrderBootstrapDetail>;
  contractStrategy: SalesOrderBootstrapContractStrategy;
}): Promise<SalesOrderBootstrapPreview> {
  const rows = stableRows(input.discoveryBefore.rows);
  const issues: SalesOrderBootstrapIssue[] = [];
  addDuplicateIssues(issues, rows, "duplicate_source_id", "sourceId", (row) => row.sourceId);
  addDuplicateIssues(issues, rows, "duplicate_source_row_identity", "sourceRowIdentity", (row) => row.sourceRowIdentity);
  addDuplicateIssues(issues, rows, "duplicate_inside_order_no", "InsideOrderNo", (row) => normalizeIdentity(row.insideOrderNo));
  addDuplicateIssues(issues, rows, "duplicate_sales_contract_no", "SalesContractNo", (row) => normalizeIdentity(row.salesContractNo));
  issues.push(...crossIdentityIssues(rows));

  const details = new Map(input.details.map((detail) => [normalizeIdentity(detail.insideOrderNo), detail]));
  const rawRows = rawDiscoveryRows(input.discoveryRawSnapshots);
  const candidates: SalesOrderBootstrapCandidate[] = [];
  let contractSuccess = 0;
  let contractFailure = 0;
  let colorSuccess = 0;
  let colorFailure = 0;

  for (const [index, row] of rows.entries()) {
    const detail = details.get(normalizeIdentity(row.insideOrderNo));
    if (!detail || detail.contractError) {
      contractFailure += 1;
      issues.push({ severity: "blocking", code: "contract_detail_failure", sourceId: row.sourceId, message: detail?.contractError ?? "缺少合同 detail 结果" });
    } else {
      contractSuccess += 1;
    }
    if (!detail || detail.colorError || !detail.colorSnapshots?.length) {
      colorFailure += 1;
      issues.push({ severity: "blocking", code: "color_detail_failure", sourceId: row.sourceId, message: detail?.colorError ?? "缺少分色 detail 结果" });
    } else {
      colorSuccess += 1;
    }
    if (!detail || detail.contractError || detail.colorError || !detail.colorSnapshots?.length) continue;

    let contractSnapshots = detail.contractSnapshots;
    if (input.contractStrategy === "DISCOVERY_ROW_REUSE") {
      const raw = rawRows.get(row.sourceId);
      if (!raw || raw.row.sourceRowIdentity !== row.sourceRowIdentity) {
        contractSuccess -= 1;
        contractFailure += 1;
        issues.push({ severity: "blocking", code: "contract_detail_failure", sourceId: row.sourceId, message: "Discovery raw row 与 mapped identity 不一致" });
        continue;
      }
      contractSnapshots = [discoveryContractSnapshot(row, raw)];
    }
    if (!contractSnapshots?.length) {
      contractFailure += 1;
      contractSuccess -= 1;
      issues.push({ severity: "blocking", code: "contract_detail_failure", sourceId: row.sourceId, message: "缺少 6086103 detail Snapshot" });
      continue;
    }
    try {
      const mapped = toCandidate(index + 1, row, contractSnapshots, detail.colorSnapshots);
      candidates.push(mapped.candidate);
      if (mapped.issue) issues.push(mapped.issue);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const lower = message.toLocaleLowerCase();
      const code: SalesOrderBootstrapIssueCode = lower.includes("identity mismatch")
        ? "identity_mismatch"
        : message.includes("6086997")
          ? "color_detail_failure"
        : lower.includes("contract quantity") || (message.includes("6086103") && message.includes("数量无效"))
          ? "contract_quantity_invalid"
          : lower.includes("color quantity") || (message.includes("6086997") && message.includes("数量无效"))
            ? "color_quantity_invalid"
            : "contract_detail_failure";
      if (code === "color_detail_failure" || code === "color_quantity_invalid") {
        colorSuccess -= 1;
        colorFailure += 1;
      } else {
        contractSuccess -= 1;
        contractFailure += 1;
      }
      issues.push({ severity: "blocking", code, sourceId: row.sourceId, message });
    }
  }

  const statusCounts = new Map<string, number>();
  for (const row of rows) statusCounts.set(row.lifecycleStatusRaw, (statusCounts.get(row.lifecycleStatusRaw) ?? 0) + 1);
  const statuses = [...statusCounts].sort(([left], [right]) => left.localeCompare(right, "zh-CN"));
  for (const [status, count] of statuses) issues.push({ severity: "informational", code: "status_preserved_without_filter", sourceId: null, message: `Status ${status} 保留且未过滤：${count}` });
  const snapshot = compareSalesOrderBootstrapSnapshots(input.discoveryBefore, input.discoveryAfter);
  const base: Omit<SalesOrderBootstrapPreview, "previewHash"> = {
    schemaVersion: "sales-order-bootstrap-preview.v1",
    orderNoPolicy: SALES_ORDER_BOOTSTRAP_ORDER_NO_POLICY,
    contractStrategy: input.contractStrategy,
    discoveryTotal: rows.length,
    statusDistribution: statuses.map(([status, count]) => ({ status, count })),
    contractDetail: { success: contractSuccess, failure: contractFailure },
    colorDetail: { success: colorSuccess, failure: colorFailure },
    candidates,
    issues: issues.sort((left, right) => left.severity.localeCompare(right.severity) || left.code.localeCompare(right.code) || (left.sourceId ?? "").localeCompare(right.sourceId ?? "")),
    snapshot,
    readyForDisposableDryRun: snapshot.stable && candidates.length === rows.length && !issues.some((issue) => issue.severity === "blocking"),
  };
  return { ...base, previewHash: await sha256Hex(JSON.stringify(canonicalPreviewPayload(base))) };
}

export function salesOrderBootstrapIssueCounts(preview: SalesOrderBootstrapPreview): Record<SalesOrderBootstrapIssueSeverity, Record<string, number>> {
  const result: Record<SalesOrderBootstrapIssueSeverity, Record<string, number>> = { blocking: {}, warning: {}, informational: {} };
  for (const issue of preview.issues) result[issue.severity][issue.code] = (result[issue.severity][issue.code] ?? 0) + 1;
  return result;
}

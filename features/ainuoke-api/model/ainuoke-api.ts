export type AinuokeAccountStatus = "not_configured" | "verified" | "error";

export type AinuokeAccountView = {
  username: string | null;
  configured: boolean;
  status: AinuokeAccountStatus;
  lastVerifiedAt: string | null;
  lastSuccessfulLoginAt: string | null;
  lastErrorCode: string | null;
};

export type AinuokeDetailReportKey = "sales_contracts" | "sales_contract_color_sizes" | "material_purchase_statistics";
export type AinuokeReportKey = "order_discovery" | AinuokeDetailReportKey;

export const AINUOKE_DETAIL_REPORT_KEYS = [
  "sales_contracts",
  "sales_contract_color_sizes",
  "material_purchase_statistics",
] as const satisfies readonly AinuokeDetailReportKey[];

export type AinuokeReportQuery = {
  insideOrderNo: string;
};

export type AinuokeOrderDiscoveryQuery = Record<string, never>;

export type AinuokeSourceRow = {
  sourceRowIdentity: string;
  values: Record<string, unknown>;
};

export type AinuokeReportSnapshot<TQuery extends Record<string, unknown> = AinuokeReportQuery> = {
  schemaVersion: "ainuoke-direct-read.v2";
  reportId: "6086103" | "6086997" | "6087050";
  fetchedAt: string;
  page: number;
  pageSize: number;
  total: number;
  queryContext: TQuery;
  snapshotHash: string;
  rows: AinuokeSourceRow[];
};

export const AINUOKE_REPORT_CATALOG: Readonly<Record<AinuokeReportKey, { reportId: AinuokeReportSnapshot["reportId"]; label: string }>> = {
  order_discovery: { reportId: "6086103", label: "成衣销售合同发现" },
  sales_contracts: { reportId: "6086103", label: "销售合同" },
  sales_contract_color_sizes: { reportId: "6086997", label: "销售合同颜色尺码明细" },
  material_purchase_statistics: { reportId: "6087050", label: "面辅料申购统计" },
};

export type AinuokeOrderDiscoveryRow = {
  sourceId: string;
  sourceRowIdentity: string;
  insideOrderNo: string;
  salesContractNo: string;
  lifecycleStatusRaw: string;
  contractDate: string | null;
  deliveryDate: string | null;
  styleNo: string;
};

export type AinuokeOrderDiscoverySnapshot = {
  schemaVersion: "ainuoke-order-discovery.v1";
  reportId: "6086103";
  visibilityScope: "current_account_visible";
  fetchedAt: string;
  total: number;
  pageCount: number;
  rows: AinuokeOrderDiscoveryRow[];
  snapshotHash: string;
};

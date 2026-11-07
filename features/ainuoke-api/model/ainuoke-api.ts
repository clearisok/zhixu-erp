export type AinuokeAccountStatus = "not_configured" | "verified" | "error";

export type AinuokeAccountView = {
  username: string | null;
  configured: boolean;
  status: AinuokeAccountStatus;
  lastVerifiedAt: string | null;
  lastSuccessfulLoginAt: string | null;
  lastErrorCode: string | null;
};

export type AinuokeDetailReportKey = "sales_contracts" | "sales_contract_color_sizes" | "garment_color_size_details" | "material_purchase_statistics";
export type AinuokeReportKey = "order_discovery" | AinuokeDetailReportKey;
export type AinuokeReportQueryKind = "empty" | "sales_contract" | "inside_order";

export const AINUOKE_DETAIL_REPORT_KEYS = [
  "sales_contracts",
  "sales_contract_color_sizes",
  "garment_color_size_details",
  "material_purchase_statistics",
] as const satisfies readonly AinuokeDetailReportKey[];

export type AinuokeReportQuery = {
  insideOrderNo: string;
};

export type AinuokeSalesContractQuery = {
  salesContractNo: string;
};

export type AinuokeDetailReportQueryByKey = {
  sales_contracts: AinuokeReportQuery;
  sales_contract_color_sizes: AinuokeReportQuery;
  garment_color_size_details: AinuokeSalesContractQuery;
  material_purchase_statistics: AinuokeReportQuery;
};

export type AinuokeOrderDiscoveryQuery = Record<string, never>;

export type AinuokeSourceRow = {
  sourceRowIdentity: string;
  values: Record<string, unknown>;
};

export type AinuokeReportSnapshot<TQuery extends Record<string, unknown> = AinuokeReportQuery> = {
  schemaVersion: "ainuoke-direct-read.v2";
  reportId: "6086103" | "6086997" | "6087050" | "6087105" | "6087051" | "6086405" | "6086408" | "6086875" | "6086354";
  fetchedAt: string;
  page: number;
  pageSize: number;
  total: number;
  queryContext: TQuery;
  snapshotHash: string;
  rows: AinuokeSourceRow[];
};

export const AINUOKE_REPORT_CATALOG: Readonly<Record<AinuokeReportKey, {
  reportId: AinuokeReportSnapshot["reportId"];
  label: string;
  queryKind: AinuokeReportQueryKind;
}>> = {
  order_discovery: { reportId: "6086103", label: "成衣销售合同发现", queryKind: "empty" },
  sales_contracts: { reportId: "6086103", label: "销售合同", queryKind: "inside_order" },
  sales_contract_color_sizes: { reportId: "6086997", label: "销售合同颜色尺码明细", queryKind: "inside_order" },
  garment_color_size_details: { reportId: "6087105", label: "成衣分色分码明细", queryKind: "sales_contract" },
  material_purchase_statistics: { reportId: "6087050", label: "面辅料申购统计", queryKind: "inside_order" },
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

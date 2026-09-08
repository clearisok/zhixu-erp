export type AinuokeAccountStatus = "not_configured" | "verified" | "error";

export type AinuokeAccountView = {
  username: string | null;
  configured: boolean;
  status: AinuokeAccountStatus;
  lastVerifiedAt: string | null;
  lastSuccessfulLoginAt: string | null;
  lastErrorCode: string | null;
};

export type AinuokeReportKey = "sales_contracts" | "sales_contract_color_sizes" | "material_purchase_statistics";

export type AinuokeSourceRow = {
  sourceRowIdentity: string;
  values: Record<string, unknown>;
};

export type AinuokeReportSnapshot = {
  schemaVersion: "ainuoke-direct-read.v1";
  reportId: "6086103" | "6086997" | "6087050";
  fetchedAt: string;
  page: number;
  pageSize: number;
  total: number;
  queryContext: Record<string, unknown>;
  snapshotHash: string;
  rows: AinuokeSourceRow[];
};

export const AINUOKE_REPORT_CATALOG: Readonly<Record<AinuokeReportKey, { reportId: AinuokeReportSnapshot["reportId"]; label: string }>> = {
  sales_contracts: { reportId: "6086103", label: "销售合同" },
  sales_contract_color_sizes: { reportId: "6086997", label: "销售合同颜色尺码明细" },
  material_purchase_statistics: { reportId: "6087050", label: "面辅料申购统计" },
};

import type { AinuokeReportSnapshot, AinuokeSourceRow } from "../../ainuoke-api/model/ainuoke-api.ts";

export type AinuokeGarmentColorDetailStatus = "missing" | "invalid" | "usable";

export type AinuokeSizeMatrixStatus =
  | "SIZE_MATRIX_VALID"
  | "SIZE_MATRIX_QUANTITY_MISMATCH"
  | "SIZE_MATRIX_MISSING"
  | "SIZE_MATRIX_RULE_OVERFLOW"
  | "SIZE_RULE_MISSING"
  | "ZERO_QUANTITY_WITHOUT_SIZE"
  | "ZERO_QUANTITY_WITH_SIZE";

export type AinuokeGarmentColorSizeIssueCode =
  | "BLANK_COLOR"
  | "INVALID_SIZE_NUM"
  | "BILL_NO_MISMATCH"
  | "GOODS_NO_MISMATCH"
  | "DUPLICATE_SOURCE_IDENTITY";

export type AinuokeGarmentColorSizeIssue = {
  code: AinuokeGarmentColorSizeIssueCode;
  sourceRowIdentity: string | null;
  message: string;
};

export type AinuokeSizeAllocation = {
  slot: number;
  sizeName: string;
  quantity: number | null;
};

export type AinuokeGarmentColorSizeRow = {
  sourceRowIdentity: string;
  sourceId: string | null;
  salesContractNo: string;
  styleNo: string;
  insideOrderNo: string;
  customerOrderNo: string | null;
  sizeRuleRaw: string | null;
  sizeRuleTokens: string[];
  colorName: string;
  quantity: number | null;
  deliveryDate: string | null;
  sizeAllocations: AinuokeSizeAllocation[];
  populatedSizeSlots: number[];
  sizeValuesValid: boolean;
  highestPopulatedSizeSlot: number;
  populatedBeyondSizeRule: boolean;
  sizeQuantityTotal: number;
  sizeMatrixStatus: AinuokeSizeMatrixStatus;
};

export type AinuokeGarmentColorSizeSource = {
  schemaVersion: "ainuoke-garment-color-size.v1";
  reportId: "6087105";
  requestedInsideOrderNo: string;
  expectedSalesContractNo: string;
  expectedStyleNo: string;
  upstreamRows: number;
  exactRows: number;
  containsFalsePositiveRows: number;
  colorDetailStatus: AinuokeGarmentColorDetailStatus;
  rows: AinuokeGarmentColorSizeRow[];
  usableRows: AinuokeGarmentColorSizeRow[];
  issues: AinuokeGarmentColorSizeIssue[];
  fetchedAt: string;
  sourceHash: string;
};

const normalizeText = (value: unknown): string => value === null || value === undefined
  ? ""
  : String(value).normalize("NFKC").trim();

export const normalizeAinuokeInsideOrderNo = (value: unknown): string => normalizeText(value)
  .replace(/\s+/gu, "")
  .toLocaleUpperCase("en-US");

const normalizeIdentity = (value: unknown): string => normalizeText(value).toLocaleUpperCase("en-US");

function optionalDate(value: unknown): string | null {
  const raw = normalizeText(value);
  if (!raw) return null;
  const dateOnly = raw.match(/^\d{4}-\d{2}-\d{2}/u)?.[0];
  if (dateOnly) return dateOnly;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function optionalNonNegativeNumber(value: unknown): { present: boolean; valid: boolean; value: number | null } {
  const raw = normalizeText(value);
  if (!raw) return { present: false, valid: true, value: null };
  const parsed = typeof value === "number" ? value : Number(raw.replaceAll(",", ""));
  return Number.isFinite(parsed) && parsed >= 0
    ? { present: true, valid: true, value: parsed }
    : { present: true, valid: false, value: null };
}

function splitSizeRule(value: unknown): { raw: string | null; tokens: string[] } {
  const raw = normalizeText(value);
  return raw
    ? { raw, tokens: raw.split(/[,，]/u).map((token) => token.normalize("NFKC").trim()) }
    : { raw: null, tokens: [] };
}

function mapSizeFacts(row: AinuokeSourceRow, quantity: number | null) {
  const sizeRule = splitSizeRule(row.values.SizeRule);
  const slots = Array.from({ length: 26 }, (_, index) => {
    const slot = index + 1;
    return { slot, parsed: optionalNonNegativeNumber(row.values[`Size${slot}`]) };
  });
  const populatedSizeSlots = slots.filter(({ parsed }) => parsed.present).map(({ slot }) => slot);
  const invalidSizeValue = slots.some(({ parsed }) => parsed.present && !parsed.valid);
  const highestPopulatedSizeSlot = populatedSizeSlots.at(-1) ?? 0;
  const populatedBeyondSizeRule = highestPopulatedSizeSlot > sizeRule.tokens.length;
  const sizeQuantityTotal = slots.reduce((sum, { parsed }) => sum + (parsed.value ?? 0), 0);
  const sizeAllocations = sizeRule.tokens.flatMap((sizeName, index): AinuokeSizeAllocation[] => sizeName
    ? [{ slot: index + 1, sizeName, quantity: slots[index].parsed.value }]
    : []);

  let sizeMatrixStatus: AinuokeSizeMatrixStatus;
  if (!sizeRule.raw) sizeMatrixStatus = "SIZE_RULE_MISSING";
  else if (populatedBeyondSizeRule) sizeMatrixStatus = "SIZE_MATRIX_RULE_OVERFLOW";
  else if (quantity === null || invalidSizeValue) sizeMatrixStatus = "SIZE_MATRIX_QUANTITY_MISMATCH";
  else if (quantity === 0 && sizeQuantityTotal !== 0) sizeMatrixStatus = "SIZE_MATRIX_QUANTITY_MISMATCH";
  else if (quantity === 0) sizeMatrixStatus = populatedSizeSlots.length ? "ZERO_QUANTITY_WITH_SIZE" : "ZERO_QUANTITY_WITHOUT_SIZE";
  else if (!populatedSizeSlots.length) sizeMatrixStatus = "SIZE_MATRIX_MISSING";
  else sizeMatrixStatus = sizeQuantityTotal === quantity ? "SIZE_MATRIX_VALID" : "SIZE_MATRIX_QUANTITY_MISMATCH";

  return {
    sizeRuleRaw: sizeRule.raw,
    sizeRuleTokens: sizeRule.tokens,
    sizeAllocations,
    populatedSizeSlots,
    sizeValuesValid: !invalidSizeValue,
    highestPopulatedSizeSlot,
    populatedBeyondSizeRule,
    sizeQuantityTotal,
    sizeMatrixStatus,
  };
}

function assertSnapshotSet(snapshots: ReadonlyArray<AinuokeReportSnapshot>, requestedInsideOrderNo: string): void {
  if (!snapshots.length) throw new Error("6087105 缺少分页 Snapshot");
  const ordered = [...snapshots].sort((left, right) => left.page - right.page);
  const pageSize = ordered[0].pageSize;
  const total = ordered[0].total;
  let rows = 0;
  for (const [index, snapshot] of ordered.entries()) {
    if (snapshot.schemaVersion !== "ainuoke-direct-read.v2"
      || snapshot.reportId !== "6087105"
      || snapshot.page !== index + 1
      || snapshot.pageSize !== pageSize
      || snapshot.total !== total
      || normalizeAinuokeInsideOrderNo(snapshot.queryContext.insideOrderNo) !== requestedInsideOrderNo
      || snapshot.rows.length > pageSize) {
      throw new Error("6087105 Source 协议、query context 或分页不一致");
    }
    rows += snapshot.rows.length;
  }
  if (rows !== total) throw new Error("6087105 读取行数与 total 不一致");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function adaptAinuokeGarmentColorSizeSnapshots(input: {
  snapshots: ReadonlyArray<AinuokeReportSnapshot>;
  requestedInsideOrderNo: string;
  expectedSalesContractNo: string;
  expectedStyleNo: string;
}): Promise<AinuokeGarmentColorSizeSource> {
  const requestedInsideOrderNo = normalizeAinuokeInsideOrderNo(input.requestedInsideOrderNo);
  const expectedSalesContractNo = normalizeIdentity(input.expectedSalesContractNo);
  const expectedStyleNo = normalizeIdentity(input.expectedStyleNo);
  if (!requestedInsideOrderNo || !expectedSalesContractNo) throw new Error("6087105 exact filter 缺少订单身份");
  assertSnapshotSet(input.snapshots, requestedInsideOrderNo);

  const sourceRows = [...input.snapshots]
    .sort((left, right) => left.page - right.page)
    .flatMap((snapshot) => snapshot.rows);
  const exactSourceRows = sourceRows.filter((row) => normalizeAinuokeInsideOrderNo(row.values.insideorderno) === requestedInsideOrderNo);
  const issues: AinuokeGarmentColorSizeIssue[] = [];
  const rows = exactSourceRows.map((row): AinuokeGarmentColorSizeRow => {
    const sourceRowIdentity = normalizeText(row.sourceRowIdentity);
    const salesContractNo = normalizeText(row.values.BillNo);
    const styleNo = normalizeText(row.values.GoodsNo);
    const insideOrderNo = normalizeText(row.values.insideorderno);
    const colorName = normalizeText(row.values.CnColor);
    const sizeNum = optionalNonNegativeNumber(row.values.SizeNum);
    if (!colorName) issues.push({ code: "BLANK_COLOR", sourceRowIdentity: sourceRowIdentity || null, message: "6087105 CnColor 为空" });
    if (!sizeNum.present || !sizeNum.valid) issues.push({ code: "INVALID_SIZE_NUM", sourceRowIdentity: sourceRowIdentity || null, message: "6087105 SizeNum 无效" });
    if (normalizeIdentity(salesContractNo) !== expectedSalesContractNo) issues.push({ code: "BILL_NO_MISMATCH", sourceRowIdentity: sourceRowIdentity || null, message: `6087105 BillNo ${salesContractNo || "(空)"} 与 ${expectedSalesContractNo} 不一致` });
    if (expectedStyleNo && normalizeIdentity(styleNo) !== expectedStyleNo) issues.push({ code: "GOODS_NO_MISMATCH", sourceRowIdentity: sourceRowIdentity || null, message: `6087105 GoodsNo ${styleNo || "(空)"} 与 ${input.expectedStyleNo} 不一致` });
    return {
      sourceRowIdentity,
      sourceId: normalizeText(row.values.id) || null,
      salesContractNo,
      styleNo,
      insideOrderNo,
      customerOrderNo: normalizeText(row.values.CustomerOrderNo) || null,
      colorName,
      quantity: sizeNum.value,
      deliveryDate: optionalDate(row.values.DeliveryDate),
      ...mapSizeFacts(row, sizeNum.value),
    };
  });

  const identities = new Map<string, number>();
  for (const row of rows) identities.set(row.sourceRowIdentity, (identities.get(row.sourceRowIdentity) ?? 0) + 1);
  for (const [identity, count] of identities) if (!identity || count > 1) {
    issues.push({ code: "DUPLICATE_SOURCE_IDENTITY", sourceRowIdentity: identity || null, message: `6087105 canonical source identity 出现 ${count} 次` });
  }

  rows.sort((left, right) => left.sourceRowIdentity.localeCompare(right.sourceRowIdentity)
    || normalizeIdentity(left.colorName).localeCompare(normalizeIdentity(right.colorName))
    || (left.deliveryDate ?? "").localeCompare(right.deliveryDate ?? ""));
  const invalidCodes = new Set<AinuokeGarmentColorSizeIssueCode>(["BLANK_COLOR", "INVALID_SIZE_NUM", "BILL_NO_MISMATCH", "DUPLICATE_SOURCE_IDENTITY"]);
  const colorDetailStatus: AinuokeGarmentColorDetailStatus = rows.length === 0
    ? "missing"
    : issues.some((issue) => invalidCodes.has(issue.code))
      ? "invalid"
      : "usable";
  const hashPayload = rows.map((row) => ({
    sourceRowIdentity: row.sourceRowIdentity,
    salesContractNo: normalizeIdentity(row.salesContractNo),
    styleNo: normalizeIdentity(row.styleNo),
    insideOrderNo: normalizeAinuokeInsideOrderNo(row.insideOrderNo),
    customerOrderNo: normalizeIdentity(row.customerOrderNo),
    colorName: normalizeIdentity(row.colorName),
    quantity: row.quantity,
    deliveryDate: row.deliveryDate,
    sizeRuleTokens: row.sizeRuleTokens,
    sizeAllocations: row.sizeAllocations,
  }));
  return {
    schemaVersion: "ainuoke-garment-color-size.v1",
    reportId: "6087105",
    requestedInsideOrderNo,
    expectedSalesContractNo,
    expectedStyleNo,
    upstreamRows: sourceRows.length,
    exactRows: rows.length,
    containsFalsePositiveRows: sourceRows.length - rows.length,
    colorDetailStatus,
    rows,
    usableRows: colorDetailStatus === "usable" ? rows : [],
    issues: issues.sort((left, right) => left.code.localeCompare(right.code) || (left.sourceRowIdentity ?? "").localeCompare(right.sourceRowIdentity ?? "")),
    fetchedAt: input.snapshots.map((snapshot) => snapshot.fetchedAt).sort().at(-1)!,
    sourceHash: await sha256Hex(JSON.stringify(hashPayload)),
  };
}

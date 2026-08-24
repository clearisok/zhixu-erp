import ExcelJS from "exceljs";

export type TemplateType = "quote_customer" | "order" | "production_schedule" | "shipment";

export type TemplateDefinition = {
  id: string;
  type: TemplateType;
  name: string;
  version: number;
  fileName: string;
  isDefault: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  builtIn?: boolean;
};

export type TemplateValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  placeholders: string[];
  dynamicRows: Partial<Record<"fabric" | "trim" | "labor" | "otherCost", number>>;
};

export const QUOTE_CUSTOMER_PLACEHOLDERS = [
  "quote.brandName", "quote.styleName", "quote.styleNo", "quote.salespersonName", "quote.quoteDate",
  "revision.displayName",
  "priceVersion.name", "priceVersion.quantity",
  "fabric.name", "fabric.description", "fabric.supplier", "fabric.consumptionKg", "fabric.consumptionMeter", "fabric.unitPrice", "fabric.quotedCost",
  "trim.name", "trim.specification", "trim.supplier", "trim.quantity", "trim.unit", "trim.unitPrice", "trim.quotedCost",
  "labor.description", "labor.costRmb", "labor.costUsd",
  "otherCost.name", "otherCost.note", "otherCost.amount",
  "summary.totalCost", "summary.markupRate", "summary.garmentSalesPrice", "summary.finalQuote",
  "customer.confirmedPrice", "styleImage",
] as const;

export type QuoteCustomerPlaceholder = typeof QUOTE_CUSTOMER_PLACEHOLDERS[number];

export const QUOTE_CUSTOMER_PLACEHOLDER_GROUPS = [
  { label: "报价基础信息", fields: ["quote.brandName", "quote.styleName", "quote.styleNo", "quote.salespersonName", "quote.quoteDate"] },
  { label: "报价版本", fields: ["revision.displayName"] },
  { label: "价格版本", fields: ["priceVersion.name", "priceVersion.quantity"] },
  { label: "面料", fields: QUOTE_CUSTOMER_PLACEHOLDERS.filter((field) => field.startsWith("fabric.")) },
  { label: "辅料", fields: QUOTE_CUSTOMER_PLACEHOLDERS.filter((field) => field.startsWith("trim.")) },
  { label: "加工", fields: QUOTE_CUSTOMER_PLACEHOLDERS.filter((field) => field.startsWith("labor.")) },
  { label: "其他费用", fields: QUOTE_CUSTOMER_PLACEHOLDERS.filter((field) => field.startsWith("otherCost.")) },
  { label: "汇总", fields: QUOTE_CUSTOMER_PLACEHOLDERS.filter((field) => field.startsWith("summary.")) },
  { label: "客户确认", fields: ["customer.confirmedPrice"] },
  { label: "款式图", fields: ["styleImage"] },
] as const;

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][\w.]*)\s*\}\}/g;
const requiredScalar = ["quote.brandName", "quote.styleName", "quote.styleNo", "quote.quoteDate", "priceVersion.name", "summary.finalQuote"];
const dynamicRequirements: Record<string, string[]> = {
  fabric: ["fabric.name", "fabric.quotedCost"],
  trim: ["trim.name", "trim.quotedCost"],
  labor: ["labor.description", "labor.costRmb"],
  otherCost: ["otherCost.name", "otherCost.amount"],
};

export function placeholdersInText(value: string): string[] {
  return [...value.matchAll(PLACEHOLDER_RE)].map((match) => match[1]);
}

export async function validateQuoteCustomerTemplate(fileName: string, buffer: ArrayBuffer): Promise<TemplateValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const placeholders: string[] = [];
  const dynamicRows: TemplateValidationResult["dynamicRows"] = {};
  if (!/\.xlsx$/i.test(fileName)) errors.push("只支持 .xlsx 报价模板");
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); }
  catch { return { valid: false, errors: [...errors, "文件不是合法的 xlsx 工作簿"], warnings, placeholders, dynamicRows }; }
  const sheet = workbook.worksheets[0];
  if (!sheet) return { valid: false, errors: [...errors, "工作簿中没有可用 Sheet"], warnings, placeholders, dynamicRows };
  const locations = new Map<string, Array<{ row: number; column: number }>>();
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    if (cell.isMerged && cell.master.address !== cell.address) return;
    if (typeof cell.value !== "string") return;
    placeholdersInText(cell.value).forEach((placeholder) => {
      placeholders.push(placeholder);
      locations.set(placeholder, [...locations.get(placeholder) ?? [], { row: rowNumber, column: columnNumber }]);
    });
  }));
  const allowed = new Set<string>(QUOTE_CUSTOMER_PLACEHOLDERS);
  [...new Set(placeholders)].forEach((placeholder) => {
    if (placeholder.startsWith("estimate.")) errors.push("客户报价单不允许包含内部估算成本字段。");
    else if (!allowed.has(placeholder)) errors.push(`无法识别占位符 {{${placeholder}}}`);
  });
  requiredScalar.forEach((placeholder) => {
    const count = locations.get(placeholder)?.length ?? 0;
    if (!count) errors.push(`缺少关键占位符 {{${placeholder}}}`);
    if (count > 1) errors.push(`关键占位符 {{${placeholder}}} 只能出现一次`);
  });
  Object.entries(dynamicRequirements).forEach(([group, required]) => {
    const groupLocations = [...locations.entries()].filter(([placeholder]) => placeholder.startsWith(`${group}.`)).flatMap(([, values]) => values);
    const rows = [...new Set(groupLocations.map((item) => item.row))];
    if (rows.length > 1) errors.push(`${group} 动态占位符必须位于同一模板行`);
    if (rows.length === 1) dynamicRows[group as keyof typeof dynamicRows] = rows[0];
    required.forEach((placeholder) => { if (!locations.has(placeholder)) errors.push(`动态区域缺少 {{${placeholder}}}`); });
  });
  if (!locations.has("styleImage")) warnings.push("模板未包含 {{styleImage}}，导出时不会显示款式图");
  return { valid: errors.length === 0, errors: [...new Set(errors)], warnings, placeholders: [...new Set(placeholders)], dynamicRows };
}

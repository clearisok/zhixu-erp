import { quoteListColumnDefinitions, type ListColumnKey } from "./quote-list-column-definitions.ts";
import { summarizeValues, nullablePriceVersionMetrics } from "./quote-presentation.ts";
import { formatFinalGarmentPrice, truncateFinalQuoteValue } from "./final-quote-format.ts";
import { browserNumberFromExactDecimal, projectForBrowser } from "./exact-decimal-view.ts";
import type { PriceVersion, QuoteBaseInfo } from "./quote-view-model.ts";
import type { PermissionKey } from "../../permissions/model/permissions.ts";

export type BusinessColumn = ListColumnKey;
export type EstimateColumn = "estimateTotal" | "estimateRevision" | "estimateDifference";
export type BusinessCell = { value: string | number | null; display: string; numberFormat?: string };
export type BusinessValues = Partial<Record<BusinessColumn | EstimateColumn, BusinessCell>>;
export const businessColumns = quoteListColumnDefinitions.map(({ key, label }) => ({ key, label }));
export const costColumns: BusinessColumn[] = ["fabricCost", "trimCost", "labor", "garmentPrice", "confirmedLabor", "confirmedGarment"];
export const calculatedColumns: BusinessColumn[] = ["fabricCost", "trimCost", "labor", "garmentPrice"];
export const estimateColumns: EstimateColumn[] = ["estimateTotal", "estimateRevision", "estimateDifference"];
export function columnPermissions(key: BusinessColumn | EstimateColumn): PermissionKey[] {
  const permissions: PermissionKey[] = ["quote.view"];
  if (costColumns.includes(key as BusinessColumn) || key === "estimateTotal" || key === "estimateDifference") permissions.push("quote.cost.view");
  if (estimateColumns.includes(key as EstimateColumn)) permissions.push("estimate.view");
  return permissions;
}
export function allowedBusinessColumns(permissions: readonly string[]): BusinessColumn[] {
  return businessColumns.filter(({ key }) => columnPermissions(key).every(p => permissions.includes(p))).map(c => c.key);
}
export type CostSlice = Pick<PriceVersion, "pricingParameters" | "fabrics" | "trims" | "labor" | "otherCosts">;
export type ConfirmationFact = { linkage: "linked" | "unlinked" | "unknown"; labor: string | null; garment: string | null; currency: "CNY" | "USD" | null; confirmed: boolean; termsVersion: number | null };
export type BusinessVersion = { id: string; name: string; quantity: string | null; cost?: unknown; confirmation?: ConfirmationFact };
export type BusinessSource = { id: string; quoteCode: string; version: number; revisionId: string; revisionLabel: string; status: string; baseInfo: QuoteBaseInfo; versions: BusinessVersion[] };
const cell = (value: string | number | null, display = value === null ? "—" : String(value), numberFormat?: string): BusinessCell => ({ value, display, ...(numberFormat ? { numberFormat } : {}) });
const moneyFormat = (currency: string, final = false) => `${currency === "USD" ? '"$"' : '"¥"'}#,##0.${final ? "0" : "00"}`;
function range(values: Array<number | null>, currency = "CNY", final = false): BusinessCell {
  const present = values.filter((v): v is number => v !== null);
  if (!present.length) return cell(null);
  const min = Math.min(...present), max = Math.max(...present);
  if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error("Unsafe calculated value");
  const formatter = final ? formatFinalGarmentPrice : (v: number) => `${currency === "USD" ? "$" : "¥"}${v.toFixed(2)}`;
  if (min === max) return cell(final ? truncateFinalQuoteValue(min) : min, formatter(min), moneyFormat(currency, final));
  return cell(summarizeValues(present, formatter));
}
function currencyRanges(values: Array<{ value: number | null; currency: string | null }>): BusinessCell {
  const groups = new Map<string, Array<number | null>>();
  for (const item of values) if (item.value !== null && item.currency) groups.set(item.currency, [...(groups.get(item.currency) ?? []), item.value]);
  if (!groups.size) return cell(null);
  if (groups.size === 1) { const [currency, group] = [...groups][0]; return range(group, currency); }
  return cell([...groups].map(([currency, group]) => `${currency} ${range(group, currency).display}`).join(" · "));
}
const states: Record<string, string> = { draft: "草稿", quoting: "报价中", partially_confirmed: "部分确认", confirmed: "全部确认" };
/** Only actual selected source slices enter the existing calculator; never a fake complete Quote. */
export function businessValues(source: BusinessSource, keys: BusinessColumn[], version?: BusinessVersion): BusinessValues {
  const versions = version ? [version] : source.versions;
  const values: BusinessValues = {};
  const needMetrics = keys.some(k => calculatedColumns.includes(k));
  const costs = needMetrics ? versions.map(v => {
    if (!v.cost) throw new Error("Missing selected cost slice");
    const cost = projectForBrowser(v.cost) as CostSlice;
    return { cost, metrics: nullablePriceVersionMetrics(cost) };
  }) : [];
  for (const key of keys) {
    let output: BusinessCell;
    switch (key) {
      case "quote": output = cell(source.quoteCode); break;
      case "styleImage": output = cell(null); break; // No old URL/IndexedDB fallback.
      case "styleIdentity": output = cell([source.baseInfo.quoteStyleNo, source.baseInfo.styleName].filter(Boolean).join(" / ") || null); break;
      case "brand": output = cell(source.baseInfo.brandName || null); break;
      case "salesperson": output = cell(source.baseInfo.salespersonName || null); break;
      case "type": output = cell(source.baseInfo.quoteType === "processing" ? "加工" : "经销"); break;
      case "versions": output = cell(versions.length); break;
      case "quantity": {
        const present = versions.filter(v => v.quantity !== null).map(v => browserNumberFromExactDecimal(v.quantity!, "quantity"));
        const total = present.reduce((a, b) => a + b, 0);
        if (!Number.isFinite(total)) throw new Error("Unsafe quantity total");
        output = present.length ? cell(total, undefined, "#,##0.####") : cell(null); break;
      }
      case "fabricCost": output = range(costs.map(c => c.metrics.fabricCost)); break;
      case "trimCost": output = range(costs.map(c => c.metrics.trimCost)); break;
      case "labor": output = currencyRanges(costs.map(c => ({ value: c.metrics.laborInput, currency: c.cost.pricingParameters.laborCurrency }))); break;
      case "garmentPrice": output = range(costs.map(c => c.metrics.garmentSellingPrice), "CNY", true); break;
      case "confirmedLabor": case "confirmedGarment": {
        if (versions.some(v => !v.confirmation || v.confirmation.linkage === "unknown")) { output = cell("关联未核实"); break; }
        const facts = versions.map(v => v.confirmation!);
        output = key === "confirmedLabor" ? currencyRanges(facts.map(f => ({ value: f.labor === null ? null : browserNumberFromExactDecimal(f.labor, "current labor"), currency: f.currency })))
          : range(facts.map(f => f.garment === null ? null : browserNumberFromExactDecimal(f.garment, "current garment")));
        break;
      }
      case "confirmationStatus": {
        if (versions.some(v => !v.confirmation || v.confirmation.linkage === "unknown")) { output = cell("关联未核实"); break; }
        const count = versions.filter(v => v.confirmation!.confirmed).length;
        output = cell(count === 0 ? "未确认" : count === versions.length ? "全部确认" : `部分确认（${count}/${versions.length}）`); break;
      }
      case "revision": output = cell(source.revisionLabel); break;
      case "status": output = cell(states[source.status] ?? source.status); break;
      case "date": output = cell(source.baseInfo.quoteDate || null); break;
    }
    values[key] = output;
  }
  return values;
}

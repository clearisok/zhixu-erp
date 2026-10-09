import { calculatePriceVersionMetrics } from "./quote-calculations.ts";
import type { NullableNumber, PriceVersion, QuoteRevision } from "./quote-view-model.ts";

export type NullablePriceVersionMetrics = {
  fabricCost: NullableNumber;
  trimCost: NullableNumber;
  laborInput: NullableNumber;
  otherCost: NullableNumber;
  garmentSellingPrice: NullableNumber;
  fabricWithMarkup: NullableNumber;
  trimWithMarkup: NullableNumber;
  laborRmb: NullableNumber;
  laborWithMarkup: NullableNumber;
  preMarkupTotal: NullableNumber;
};

export function nullablePriceVersionMetrics(version: Pick<PriceVersion, "pricingParameters" | "fabrics" | "trims" | "labor" | "otherCosts">): NullablePriceVersionMetrics {
  const metrics = calculatePriceVersionMetrics(version);
  const hasFabric = version.fabrics.some((line) => line.unitPrice !== null);
  const hasTrim = version.trims.some((line) => line.usage !== null && line.unitPrice !== null);
  const hasLabor = version.labor.value !== null;
  const hasOther = version.otherCosts.some((line) => line.amount !== null || (line.usage !== null && line.unitPrice !== null));
  const hasAnyCost = hasFabric || hasTrim || hasLabor || hasOther;
  return {
    fabricCost: hasFabric ? metrics.fabricCost : null,
    fabricWithMarkup: hasFabric ? metrics.fabricWithMarkup : null,
    trimCost: hasTrim ? metrics.trimCost : null,
    trimWithMarkup: hasTrim ? metrics.trimWithMarkup : null,
    laborInput: hasLabor ? metrics.laborInput : null,
    otherCost: hasOther ? metrics.otherCost : null,
    laborRmb: hasLabor ? metrics.laborRmb : null,
    laborWithMarkup: hasLabor ? metrics.laborWithMarkup : null,
    preMarkupTotal: hasAnyCost ? metrics.preMarkupTotal : null,
    garmentSellingPrice: hasAnyCost ? metrics.garmentSellingPrice : null,
  };
}

export function formatMoney(value: NullableNumber, currency = "¥"): string {
  return value === null ? "—" : `${currency}${value.toFixed(2)}`;
}

export function summarizeValues(values: NullableNumber[], formatter: (value: number) => string = (value) => formatMoney(value)): string {
  const present = values.filter((value): value is number => value !== null);
  if (!present.length) return "—";
  const min = Math.min(...present);
  const max = Math.max(...present);
  return min === max ? formatter(min) : `${formatter(min)} – ${formatter(max)}`;
}

export function summarizeRevisionMetric(
  revision: QuoteRevision,
  selector: (metrics: NullablePriceVersionMetrics, version: PriceVersion) => NullableNumber,
  formatter: (value: number) => string = (value) => formatMoney(value),
): string {
  return summarizeValues(revision.priceVersions.map((version) => selector(nullablePriceVersionMetrics(version), version)), formatter);
}

export function priceVersionConfirmationLabel(version: PriceVersion): string {
  return version.confirmation ? "已确认" : "未确认";
}

export function confirmedPriceSummary(revision: QuoteRevision, field: "confirmedLaborPrice" | "confirmedGarmentPrice"): string {
  if (revision.priceVersions.length > 1) {
    const confirmed = revision.priceVersions.filter((version) => version.confirmation?.[field] !== null && version.confirmation?.[field] !== undefined).length;
    return `${confirmed}/${revision.priceVersions.length} 已确认`;
  }
  return formatMoney(revision.priceVersions[0]?.confirmation?.[field] ?? null);
}

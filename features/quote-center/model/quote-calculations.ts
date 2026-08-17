import type { CostLine, LaborCurrency, NullableNumber, PriceVersion } from "./quote-view-model";

export function numberOrZero(value: NullableNumber): number {
  return value ?? 0;
}

export function costLineAmount(line: CostLine): number {
  return numberOrZero(line.usage) * numberOrZero(line.unitPrice) * (1 + numberOrZero(line.lossRate) / 100);
}

export function sumCostLines(lines: CostLine[]): number {
  return lines.reduce((total, line) => total + costLineAmount(line), 0);
}

export function totalPriceVersionQuantity(priceVersions: PriceVersion[]): number {
  return priceVersions.reduce((total, version) => total + numberOrZero(version.quantity), 0);
}

export function laborCostInRmb(value: NullableNumber, currency: LaborCurrency, usdCnyRate: NullableNumber): number {
  return currency === "USD" ? numberOrZero(value) * numberOrZero(usdCnyRate) : numberOrZero(value);
}

export function applyMarkup(cost: number, markupRate: NullableNumber): number {
  return cost * (1 + numberOrZero(markupRate) / 100);
}

export type PriceVersionMetrics = {
  fabricCost: number;
  fabricWithMarkup: number;
  trimCost: number;
  trimWithMarkup: number;
  laborInput: number;
  laborRmb: number;
  laborWithMarkup: number;
  otherCost: number;
  preMarkupTotal: number;
  garmentSellingPrice: number;
};

export function calculatePriceVersionMetrics(
  version: PriceVersion,
  laborCurrency: LaborCurrency,
  usdCnyRate: NullableNumber,
  markupRate: NullableNumber,
): PriceVersionMetrics {
  const fabricCost = sumCostLines(version.fabrics);
  const trimCost = sumCostLines(version.trims);
  const otherCost = sumCostLines(version.otherCosts);
  const laborRmb = laborCostInRmb(version.labor.value, laborCurrency, usdCnyRate);
  const preMarkupTotal = fabricCost + trimCost + laborRmb + otherCost;

  return {
    fabricCost,
    fabricWithMarkup: applyMarkup(fabricCost, markupRate),
    trimCost,
    trimWithMarkup: applyMarkup(trimCost, markupRate),
    laborInput: numberOrZero(version.labor.value),
    laborRmb,
    laborWithMarkup: applyMarkup(laborRmb, markupRate),
    otherCost,
    preMarkupTotal,
    garmentSellingPrice: applyMarkup(preMarkupTotal, markupRate),
  };
}

export function copyPriceVersion(
  source: PriceVersion,
  input: { id: string; name: string; quantity: NullableNumber; description: string },
): PriceVersion {
  const cloneLines = (lines: CostLine[], prefix: string) => lines.map((line, index) => ({ ...line, id: `${input.id}-${prefix}-${index + 1}` }));
  return {
    id: input.id,
    name: input.name,
    quantity: input.quantity,
    description: input.description,
    fabrics: cloneLines(source.fabrics, "fabric"),
    trims: cloneLines(source.trims, "trim"),
    labor: { ...source.labor },
    otherCosts: cloneLines(source.otherCosts, "other"),
    confirmation: null,
  };
}

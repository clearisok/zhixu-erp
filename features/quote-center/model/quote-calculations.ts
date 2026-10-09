import type {
  CostLine,
  FabricCostLine,
  LaborCurrency,
  NullableNumber,
  OtherCostLine,
  PriceVersion,
} from "./quote-view-model";

export function numberOrZero(value: NullableNumber | undefined): number {
  return value ?? 0;
}

export function costLineAmount(line: CostLine): number {
  return numberOrZero(line.usage)
    * numberOrZero(line.unitPrice)
    * (1 + numberOrZero(line.lossRate) / 100);
}

export function sumCostLines(lines: CostLine[]): number {
  return lines.reduce((total, line) => total + costLineAmount(line), 0);
}

export function otherCostAmount(line: OtherCostLine | CostLine): number {
  return "amount" in line ? numberOrZero(line.amount) : costLineAmount(line);
}

export function sumOtherCosts(lines: Array<OtherCostLine | CostLine>): number {
  return lines.reduce((total, line) => total + otherCostAmount(line), 0);
}

export function fabricGrossWidthCm(netWidthCm: NullableNumber): number {
  return numberOrZero(netWidthCm) + 5;
}

export const FABRIC_CONSUMPTION_DECIMALS = 4;

/** Decimal half-up normalization for non-negative ERP quantities. */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function normalizeFabricConsumption(value: number): number {
  return roundTo(value, FABRIC_CONSUMPTION_DECIMALS);
}

export function fabricConsumptionKg(line: Pick<FabricCostLine, "segmentLengthCm" | "netWidthCm" | "gsm" | "lossRate">): number {
  const rawConsumption = (
    numberOrZero(line.segmentLengthCm)
    * fabricGrossWidthCm(line.netWidthCm)
    * numberOrZero(line.gsm)
    / 10_000_000
  ) * (1 + numberOrZero(line.lossRate) / 100);
  return normalizeFabricConsumption(rawConsumption);
}

export function fabricConsumptionMeter(line: Pick<FabricCostLine, "segmentLengthCm" | "lossRate">): number {
  const rawConsumption = (numberOrZero(line.segmentLengthCm) / 100)
    * (1 + numberOrZero(line.lossRate) / 100);
  return normalizeFabricConsumption(rawConsumption);
}

export function fabricConsumption(line: FabricCostLine): number {
  return line.purchaseUnit === "meter"
    ? fabricConsumptionMeter(line)
    : fabricConsumptionKg(line);
}

export function fabricCostAmount(line: FabricCostLine): number {
  return fabricConsumption(line) * numberOrZero(line.unitPrice);
}

export function sumFabricCosts(lines: FabricCostLine[]): number {
  return lines.reduce((total, line) => {
    // Compatibility with V1.3 session fixtures that used the generic cost row.
    if (!("purchaseUnit" in line)) return total + costLineAmount(line as unknown as CostLine);
    return total + fabricCostAmount(line);
  }, 0);
}

export function totalPriceVersionQuantity(priceVersions: PriceVersion[]): number {
  return priceVersions.reduce((total, version) => total + numberOrZero(version.quantity), 0);
}

export function nullableTotalPriceVersionQuantity(priceVersions: PriceVersion[]): NullableNumber {
  return priceVersions.every((version) => version.quantity === null)
    ? null
    : totalPriceVersionQuantity(priceVersions);
}

/** Fixed business coefficient used only when converting USD labor to RMB. */
export const USD_LABOR_RMB_CONVERSION_FACTOR = 1.13;

export function convertedLaborRmb(value: NullableNumber, currency: LaborCurrency, usdCnyRate: NullableNumber): number {
  return currency === "USD"
    ? numberOrZero(value) * numberOrZero(usdCnyRate) * USD_LABOR_RMB_CONVERSION_FACTOR
    : numberOrZero(value);
}

/** @deprecated Prefer convertedLaborRmb; retained for existing consumers. */
export function laborCostInRmb(value: NullableNumber, currency: LaborCurrency, usdCnyRate: NullableNumber): number {
  return convertedLaborRmb(value, currency, usdCnyRate);
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
  version: Pick<PriceVersion, "pricingParameters" | "fabrics" | "trims" | "labor" | "otherCosts">,
): PriceVersionMetrics {
  const { laborCurrency, usdCnyRate, markupRate } = version.pricingParameters;
  const fabricCost = sumFabricCosts(version.fabrics);
  const trimCost = sumCostLines(version.trims);
  const otherCost = sumOtherCosts(version.otherCosts);
  const laborRmb = convertedLaborRmb(version.labor.value, laborCurrency, usdCnyRate);
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
  const cloneRows = <T extends { id: string }>(rows: T[], prefix: string): T[] => rows.map((row, index) => ({
    ...row,
    id: `${input.id}-${prefix}-${index + 1}`,
  }));
  return {
    id: input.id,
    name: input.name,
    quantity: input.quantity,
    description: input.description,
    pricingParameters: { ...source.pricingParameters },
    fabrics: cloneRows(source.fabrics, "fabric"),
    trims: cloneRows(source.trims, "trim"),
    labor: { ...source.labor },
    otherCosts: cloneRows(source.otherCosts, "other"),
    confirmation: null,
  };
}

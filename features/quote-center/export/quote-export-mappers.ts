import {
  costLineAmount,
  fabricConsumption,
  fabricCostAmount,
  otherCostAmount,
} from "../model/quote-calculations.ts";
import { nullablePriceVersionMetrics } from "../model/quote-presentation.ts";
import type {
  FabricCostLine,
  OtherCostLine,
  PriceVersion,
  QuoteRevision,
  TrimCostLine,
} from "../model/quote-view-model.ts";
import { formatFinalQuote } from "./quote-export-formatters.ts";

export type ExportCostRow = {
  name: string;
  description: string;
  supplier: string;
  unit: string;
  quantity: number | null;
  unitPrice: number | null;
  estimatedCost: number | null;
  actualCost: number | null;
};

export type ExportPriceVersionData = {
  priceVersion: PriceVersion;
  fabricRows: ExportCostRow[];
  trimRows: ExportCostRow[];
  laborRows: ExportCostRow[];
  outsourcingRows: ExportCostRow[];
  otherCostRows: ExportCostRow[];
  summary: {
    fabricCost: number | null;
    trimCost: number | null;
    laborRmb: number | null;
    otherCost: number | null;
    preMarkupTotal: number | null;
    markupRate: number | null;
    garmentSellingPrice: number | null;
    finalQuote: string | null;
    customerTargetPrice: number | null;
    customerConfirmedPrice: number | null;
  };
};

function hasText(value: string): boolean {
  return Boolean(value.trim());
}

function meaningfulFabric(line: FabricCostLine): boolean {
  return hasText(line.name) || hasText(line.composition) || hasText(line.supplier)
    || [line.segmentLengthCm, line.netWidthCm, line.gsm, line.lossRate, line.unitPrice].some((value) => value !== null);
}

function meaningfulTrim(line: TrimCostLine): boolean {
  return hasText(line.name) || hasText(line.specification) || hasText(line.supplier) || hasText(line.unit)
    || [line.usage, line.lossRate, line.unitPrice].some((value) => value !== null);
}

function meaningfulOther(line: OtherCostLine): boolean {
  return hasText(line.name) || hasText(line.specification)
    || line.amount !== null || [line.usage, line.lossRate, line.unitPrice].some((value) => value !== null);
}

export function fabricDescription(line: FabricCostLine): string {
  const parts = [
    line.composition.trim() || null,
    line.netWidthCm === null ? null : `净门幅 ${line.netWidthCm}cm`,
    line.gsm === null ? null : `克重 ${line.gsm}gsm`,
  ];
  return parts.filter((part): part is string => Boolean(part)).join(" / ");
}

function fabricConsumptionOrNull(line: FabricCostLine): number | null {
  if (line.segmentLengthCm === null) return null;
  if (line.purchaseUnit === "kg" && (line.netWidthCm === null || line.gsm === null)) return null;
  return fabricConsumption(line);
}

function fabricCostOrNull(line: FabricCostLine): number | null {
  return fabricConsumptionOrNull(line) === null || line.unitPrice === null ? null : fabricCostAmount(line);
}

function trimCostOrNull(line: TrimCostLine): number | null {
  return line.usage === null || line.unitPrice === null ? null : costLineAmount(line);
}

function otherCostOrNull(line: OtherCostLine): number | null {
  if (line.amount !== null) return line.amount;
  return line.usage === null || line.unitPrice === null ? null : otherCostAmount(line);
}

export function mapPriceVersionForExport(priceVersion: PriceVersion, revision: QuoteRevision): ExportPriceVersionData {
  const metrics = nullablePriceVersionMetrics(priceVersion, revision);
  const fabricRows = priceVersion.fabrics.filter(meaningfulFabric).map((line) => ({
    name: line.name,
    description: fabricDescription(line),
    supplier: line.supplier,
    unit: line.purchaseUnit === "kg" ? "kg" : "m",
    quantity: fabricConsumptionOrNull(line),
    unitPrice: line.unitPrice,
    estimatedCost: fabricCostOrNull(line),
    actualCost: null,
  }));
  const trimRows = priceVersion.trims.filter(meaningfulTrim).map((line) => ({
    name: line.name,
    description: line.specification,
    supplier: line.supplier,
    unit: line.unit,
    quantity: line.usage,
    unitPrice: line.unitPrice,
    estimatedCost: trimCostOrNull(line),
    actualCost: null,
  }));
  const laborRows = priceVersion.labor.value !== null || hasText(priceVersion.labor.description)
    ? [{
      name: "加工费",
      description: priceVersion.labor.description,
      supplier: "",
      unit: "RMB/件",
      quantity: null,
      unitPrice: null,
      estimatedCost: metrics.laborRmb,
      actualCost: revision.pricingParameters.laborCurrency === "USD" ? priceVersion.labor.value : null,
    }]
    : [];
  const otherCostRows = priceVersion.otherCosts.filter(meaningfulOther).map((line) => ({
    name: line.name,
    description: line.specification,
    supplier: "",
    unit: "RMB/件",
    quantity: null,
    unitPrice: null,
    estimatedCost: otherCostOrNull(line),
    actualCost: null,
  }));
  const garmentSellingPrice = metrics.garmentSellingPrice;
  return {
    priceVersion,
    fabricRows,
    trimRows,
    laborRows,
    outsourcingRows: [],
    otherCostRows,
    summary: {
      fabricCost: metrics.fabricCost,
      trimCost: metrics.trimCost,
      laborRmb: metrics.laborRmb,
      otherCost: metrics.otherCost,
      preMarkupTotal: metrics.preMarkupTotal,
      markupRate: revision.pricingParameters.markupRate,
      garmentSellingPrice,
      finalQuote: formatFinalQuote(garmentSellingPrice),
      customerTargetPrice: null,
      customerConfirmedPrice: revision.baseInfo.quoteType === "distribution"
        ? priceVersion.confirmation?.confirmedGarmentPrice ?? null
        : null,
    },
  };
}

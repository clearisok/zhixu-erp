import { nullablePriceVersionMetrics, type NullablePriceVersionMetrics } from "./quote-presentation.ts";
import { BASE_PRICE_VERSION_NAME, type EstimateCost, type FabricCostLine, type OtherCostLine, type PriceVersion, type Quote, type QuoteRevision, type TrimCostLine } from "./quote-view-model.ts";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function rowId(estimateId: string, kind: string, index: number): string {
  return `${estimateId}-${kind}-${index + 1}`;
}

export function sourcePriceVersionForEstimate(revision: QuoteRevision, sourcePriceVersionId?: string): PriceVersion {
  return revision.priceVersions.find((version) => version.id === sourcePriceVersionId)
    ?? revision.priceVersions.find((version) => version.name === BASE_PRICE_VERSION_NAME)
    ?? revision.priceVersions[0];
}

export function createEstimateCostFromRevision(input: {
  quoteId: string;
  revision: QuoteRevision;
  sourcePriceVersionId?: string;
  id: string;
  generatedAt: string;
  generatedBy: string;
}): EstimateCost {
  const source = sourcePriceVersionForEstimate(input.revision, input.sourcePriceVersionId);
  if (!source) throw new Error("来源报价版本没有可用于估算成本的价格版本");
  return {
    id: input.id,
    quoteId: input.quoteId,
    basedOnRevisionId: input.revision.revisionId,
    sourcePriceVersionId: source.id,
    generatedAt: input.generatedAt,
    generatedBy: input.generatedBy,
    ignoredForRevisionId: null,
    pricingParameters: clone(source.pricingParameters),
    fabrics: source.fabrics.map((line, index) => ({ ...clone(line), id: rowId(input.id, "fabric", index) })),
    trims: source.trims.map((line, index) => ({ ...clone(line), id: rowId(input.id, "trim", index) })),
    labor: clone(source.labor),
    otherCosts: source.otherCosts.map((line, index) => ({ ...clone(line), id: rowId(input.id, "other", index) })),
  };
}

export function estimateCostAsPriceVersion(estimate: EstimateCost): PriceVersion {
  return {
    id: estimate.sourcePriceVersionId,
    name: "估算成本",
    quantity: null,
    description: "",
    pricingParameters: estimate.pricingParameters,
    fabrics: estimate.fabrics,
    trims: estimate.trims,
    labor: estimate.labor,
    otherCosts: estimate.otherCosts,
    confirmation: null,
  };
}

export function estimateCostMetrics(estimate: EstimateCost): NullablePriceVersionMetrics {
  return nullablePriceVersionMetrics(estimateCostAsPriceVersion(estimate));
}

export function estimateCostTotal(estimate: EstimateCost): number | null {
  return estimateCostMetrics(estimate).preMarkupTotal;
}

export function estimateCostIsStale(quote: Pick<Quote, "defaultRevisionId">, estimate: EstimateCost): boolean {
  return estimate.basedOnRevisionId !== quote.defaultRevisionId
    && estimate.ignoredForRevisionId !== quote.defaultRevisionId;
}

export function activateEstimateCost(quote: Quote, estimate: EstimateCost): Quote {
  return {
    ...quote,
    activeEstimateCost: clone(estimate),
    estimateCostHistory: quote.activeEstimateCost
      ? [...quote.estimateCostHistory, clone(quote.activeEstimateCost)]
      : quote.estimateCostHistory,
  };
}

export function restoreHistoricalEstimateCost(quote: Quote, historicalId: string, input: { id: string; generatedAt: string; generatedBy: string }): Quote {
  const historical = quote.estimateCostHistory.find((item) => item.id === historicalId);
  if (!historical) throw new Error("没有找到历史估算成本");
  const restored: EstimateCost = {
    ...clone(historical),
    id: input.id,
    generatedAt: input.generatedAt,
    generatedBy: input.generatedBy,
    ignoredForRevisionId: null,
    fabrics: historical.fabrics.map((line, index) => ({ ...clone(line), id: rowId(input.id, "fabric", index) })),
    trims: historical.trims.map((line, index) => ({ ...clone(line), id: rowId(input.id, "trim", index) })),
    otherCosts: historical.otherCosts.map((line, index) => ({ ...clone(line), id: rowId(input.id, "other", index) })),
  };
  return activateEstimateCost(quote, restored);
}

export function ignoreEstimateCostForCurrentRevision(quote: Quote): Quote {
  if (!quote.activeEstimateCost) return quote;
  return { ...quote, activeEstimateCost: { ...quote.activeEstimateCost, ignoredForRevisionId: quote.defaultRevisionId } };
}

export function patchEstimateFabricLine(estimate: EstimateCost, lineId: string, patch: Partial<FabricCostLine>): EstimateCost {
  return { ...estimate, fabrics: estimate.fabrics.map((line) => line.id === lineId ? { ...line, ...patch, id: line.id } : line) };
}

export function patchEstimateTrimLine(estimate: EstimateCost, lineId: string, patch: Partial<TrimCostLine>): EstimateCost {
  return { ...estimate, trims: estimate.trims.map((line) => line.id === lineId ? { ...line, ...patch, id: line.id } : line) };
}

export function patchEstimateOtherLine(estimate: EstimateCost, lineId: string, patch: Partial<OtherCostLine>): EstimateCost {
  return { ...estimate, otherCosts: estimate.otherCosts.map((line) => line.id === lineId ? { ...line, ...patch, id: line.id } : line) };
}

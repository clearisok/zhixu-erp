/** Completeness only: never calculates, fills or rewrites pricing values. */
type Parameters = {
  manufacturingCountry: string;
  manufacturingPresetId?: string | null;
  markupRate: unknown;
  laborCurrency: string;
  usdCnyRate: unknown;
  includeFreight: boolean;
  freightName: string;
  freightAmount: unknown;
  configuration?: { sources: Array<{ field: string; source: string }> };
};
export function parameterConfigurationIsComplete(parameters: Parameters, sources = parameters.configuration?.sources): boolean {
  const source = (field: string) => sources?.find(item => item.field === field)?.source;
  // Older legitimate preset snapshots have no creation metadata. A technical
  // currency without an explicit/preset source is not a user-confirmed choice.
  const currencySource = source("laborCurrency") ?? (parameters.manufacturingPresetId ? "preset" : "technical_default");
  const freightSource = source("freight") ?? (parameters.manufacturingPresetId ? "preset" : "unset");
  return Boolean(parameters.manufacturingCountry) && currencySource !== "technical_default" && parameters.markupRate != null
    && !["technical_default", "unset"].includes(freightSource)
    && (!parameters.includeFreight || Boolean(parameters.freightName) && parameters.freightAmount != null)
    && (parameters.laborCurrency !== "USD" || parameters.usdCnyRate != null);
}

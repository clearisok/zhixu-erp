export type ConfirmedLaborCurrency = "CNY" | "USD";
export type ConfirmedCommercialTermsLinkage = "linked" | "unlinked";
export type ConfirmedCommercialTermsScope = "quote" | "sales_order";

export type ConfirmedCommercialTermsCurrentDto = {
  id: string;
  customerConfirmedPrice: string | null;
  customerConfirmedPriceCurrency: "CNY";
  confirmedLaborPrice: string | null;
  laborCurrency: ConfirmedLaborCurrency | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ConfirmedCommercialTermsDto = {
  linkage: ConfirmedCommercialTermsLinkage;
  scope: ConfirmedCommercialTermsScope | null;
  quoteProvenance: {
    quoteId: string;
    revisionId: string;
    priceVersionId: string;
  } | null;
  associatedSalesOrderIds: string[];
  current: ConfirmedCommercialTermsCurrentDto | null;
  /** Quote version checked under the transaction lock; not a new saved version. */
  verifiedQuoteVersion?: number;
};

export type UpdateConfirmedCommercialTermsInput = {
  expectedVersion: number;
  customerConfirmedPrice: string | null;
  confirmedLaborPrice: string | null;
  laborCurrency: ConfirmedLaborCurrency | null;
};

export type UpdateQuoteConfirmedCommercialTermsInput = UpdateConfirmedCommercialTermsInput & {
  expectedQuoteVersion: number;
};

export function isQuoteTermsServerLinkageActivated(value: string | undefined): boolean {
  return value === "true";
}

export type QuoteTermsConfirmationAuthority =
  | "legacy_local_pre_activation"
  | "proven_unlinked_local"
  | "linked_server"
  | "unknown_blocked";

export function resolveQuoteTermsConfirmationAuthority(input: {
  activated: boolean;
  lookupReady: boolean;
  linkage: ConfirmedCommercialTermsLinkage | null;
}): QuoteTermsConfirmationAuthority {
  if (!input.activated) return "legacy_local_pre_activation";
  if (!input.lookupReady || input.linkage === null) return "unknown_blocked";
  return input.linkage === "linked" ? "linked_server" : "proven_unlinked_local";
}

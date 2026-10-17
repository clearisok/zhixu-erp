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
  customerConfirmedPrice?: string | null;
  confirmedLaborPrice?: string | null;
  laborCurrency?: ConfirmedLaborCurrency | null;
};

export type CommercialField<T> = { visibility: "allowed"; value: T } | { visibility: "restricted" };
export type ConfirmedCommercialTermsReadDto = Omit<ConfirmedCommercialTermsDto, "current"> & {
  contract: "commercial-terms-read.v1";
  current: (Pick<ConfirmedCommercialTermsCurrentDto, "id" | "version" | "createdAt" | "updatedAt"> & {
    sale: CommercialField<{ price: string | null; currency: "CNY" }>;
    labor: CommercialField<{ price: string | null; currency: ConfirmedLaborCurrency | null }>;
  }) | null;
};

export type UpdateQuoteConfirmedCommercialTermsInput = UpdateConfirmedCommercialTermsInput & {
  expectedQuoteVersion: number;
};

/** UI compatibility shape: restricted values are absent, never null placeholders. */
export type ConfirmedCommercialTermsClientDto = Omit<ConfirmedCommercialTermsDto,"current"> & {
 current:(Pick<ConfirmedCommercialTermsCurrentDto,"id"|"version"|"createdAt"|"updatedAt"> & Partial<Omit<ConfirmedCommercialTermsCurrentDto,"id"|"version"|"createdAt"|"updatedAt">> & {
  saleVisibility:"allowed"|"restricted";
  laborVisibility:"allowed"|"restricted";
 }) | null;
};
export function commercialTermsSummary(dto:ConfirmedCommercialTermsClientDto|null,laborOnly=false):string {
 const c=dto?.current;
 if (!c) return "尚无共享确认记录";
 const labor=`工价 ${c.laborVisibility==="restricted"?"无权查看":`${c.confirmedLaborPrice??"未确认"} ${c.laborCurrency??"未设置"}`}`;
 return laborOnly?labor:`${labor} · 成衣 ${c.saleVisibility==="restricted"?"无权查看":`${c.customerConfirmedPrice??"未确认"} CNY`}`;
}

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

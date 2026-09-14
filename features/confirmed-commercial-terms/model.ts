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
};

export type UpdateConfirmedCommercialTermsInput = {
  expectedVersion: number;
  customerConfirmedPrice: string | null;
  confirmedLaborPrice: string | null;
  laborCurrency: ConfirmedLaborCurrency | null;
};

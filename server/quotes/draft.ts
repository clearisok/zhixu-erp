import type { TrustedIdentity } from "../auth/session.js";
import type { ServerQuote } from "./model.js";
import { shanghaiDate } from "./numbering.js";

export type ServerQuoteDraftIdentity = {
  quoteId: string;
  revisionId: string;
  priceVersionId: string;
  quoteCode: string;
};

/** Neutral structural defaults only. This factory never reads Browser masters/settings. */
export function createServerQuoteDraft(
  identity: ServerQuoteDraftIdentity,
  actor: TrustedIdentity,
  createdAt: Date,
): ServerQuote {
  const createdAtIso = createdAt.toISOString();
  return {
    id: identity.quoteId,
    quoteCode: identity.quoteCode,
    deletedAt: null,
    defaultRevisionId: identity.revisionId,
    currentRevisionId: identity.revisionId,
    aggregateStatus: "draft",
    activeEstimateCost: null,
    estimateCostHistory: [],
    revisions: [{
      revisionId: identity.revisionId,
      revisionLabel: "V1",
      parentRevisionId: null,
      mainlineVersion: 1,
      branchSequence: null,
      basedOnConfirmedRevisionId: null,
      createdAt: createdAtIso,
      createdBy: actor.userName,
      reason: "初始报价",
      note: "",
      readOnly: false,
      baseInfo: {
        brandId: "",
        brandName: "",
        salespersonId: "",
        salespersonName: "",
        quoteType: "distribution",
        quoteStyleNo: "",
        styleName: "",
        quoteDate: shanghaiDate(createdAt).isoDate,
        fabricLeadDate: null,
        garmentLeadDate: null,
        note: "",
      },
      priceVersions: [{
        id: identity.priceVersionId,
        name: "基础价格",
        quantity: null,
        description: "",
        pricingParameters: {
          manufacturingCountry: "",
          manufacturingPresetId: null,
          manufacturingPresetName: "",
          laborCurrency: "CNY",
          usdCnyRate: null,
          markupRate: null,
          includeFreight: false,
          freightName: "运费",
          freightAmount: null,
        },
        fabrics: [],
        trims: [],
        labor: { value: null, description: "" },
        otherCosts: [],
        confirmation: null,
      }],
      imageAttachmentIds: [],
      fileAttachmentIds: [],
      styleImageAttachmentId: null,
      confirmationSummary: { confirmedCount: 0, totalCount: 1 },
    }],
  };
}

import type { QuoteRecord, ServerQuote } from "./model.js";
import type { TrustedIdentity } from "../auth/session.js";

type Revision=ServerQuote["revisions"][number];
type Price=Revision["priceVersions"][number];
const attachmentReference = (ref: NonNullable<Revision["garmentMedia"]>[number]) => ({ id: ref.id, fileName: ref.fileName, fileType: ref.fileType, url: ref.url });
export type QuoteContent=Omit<ServerQuote,"activeEstimateCost"|"estimateCostHistory">;
export type CostRestrictedPrice=Pick<Price,"id"|"name"|"quantity"|"description">;
export type CostRestrictedRevision=Omit<Revision,"priceVersions"> & {priceVersions:CostRestrictedPrice[]};
export type CostRestrictedQuote=Omit<QuoteContent,"revisions"> & {revisions:CostRestrictedRevision[]};
export type CostRestrictedRecord={quote:CostRestrictedQuote;version:number;costVisibility:"restricted";estimateVisibility:"restricted"};
export type CommercialVisibility = {sale:"allowed"|"restricted";labor:"allowed"|"restricted"};
type ProjectedConfirmation = Omit<NonNullable<Price["confirmation"]>, "quotedGarmentPrice"|"confirmedGarmentPrice"|"confirmedLaborPrice"> & Partial<Pick<NonNullable<Price["confirmation"]>, "quotedGarmentPrice"|"confirmedGarmentPrice"|"confirmedLaborPrice">>;
export type CommercialQuoteContent = Omit<QuoteContent,"revisions"> & Partial<Pick<ServerQuote,"activeEstimateCost"|"estimateCostHistory">> & {revisions:(Omit<Revision,"priceVersions"> & {priceVersions:(Omit<Price,"confirmation"> & {confirmation:ProjectedConfirmation|null})[]})[]};
export type ReadableQuoteRecord=(QuoteRecord | {quote:QuoteContent;version:number;estimateVisibility:"restricted"} | {quote:CommercialQuoteContent;version:number;estimateVisibility?:"restricted";commercialVisibility:CommercialVisibility}) & {costVisibility?:never};
export type QuoteResponseRecord=ReadableQuoteRecord|CostRestrictedRecord;
export type QuoteSaveContent=(QuoteContent|CostRestrictedQuote)&Partial<Pick<ServerQuote,"activeEstimateCost"|"estimateCostHistory">>;

/** Allowlist: no nested cost, parameters, confirmation, derived/unknown fields. */
export function costRestrictedQuote(quote:ServerQuote):CostRestrictedQuote {
 return {
  id:quote.id,quoteCode:quote.quoteCode,deletedAt:quote.deletedAt,defaultRevisionId:quote.defaultRevisionId,
  ...(quote.currentRevisionId!==undefined?{currentRevisionId:quote.currentRevisionId}:{}),aggregateStatus:quote.aggregateStatus,
  revisions:quote.revisions.map(r=>({
   revisionId:r.revisionId,revisionLabel:r.revisionLabel,parentRevisionId:r.parentRevisionId,mainlineVersion:r.mainlineVersion,branchSequence:r.branchSequence,
   basedOnConfirmedRevisionId:r.basedOnConfirmedRevisionId,createdAt:r.createdAt,createdBy:r.createdBy,reason:r.reason,note:r.note,readOnly:r.readOnly,
   ...(r.revisionNote!==undefined?{revisionNote:r.revisionNote}:{}),
   baseInfo:{brandId:r.baseInfo.brandId,brandName:r.baseInfo.brandName,salespersonId:r.baseInfo.salespersonId,salespersonName:r.baseInfo.salespersonName,
    quoteType:r.baseInfo.quoteType,quoteStyleNo:r.baseInfo.quoteStyleNo,styleName:r.baseInfo.styleName,quoteDate:r.baseInfo.quoteDate,
    fabricLeadDate:r.baseInfo.fabricLeadDate,garmentLeadDate:r.baseInfo.garmentLeadDate,note:r.baseInfo.note},
   priceVersions:r.priceVersions.map(p=>({id:p.id,name:p.name,quantity:p.quantity,description:p.description})),
   imageAttachmentIds:[...r.imageAttachmentIds],fileAttachmentIds:[...r.fileAttachmentIds],styleImageAttachmentId:r.styleImageAttachmentId,
   ...(r.garmentMedia?{garmentMedia:r.garmentMedia.map(attachmentReference)}:{}),...(r.quoteDocuments?{quoteDocuments:r.quoteDocuments.map(attachmentReference)}:{}),
   confirmationSummary:{confirmedCount:r.confirmationSummary.confirmedCount,totalCount:r.confirmationSummary.totalCount},
  })),
 };
}
export function projectQuoteResponse(actor:TrustedIdentity,record:QuoteRecord):QuoteResponseRecord {
 if(!actor.permissions.includes("quote.cost.view")) return{quote:costRestrictedQuote(record.quote),version:record.version,costVisibility:"restricted",estimateVisibility:"restricted"};
 const sale = actor.permissions.includes("commercial.sale.view"), labor = actor.permissions.includes("commercial.labor.view");
 if (!sale || !labor) {
  // EstimateCost has no confirmation fields; its existing grant stays independent.
  const {activeEstimateCost: _active, estimateCostHistory: _history, ...content} = record.quote;
  void _active; void _history;
  const quote:CommercialQuoteContent = {...content,revisions:content.revisions.map(revision=>({...revision,priceVersions:revision.priceVersions.map(price=>{
   if (!price.confirmation) return price;
   const confirmation:ProjectedConfirmation={...price.confirmation};
   if (!sale) {delete confirmation.quotedGarmentPrice;delete confirmation.confirmedGarmentPrice;}
   if (!labor) delete confirmation.confirmedLaborPrice;
   return {...price,confirmation};
  })}))};
  const estimateAllowed = actor.permissions.includes("estimate.view");
  if (estimateAllowed) {quote.activeEstimateCost=record.quote.activeEstimateCost;quote.estimateCostHistory=record.quote.estimateCostHistory;}
  return {quote,version:record.version,...(!estimateAllowed?{estimateVisibility:"restricted" as const}:{}),commercialVisibility:{sale:sale?"allowed":"restricted",labor:labor?"allowed":"restricted"}};
 }
 if(actor.permissions.includes("estimate.view"))return record;
 const quote:QuoteContent & Partial<Pick<ServerQuote,"activeEstimateCost"|"estimateCostHistory">>={...record.quote}; delete quote.activeEstimateCost;delete quote.estimateCostHistory;
 return{quote,version:record.version,estimateVisibility:"restricted"};
}

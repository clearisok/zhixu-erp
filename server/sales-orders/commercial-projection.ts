import type {TrustedIdentity} from '../auth/session.js';
import type {OrderCommercialVersion} from './commercial-version-service.js';
import type {CommercialCandidate} from './commercial-source.js';
import {pricingMode,projectPricingLines} from './color-commercial.js';
/** Explicit allowlist: raw rows and free-form notes never cross a restricted read. */
export function projectOrderCommercialVersion(actor:TrustedIdentity,row:OrderCommercialVersion){
 const sale=actor.permissions.includes('commercial.sale.view'),labor=actor.permissions.includes('commercial.labor.view');
 return {id:row.id,salesOrderId:row.salesOrderId,version:row.version,quoteId:row.quoteId,revisionId:row.revisionId,priceVersionId:row.priceVersionId,quoteVersion:row.quoteVersion,sourceKind:row.sourceKind,sourceCctId:row.sourceCctId,sourceCctVersion:row.sourceCctVersion,sourceConfirmedAt:row.sourceConfirmedAt,adoptedAt:row.adoptedAt,
  sale:sale?{visibility:'allowed' as const,value:{price:row.salePrice,currency:row.saleCurrency}}:{visibility:'restricted' as const},
  labor:labor?{visibility:'allowed' as const,value:{price:row.laborPrice,currency:row.laborCurrency}}:{visibility:'restricted' as const},
  ...(row.lines?{pricingMode:pricingMode(row.lines),lines:projectPricingLines(actor,row.lines)}:{}),
  ...(sale&&labor?{reason:row.reason}:{})};
}
export function projectOrderCommercialState(actor:TrustedIdentity,state:{version:number;current:OrderCommercialVersion|null}){
 return {contract:state.current?.lines?'order-commercial-read.v2' as const:'order-commercial-read.v1' as const,version:state.version,current:state.current?projectOrderCommercialVersion(actor,state.current):null};
}
export function projectCommercialCandidate(actor:TrustedIdentity,row:CommercialCandidate){
 const sale=actor.permissions.includes('commercial.sale.view'),labor=actor.permissions.includes('commercial.labor.view');
 return {quoteId:row.quoteId,revisionId:row.revisionId,priceVersionId:row.priceVersionId,quoteVersion:row.quoteVersion,quoteType:row.quoteType,sourceKind:row.sourceKind,sourceCctId:row.sourceCctId,sourceCctVersion:row.sourceCctVersion,sourceConfirmedAt:row.sourceConfirmedAt,
  ...(sale&&labor?{fingerprint:row.fingerprint}:{}),
  sale:sale?{visibility:'allowed' as const,value:{price:row.salePrice,currency:row.saleCurrency}}:{visibility:'restricted' as const},
  labor:labor?{visibility:'allowed' as const,value:{price:row.laborPrice,currency:row.laborCurrency}}:{visibility:'restricted' as const}};
}

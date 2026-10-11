import type { TrustedIdentity } from "../auth/session.js";
import type { ConfirmedCommercialTermsDto, ConfirmedCommercialTermsCurrentDto } from "../../features/confirmed-commercial-terms/model.js";
export type CommercialReadGrant={sale:boolean;labor:boolean};
export type CommercialField<T>={visibility:"allowed";value:T}|{visibility:"restricted"};
type Current=Omit<ConfirmedCommercialTermsCurrentDto,"customerConfirmedPrice"|"customerConfirmedPriceCurrency"|"confirmedLaborPrice"|"laborCurrency">&{
 sale:CommercialField<{price:string|null;currency:"CNY"}>;
 labor:CommercialField<{price:string|null;currency:"CNY"|"USD"|null}>;
};
export type CommercialReadProjection=Omit<ConfirmedCommercialTermsDto,"current">&{contract:"commercial-terms-read.v1";current:Current|null};
/** Prepared only: no catalog keys/default roles or endpoint/write-policy changes. */
export function createCommercialReadProjection(resolve:(actor:TrustedIdentity,dto:ConfirmedCommercialTermsDto)=>CommercialReadGrant=()=>({sale:false,labor:false})) {
 return(actor:TrustedIdentity,dto:ConfirmedCommercialTermsDto):CommercialReadProjection=>{
  const grant=resolve(actor,dto),c=dto.current;
  return{contract:"commercial-terms-read.v1",linkage:dto.linkage,scope:dto.scope,quoteProvenance:dto.quoteProvenance?{...dto.quoteProvenance}:null,
   associatedSalesOrderIds:[...dto.associatedSalesOrderIds],...(dto.verifiedQuoteVersion!==undefined?{verifiedQuoteVersion:dto.verifiedQuoteVersion}:{}),
   current:c?{id:c.id,version:c.version,createdAt:c.createdAt,updatedAt:c.updatedAt,
    sale:grant.sale?{visibility:"allowed",value:{price:c.customerConfirmedPrice,currency:"CNY"}}:{visibility:"restricted"},
    labor:grant.labor?{visibility:"allowed",value:{price:c.confirmedLaborPrice,currency:c.laborCurrency}}:{visibility:"restricted"},
   }:null,
  };
 };
}
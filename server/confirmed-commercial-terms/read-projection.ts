import type { TrustedIdentity } from "../auth/session.js";
import type { ConfirmedCommercialTermsDto, ConfirmedCommercialTermsReadDto } from "../../features/confirmed-commercial-terms/model.js";
export type CommercialReadGrant={sale:boolean;labor:boolean};
export type CommercialReadProjection=ConfirmedCommercialTermsReadDto;
/** The domain row stays complete; only this trusted projection crosses HTTP. */
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
export const projectCommercialTerms = createCommercialReadProjection(actor => ({
 sale: actor.permissions.includes("commercial.sale.view"),
 labor: actor.permissions.includes("commercial.labor.view"),
}));

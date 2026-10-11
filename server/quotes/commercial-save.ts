import type { TrustedIdentity } from "../auth/session.js";
import { HttpError } from "../http/errors.js";
import type { ServerQuote } from "./model.js";
import type { QuoteSaveContent } from "./quote-response.js";

/** Only the saved CAS baseline may supply fields omitted by read projection. */
export function restoreRestrictedConfirmation(actor: TrustedIdentity, content: QuoteSaveContent, saved: ServerQuote): QuoteSaveContent {
 const keys = [
  ...(!actor.permissions.includes("commercial.sale.view") ? ["quotedGarmentPrice", "confirmedGarmentPrice"] as const : []),
  ...(!actor.permissions.includes("commercial.labor.view") ? ["confirmedLaborPrice"] as const : []),
 ];
 if (!keys.length) return content;
 const next = structuredClone(content);
 for (const revision of next.revisions) for (const price of revision.priceVersions) {
  if (!("confirmation" in price) || !price.confirmation) continue;
  const original = saved.revisions.find(r=>r.revisionId===revision.revisionId)?.priceVersions.find(p=>p.id===price.id)?.confirmation;
  for (const key of keys) {
   if (Object.hasOwn(price.confirmation,key)) throw new HttpError(403,"commercial_field_restricted","Protected confirmation fields must not be submitted");
   if (original) Object.assign(price.confirmation, {[key]:original[key]});
  }
 }
 return next;
}

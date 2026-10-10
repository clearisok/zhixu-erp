import type { ConfirmedCommercialTermsDto } from '../confirmed-commercial-terms/model.ts';
import type { TrustedIdentity } from '../../server/auth/session.ts';

export type CommercialReadDecision = { salesPrice: boolean; laborPrice: boolean };
export type CommercialReadPolicy = (actor: TrustedIdentity) => CommercialReadDecision;
/** No new permission key or role default is selected here. Absent policy denies fields.
 * Read-only whitelist; protected omission is not an authoritative null/write command.
 */
export function projectMaterialCommercialContext(actor: TrustedIdentity, terms: ConfirmedCommercialTermsDto,
  policy?: CommercialReadPolicy) {
  const allowed = policy?.(actor) ?? { salesPrice: false, laborPrice: false };
  return { linkage: terms.linkage, commercialVisibility: { salesPrice: allowed.salesPrice ? 'visible' : 'restricted',
    laborPrice: allowed.laborPrice ? 'visible' : 'restricted' },
    ...(allowed.salesPrice ? { salesPrice: terms.current?.customerConfirmedPrice ?? null, salesCurrency: 'CNY' as const } : {}),
    ...(allowed.laborPrice ? { laborPrice: terms.current?.confirmedLaborPrice ?? null, laborCurrency: terms.current?.laborCurrency ?? null } : {}) };
}

import type { ClosingMonthLine } from '../../../server/closing/month-plan-model';
import { sumMonthQuantities } from '../../../server/closing/month-plan-model';
import { closingAmount } from '../../../server/closing/contract';
import { summarizeYearAmounts, type ClosingYearAmount } from '../../../server/closing/annual-model';
import type { ClosingBasis, ClosingPeriods, ClosingVisibility } from './closing-projection';

/** A read-only illustration using the same adopted-price projection and exact
 * arithmetic. It is not a financial adoption, a CCT read or a second price API. */
export function closingMoveReference(basis: ClosingBasis, periods: ClosingPeriods['items'], before: ClosingMonthLine[], after: ClosingMonthLine[], touchedMonths: string[], view: ClosingVisibility) {
  const taxes = new Map(periods.map(period => [period.month, period.taxRatePercent]));
  const sale = view.sale && basis.priceLines.every(line => line.garmentSale?.visibility !== 'restricted');
  const work = view.work && basis.priceLines.every(line => line.workPrice.visibility !== 'restricted');
  function amount(line: ClosingMonthLine, channel: 'sale' | 'work'): ClosingYearAmount {
    const currency = channel === 'sale' ? 'CNY' as const : 'USD' as const;
    if (!(channel === 'sale' ? sale : work)) return { visibility: 'restricted' };
    if (channel === 'sale' && basis.order.businessType === 'processing') return { visibility: 'allowed', currency: 'CNY', state: 'not_applicable' };
    const prices = basis.priceLines.filter(price => price.colorId === line.colorId), p = prices.length === 1 ? (channel === 'sale' ? prices[0].garmentSale : prices[0].workPrice) : null;
    const block = (reason: string): ClosingYearAmount => ({ visibility: 'allowed', currency, state: 'blocked', reason });
    if (!p || p.visibility !== 'allowed') return block('color_price_mapping_required');
    if (p.eligibility.state !== 'eligible') return block(p.eligibility.reason);
    if (!p.value || p.value.price === null || p.value.currency !== currency) return block('commercial_price_required');
    const tax = line.month === null ? null : taxes.get(line.month) ?? null;
    if (channel === 'sale' && tax === null) return block('period_tax_required');
    return { visibility: 'allowed', currency, state: 'known', price: p.value.price, amount: closingAmount(line.quantity, p.value.price, channel === 'sale' ? tax : null) };
  }
  // The strict preview parser proves this touched set. Never reprice unrelated
  // confirmed/locked months using today's adopted terms.
  const months: (string | null)[] = [...new Set(touchedMonths)];
  if (sumMonthQuantities(before.filter(line => line.month === null)) !== sumMonthQuantities(after.filter(line => line.month === null))) months.push(null);
  months.sort((a, b) => (a ?? '9999-99').localeCompare(b ?? '9999-99'));
  return months.map(month => {
    const summarize = (rows: ClosingMonthLine[]) => ({ sale: summarizeYearAmounts(rows.map(line => amount(line, 'sale')), 'CNY', sale), work: summarizeYearAmounts(rows.map(line => amount(line, 'work')), 'USD', work) });
    return { month, before: summarize(before.filter(line => line.month === month)), after: summarize(after.filter(line => line.month === month)) };
  });
}

import { HttpError } from '../http/errors.js';
import { canonicalDecimal } from '../quotes/decimal-projection.js';
import { planHash } from '../production-scheduling/repository.js';
import type { PermissionKey } from '../../features/permissions/model/permissions.js';

export type ClosingBusinessType = 'ainuoke_contract' | 'processing';
export type ClosingColor = { id: string; colorName: string; quantity: string; ambiguous: boolean };
export type ClosingPriceLine = {
  colorId: string | null; colorName: string | null; priceVersionId: string;
  salePrice: string | null; laborPrice: string | null; laborCurrency: 'CNY' | 'USD';
};
export type ClosingCommercialBasis = {
  id: string; version: number; quoteId: string; revisionId: string; quoteType: 'distribution' | 'processing';
  scope: 'legacy_uniform' | 'line_items'; lines: ClosingPriceLine[];
  /** Exact immutable consumption reference, not inferred from quote type or current price. */
  processingBatchId?: string | null;
};
type Scope = 'current_color' | 'order_wide' | 'removed_color' | 'historical_uniform' | 'unmatched_color';
type PriceBlock = 'commercial_not_adopted' | 'commercial_business_type_mismatch' | 'historical_uniform_requires_review'
  | 'color_identity_ambiguous' | 'color_price_mapping_required' | 'removed_color_requires_review'
  | 'sale_price_unconfirmed' | 'labor_price_unconfirmed' | 'usd_labor_version_required';
type Eligibility = { state: 'eligible'; reason: null } | { state: 'blocked'; reason: PriceBlock };
type PriceView = { visibility: 'restricted' } | {
  visibility: 'allowed'; value: { price: string | null; currency: 'CNY' | 'USD' } | null;
  eligibility: Eligibility; requiredCurrency: 'CNY' | 'USD';
};
export type ClosingPriceView = {
  colorId: string | null; colorName: string | null; quantity: string | null; scope: Scope;
  commercialVersionId: string | null; priceVersionId: string | null;
  garmentSale?: PriceView & { bucket?: 'garment_sales_cny' };
  workPrice: PriceView & { bucket?: 'distribution_labor_usd' | 'processing_service_usd' };
};
export const closingBasisFail = (status: number, code: string): never => { throw new HttpError(status, code, code); };
const blocked = (reason: PriceBlock): Eligibility => ({ state: 'blocked', reason });
function amount(value: string | null): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') return closingBasisFail(503, 'closing_commercial_basis_invalid');
  try { const normalized = canonicalDecimal(value); if (!normalized.startsWith('-') && normalized.length <= 2000) return normalized; } catch { /* closed shape below */ }
  return closingBasisFail(503, 'closing_commercial_basis_invalid');
}
/** Reads adopted order values only. Never resolves current Quote/CCT or recalculates cost. */
export function projectClosingPriceBasis(businessType: ClosingBusinessType, colors: readonly ClosingColor[],
  commercial: ClosingCommercialBasis | null, permissions: readonly PermissionKey[]): ClosingPriceView[] {
  if (colors.length > 1000 || (commercial?.lines.length ?? 0) > 1000) closingBasisFail(422, 'closing_basis_projection_limit');
  if (commercial && (!Number.isSafeInteger(commercial.version) || commercial.version < 1 || !commercial.lines.length)) closingBasisFail(503, 'closing_commercial_basis_invalid');
  const typeConflict = commercial !== null && (businessType === 'processing') !== (commercial.quoteType === 'processing');
  const lines = commercial?.lines ?? [], seen = new Set<string | null>();
  for (const line of lines) {
    if (seen.has(line.colorId) || !['CNY', 'USD'].includes(line.laborCurrency)) closingBasisFail(503, 'closing_commercial_basis_invalid');
    seen.add(line.colorId); amount(line.salePrice); amount(line.laborPrice);
  }
  type Match = { colorId: string | null; colorName: string | null; quantity: string | null; scope: Scope; line: ClosingPriceLine | null; reason: PriceBlock | null };
  let matches: Match[];
  if (commercial?.scope === 'legacy_uniform') {
    if (lines.length !== 1 || lines[0].colorId !== null) closingBasisFail(503, 'closing_commercial_basis_invalid');
    const batchConfirmed = businessType === 'processing' && !colors.length && Boolean(commercial.processingBatchId);
    matches = [{ colorId: null, colorName: batchConfirmed ? null : '历史统一价', quantity: null,
      scope: batchConfirmed ? 'order_wide' : 'historical_uniform', line: lines[0], reason: batchConfirmed ? null : 'historical_uniform_requires_review' }];
  } else if (!colors.length) {
    matches = lines.length ? lines.map(line => ({ colorId: line.colorId, colorName: line.colorName, quantity: null,
      scope: line.colorId === null ? 'order_wide' : 'removed_color', line, reason: line.colorId === null ? null : 'removed_color_requires_review' }))
      : [{ colorId: null, colorName: null, quantity: null, scope: 'order_wide', line: null, reason: 'commercial_not_adopted' }];
  } else {
    matches = colors.map(color => {
      const line = lines.find(item => item.colorId === color.id) ?? null;
      return { colorId: color.id, colorName: color.colorName, quantity: color.quantity, scope: line ? 'current_color' : 'unmatched_color', line,
        reason: color.ambiguous ? 'color_identity_ambiguous' : !commercial ? 'commercial_not_adopted' : !line ? 'color_price_mapping_required' : null };
    });
    for (const line of lines.filter(line => !colors.some(color => color.id === line.colorId))) matches.push({
      colorId: line.colorId, colorName: line.colorName, quantity: null, scope: 'removed_color', line, reason: 'removed_color_requires_review',
    });
  }
  return matches.map(match => {
    const reason = typeConflict ? 'commercial_business_type_mismatch' as const : match.reason;
    const sale = amount(match.line?.salePrice ?? null), labor = amount(match.line?.laborPrice ?? null);
    const saleView: PriceView = !permissions.includes('commercial.sale.view') ? { visibility: 'restricted' } : {
      visibility: 'allowed', value: match.line ? { price: sale, currency: 'CNY' } : null, requiredCurrency: 'CNY',
      eligibility: reason ? blocked(reason) : sale === null ? blocked('sale_price_unconfirmed') : { state: 'eligible', reason: null },
    };
    const laborView: PriceView = !permissions.includes('commercial.labor.view') ? { visibility: 'restricted' } : {
      visibility: 'allowed', value: match.line ? { price: labor, currency: match.line.laborCurrency } : null, requiredCurrency: 'USD',
      eligibility: reason ? blocked(reason) : labor === null ? blocked('labor_price_unconfirmed') : match.line?.laborCurrency !== 'USD'
        ? blocked('usd_labor_version_required') : { state: 'eligible', reason: null },
    };
    return { colorId: match.colorId, colorName: match.colorName, quantity: match.quantity, scope: match.scope,
      commercialVersionId: commercial?.id ?? null, priceVersionId: match.line?.priceVersionId ?? null,
      ...(businessType === 'processing' ? {} : { garmentSale: { ...saleView, ...(saleView.visibility === 'allowed' ? { bucket: 'garment_sales_cny' as const } : {}) } }),
      workPrice: { ...laborView, ...(laborView.visibility === 'allowed' ? { bucket: businessType === 'processing' ? 'processing_service_usd' as const : 'distribution_labor_usd' as const } : {}) },
    };
  });
}

export type ClosingExecutionReference = {
  assignmentId: string; salesOrderId: string; assignmentVersion: number; colorId: string | null;
  executionType: 'internal' | 'outsource'; executorId: string; resourceSnapshotHash: string;
  plannedQuantity: string; planStatus: 'planned' | 'cancelled';
  execution: { version: number; status: 'in_progress' | 'completed'; completedQuantity: string; actualStartDate: string | null; actualCompletedDate: string | null } | null;
};
function checkedReferences(rows: readonly ClosingExecutionReference[]) {
  if (rows.length > 500 || new Set(rows.map(row => row.assignmentId)).size !== rows.length) closingBasisFail(400, 'closing_execution_reference_invalid');
  const orders = new Set(rows.map(row => row.salesOrderId));
  if (orders.size > 1) closingBasisFail(400, 'closing_execution_reference_invalid');
  return rows;
}
/** Non-monetary only. A future writer must persist the reference, never trust a client hash. */
export function closingExecutionFingerprint(rows: readonly ClosingExecutionReference[]): string {
  return planHash([...checkedReferences(rows)].sort((a, b) => a.assignmentId.localeCompare(b.assignmentId)));
}
/** Only explicitly referenced assignments matter; an unrelated new plan is not a correction. */
export function compareClosingExecutionReferences(saved: readonly ClosingExecutionReference[], current: readonly ClosingExecutionReference[],
  periodStatus: 'open' | 'confirmed' | 'locked') {
  if (!['open', 'confirmed', 'locked'].includes(periodStatus)) closingBasisFail(400, 'closing_period_state_invalid');
  checkedReferences(saved); checkedReferences(current);
  if (saved.length && current.length && saved[0].salesOrderId !== current[0].salesOrderId) closingBasisFail(409, 'closing_execution_owner_changed');
  const changes = saved.flatMap(before => {
    const after = current.find(row => row.assignmentId === before.assignmentId), reasons: string[] = [];
    if (!after) return [{ assignmentId: before.assignmentId, reasons: ['referenced_assignment_unavailable'] }];
    if (after.salesOrderId !== before.salesOrderId) closingBasisFail(409, 'closing_execution_owner_changed');
    if (['assignmentVersion', 'colorId', 'executionType', 'executorId', 'resourceSnapshotHash', 'plannedQuantity', 'planStatus'].some(key => before[key as keyof ClosingExecutionReference] !== after[key as keyof ClosingExecutionReference])) reasons.push('assignment_basis_changed');
    if (!before.execution && after.execution) reasons.push('production_execution_recorded');
    else if (before.execution && !after.execution) reasons.push('production_execution_unavailable');
    else if (before.execution && after.execution) {
      if (before.execution.version !== after.execution.version) reasons.push('execution_version_changed');
      if (before.execution.completedQuantity !== after.execution.completedQuantity) reasons.push('completed_quantity_changed');
      if (before.execution.actualStartDate !== after.execution.actualStartDate || before.execution.actualCompletedDate !== after.execution.actualCompletedDate) reasons.push('actual_dates_changed');
      if (before.execution.status !== after.execution.status) reasons.push('execution_status_changed');
    }
    return reasons.length ? [{ assignmentId: before.assignmentId, reasons }] : [];
  });
  const changed = changes.length > 0;
  return { status: !changed ? 'unchanged' as const : periodStatus === 'locked' ? 'locked_snapshot_with_later_changes' as const : 'review_required' as const,
    changes, requiresReview: changed && periodStatus !== 'locked', lockedSnapshotPreserved: periodStatus === 'locked',
    canConfirm: !changed && periodStatus === 'open', canLock: !changed && periodStatus === 'confirmed' };
}

import type { MaterialDemand } from '../style-progress/model/style-progress.ts';
import type { MaterialNormalizedSourceRow, MaterialSemanticField } from '../style-progress/source/material-source-row.ts';

/** Operator-reviewed private receipt. Never accepted from a browser request or committed with real IDs. */
export type MaterialConfirmation = {
  id: string; salesContractNo: string; demandId: string; evidenceKey: string;
  confirmedBy: string; confirmedAt: string; evidenceReference: string;
  unit?: { value: string; acceptedSourceUnits: Array<string | null>; ratio: 1 };
  procurementResponsibility?: 'factory';
};
const evidenceFields: MaterialSemanticField[] = ['salesContractNo','materialType','materialCode','materialName',
  'sourceActualName','materialColor','garmentColors','specification','supplyMethod','requiredQuantity',
  'width','gsm','quantityUnit','purchaseOrderNo','purchaseSpecification','purchaseColor'];
/** Exact canonical evidence, not a short/weak identity hash. Repeated joined rows are a set.
 * Movement quantities/dates are deliberately excluded: a new delivery does not change unit meaning.
 * A changed demand, purchase identity, raw unit or supply method requires renewed review.
 */
export function materialConfirmationEvidence(demand: MaterialDemand, rows: MaterialNormalizedSourceRow[]): string {
  return JSON.stringify({ version: 1, demand: [demand.salesContractNo,demand.id,demand.materialType,demand.materialCode,
    demand.materialName,demand.materialColor,demand.specification,demand.requiredQuantity,demand.supplyMethod],
    rows: [...new Set(rows.map(row => JSON.stringify(evidenceFields.map(field => row.values[field] ?? null))))].sort(),
    ...(rows.some(row=>row.trace.sourceKind==='api'&&row.trace.reportId==='6087051') ? {
      purchaseUnits:[...new Set(rows.map(row=>JSON.stringify([row.detailIdentities?.demand,row.detailIdentities?.purchase??null,
        row.matchedUnits?.purchase?.status??null,row.matchedUnits?.purchase?.unit??null])))].sort(),
    } : {}) });
}
export const normalizeSourceUnit = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const unit = value.normalize('NFKC').trim();
  return unit && unit.length <= 16 && !/[\x00-\x1f\x7f]/.test(unit) ? unit : null;
};
export function resolveMaterialConfirmation(demand: MaterialDemand, rows: MaterialNormalizedSourceRow[], receipts: readonly MaterialConfirmation[]) {
  const candidates = receipts.filter(item => item.salesContractNo === demand.salesContractNo && item.demandId === demand.id);
  const none = { status: 'none' as 'none'|'applied'|'stale', unit: null as string|null, factory: false, id: null as string|null };
  if (!candidates.length) return none;
  const item = candidates[0];
  const units = [...new Set(rows.map(row => normalizeSourceUnit(row.values.quantityUnit)))];
  const sameUnits = (values: Array<string|null>) => values.length === new Set(values).size && values.length === units.length && units.every(unit => values.includes(unit));
  if (candidates.length !== 1 || !item.id?.trim() || !item.confirmedBy?.trim() || !item.evidenceReference?.trim()
    || !Number.isFinite(Date.parse(item.confirmedAt)) || item.evidenceKey !== materialConfirmationEvidence(demand,rows)
    || (!item.unit && !item.procurementResponsibility)
    || (item.procurementResponsibility !== undefined && item.procurementResponsibility !== 'factory')
    || (item.unit && (item.unit.ratio !== 1 || normalizeSourceUnit(item.unit.value) !== item.unit.value
      || !item.unit.value || !Array.isArray(item.unit.acceptedSourceUnits) || !sameUnits(item.unit.acceptedSourceUnits)))) {
    return {...none,status:'stale' as const};
  }
  return {status:'applied' as const,unit:item.unit?.value ?? null,factory:item.procurementResponsibility==='factory',id:item.id};
}

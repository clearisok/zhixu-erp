import type { AinuokeReportSnapshot } from '../../ainuoke-api/model/ainuoke-api.ts';
import type { RawCellValue } from '../model/style-progress.ts';
import type { MaterialSourceRow } from './material-source-row.ts';
import { normalizeSourceUnit } from '../../ainuoke-material-progress/confirmed-facts.ts';
import { AINUOKE_6087050_FIELD_MAP, type AinuokeMaterialApiSource } from './ainuoke-material-api-adapter.ts';

const text = (value: unknown) => String(value ?? '').normalize('NFKC').trim();
const contract = (value: unknown) => text(value).toUpperCase();
const id = (value: unknown): string | null => {
  const v = text(value);
  return /^(?:[1-9][0-9]*)$/.test(v) && (typeof value !== 'number' || Number.isSafeInteger(value)) ? v : null;
};
const flows = ['purchase', 'inbound', 'shipment', 'outbound'] as const;
const references = { purchase: 'cgmxid', inbound: 'rkmxid', shipment: 'cymxid', outbound: 'ckmxid' } as const;
const transactionFields = {
  purchase: ['cgid', 'cgdh', 'cgrq', 'cgnum', 'cgyyyl', 'cgprice', 'goodsamount', 'CurrencyName', 'SupplierName', 'cgtt', 'cgr', 'cgcnname', 'kpname', 'actualname', 'cgCnComposition', 'cgcncolor'],
  inbound: ['rkid', 'rkdh', 'rkrq', 'rknum'],
  shipment: ['cyid', 'cydh', 'cyrq', 'CYNum', 'TransType'],
  outbound: ['ckid', 'ckdh', 'ckrq', 'OutStoreNum'],
} as const;
const unitReports = {
  '6086405': { type: '面料', flow: 'purchase', parent: 'PurContractID', document: 'PurContractNo', quantity: 'OrderNum', refParent: 'cgid', refDocument: 'cgdh', refQuantity: 'cgnum' },
  '6086408': { type: '辅料', flow: 'purchase', parent: 'PurContractID', document: 'PurContractNo', quantity: 'OrderNum', refParent: 'cgid', refDocument: 'cgdh', refQuantity: 'cgnum' },
  '6086875': { type: '面料', flow: 'inbound', parent: 'MainID', document: 'FInStoreNo', quantity: 'Num', refParent: 'rkid', refDocument: 'rkdh', refQuantity: 'rknum' },
  '6086354': { type: '辅料', flow: 'inbound', parent: 'MainID', document: 'BillNo', quantity: 'Num', refParent: 'rkid', refDocument: 'rkdh', refQuantity: 'rknum' },
} as const;

/** Only rows and pagination counts are consumed. Report header sums never enter this adapter. */
function complete(pages: AinuokeReportSnapshot[]) {
  const sorted = [...pages].sort((a, b) => a.page - b.page), first = sorted[0];
  if (!first || !Number.isSafeInteger(first.total) || first.total < 0 || !Number.isSafeInteger(first.pageSize) || first.pageSize < 1
    || sorted.length !== Math.max(1, Math.ceil(first.total / first.pageSize))) throw new Error('it_material_paging');
  for (const [index, page] of sorted.entries()) {
    if (page.schemaVersion !== 'ainuoke-direct-read.v2' || page.reportId !== first.reportId || page.page !== index + 1
      || page.total !== first.total || page.pageSize !== first.pageSize || !Number.isFinite(Date.parse(page.fetchedAt))
      || page.rows.length !== Math.min(first.pageSize, Math.max(0, first.total - index * first.pageSize))) throw new Error('it_material_paging');
    for (const row of page.rows) {
      if (!row.sourceRowIdentity.startsWith(page.reportId + ':sha256:')) throw new Error('it_material_trace');
      for (const [key, value] of Object.entries(row.values)) {
        if (/password|passwd|credential|authorization|cookie|token|session|^pwd$/i.test(key)
          || value !== null && !['string', 'number', 'boolean'].includes(typeof value)
          || typeof value === 'number' && !Number.isFinite(value)) throw new Error('it_material_field');
      }
    }
  }
  return sorted;
}

function matchedUnits(row: Record<string, unknown>, supplemental: AinuokeReportSnapshot[]): MaterialSourceRow['matchedUnits'] {
  const result: NonNullable<MaterialSourceRow['matchedUnits']> = {};
  for (const flow of ['purchase', 'inbound', 'outbound'] as const) {
    const matches: Array<string | null> = [];
    let conflict = false;
    let missingIdentity = false;
    let basis: 'detail_main_document_quantity' | 'detail_document_purchase_material' = 'detail_main_document_quantity';
    for (const page of supplemental) {
      const mapping = unitReports[page.reportId as keyof typeof unitReports];
      if (mapping.flow !== flow || mapping.type !== text(row.lx) || !id(row[references[flow]])) continue;
      for (const candidate of page.rows) {
        const value = candidate.values;
        if (id(value.id) !== id(row[references[flow]])) continue;
        // Independent tables need not contain ExpContractNo. Exact main/detail
        // references plus document, quantity and source query establish the join.
        const sameQuantity = text(value[mapping.quantity]) !== '' && text(row[mapping.refQuantity]) !== ''
          && Number(value[mapping.quantity]) === Number(row[mapping.refQuantity]);
        if (!id(row[mapping.refParent]) || !text(row[mapping.refDocument])
          || text(value[mapping.document]) !== text(row[mapping.refDocument]) || !sameQuantity
          || value.ExpContractNo != null && contract(value.ExpContractNo) !== contract(row.ExpContractNo)) {
          conflict = true; continue;
        }
        if (id(value[mapping.parent]) !== id(row[mapping.refParent])) {
          // 6086354 actually omits MainID. Its detail ID, inbound document/quantity,
          // exact purchase document, factory order and purchased variant must ALL
          // match instead. Never infer a unit from a name or GoodsID alone.
          if (value[mapping.parent] != null) { conflict = true; continue; }
          const alternate = page.reportId === '6086354'
            && text(row.insideorderno) !== '' && text(value.InsideOrderNo) === text(row.insideorderno)
            && text(row.cgdh) !== '' && text(value.PurContractNo) === text(row.cgdh)
            && text(row.cgcnname) !== '' && text(value.CnName) === text(row.cgcnname)
            && text(row.cgCnComposition) !== '' && text(value.ProductSpec) === text(row.cgCnComposition)
            && text(value.CnColor) === text(row.cgcncolor);
          if (!alternate) { missingIdentity = true; continue; }
          basis = 'detail_document_purchase_material';
        }
        matches.push(normalizeSourceUnit(value.QtyUnit));
      }
    }
    const units = new Set(matches.filter((unit): unit is string => unit !== null));
    result[flow] = conflict || units.size > 1 ? { unit: null, status: 'conflict', reason: 'identity_conflict' }
      : !missingIdentity && matches.length && matches.every(Boolean) ? { unit: matches[0], status: 'matched', basis }
        : { unit: null, status: 'missing', reason: missingIdentity ? 'identity_fields_missing' : 'unit_missing' };
  }
  return result;
}

/** Server-only extension of the existing normalization input, never a legacy Browser import. */
export function adaptItMaterialSnapshots(input: AinuokeReportSnapshot[]): AinuokeMaterialApiSource {
  const main = complete(input.filter(page => page.reportId === '6087051'));
  const query = main[0].queryContext as Record<string, unknown>;
  const target = contract(query.salesContractNo);
  if (!target || main.some(page => Object.keys(page.queryContext).join(',') !== 'salesContractNo'
    || contract((page.queryContext as Record<string, unknown>).salesContractNo) !== target)) throw new Error('it_material_scope');
  if (main.some(page => page.rows.some(row => contract(row.values.ExpContractNo) !== target))) throw new Error('it_material_scope');
  const supplemental = input.filter(page => page.reportId !== '6087051');
  const groups = new Map<string, AinuokeReportSnapshot[]>();
  const insideNumbers = new Set(main.flatMap(page => page.rows.map(row => text(row.values.insideorderno))));
  const dates = main.map(page => Date.parse(page.fetchedAt));
  for (const page of supplemental) {
    if (!(page.reportId in unitReports) || Object.keys(page.queryContext).join(',') !== 'insideOrderNo'
      || !insideNumbers.has(text(page.queryContext.insideOrderNo))
      || Math.abs(Date.parse(page.fetchedAt) - Math.min(...dates)) > 600000) throw new Error('it_unit_evidence_scope');
    const key = page.reportId + ':' + text(page.queryContext.insideOrderNo);
    groups.set(key, [...(groups.get(key) ?? []), page]);
  }
  for (const pages of groups.values()) complete(pages);
  const sourceIdentities = new Map<string, string>();
  const rows: MaterialSourceRow[] = [];
  let duplicates = 0;
  for (const page of main) for (const row of page.rows) {
    const canonical = JSON.stringify(Object.entries(row.values).sort(([a], [b]) => a.localeCompare(b)));
    if (sourceIdentities.has(row.sourceRowIdentity)) {
      if (sourceIdentities.get(row.sourceRowIdentity) !== canonical) throw new Error('it_material_identity_collision');
      duplicates++; continue;
    }
    sourceIdentities.set(row.sourceRowIdentity, canonical);
    const demand = id(row.values.id);
    if (!demand) throw new Error('it_material_demand_identity');
    const detailIdentities: NonNullable<MaterialSourceRow['detailIdentities']> = { demand };
    for (const flow of flows) { const value = id(row.values[references[flow]]); if (value) detailIdentities[flow] = value; }
    rows.push({ trace: { sourceKind: 'api', reportId: '6087051', sourceSchemaVersion: 'ainuoke-direct-read.v2',
      sourceRowIdentity: row.sourceRowIdentity, snapshotHash: page.snapshotHash, fetchedAt: page.fetchedAt,
      queryContext: { insideOrderNo: '', salesContractNo: target } }, rawFields: { ...row.values } as Record<string, RawCellValue>,
      // 6087051 has no verified demand-unit field. A purchase unit cannot stand
      // in for demand, shipment or outbound units, even if a stray QtyUnit exists.
      values: Object.fromEntries(Object.entries(AINUOKE_6087050_FIELD_MAP).filter(([field]) => field !== 'quantityUnit').map(([field, upstream]) => [field, row.values[upstream]])),
      detailIdentities, matchedUnits: matchedUnits(row.values, supplemental), unallocatedFlows: [] });
  }
  // Do not allocate a whole shared transaction to each demand without evidence.
  const owners = new Map<string, Set<string>>();
  const transactionFacts = new Map<string, string>();
  for (const row of rows) for (const flow of flows) {
    const entity = row.detailIdentities![flow]; if (!entity) continue;
    const key = text(row.values.materialType) + ':' + flow + ':' + entity;
    const facts = JSON.stringify(transactionFields[flow].map(field => text(row.rawFields[field])));
    if (transactionFacts.has(key) && transactionFacts.get(key) !== facts) throw new Error('it_material_transaction_conflict');
    transactionFacts.set(key, facts);
    owners.set(key, new Set([...(owners.get(key) ?? []), row.detailIdentities!.demand]));
  }
  for (const row of rows) for (const flow of flows) {
    const entity = row.detailIdentities![flow];
    if (entity && (owners.get(text(row.values.materialType) + ':' + flow + ':' + entity)?.size ?? 0) > 1) row.unallocatedFlows!.push(flow);
  }
  return { rows, metadata: { schemaVersion: 'ainuoke-material-api-source.v1', sourceKind: 'api', reportId: '6087051',
    sourceSchemaVersion: 'ainuoke-direct-read.v2', fetchedAt: main.map(page => page.fetchedAt).sort().at(-1)!,
    query: { insideOrderNo: '', salesContractNo: target }, pages: main.map(page => ({ page: page.page, pageSize: page.pageSize,
      total: page.total, rowCount: page.rows.length, snapshotHash: page.snapshotHash })), reportedTotal: main[0].total,
    sourceRowCount: rows.length, uniqueSourceIdentityCount: rows.length, duplicateSourceRowsPrevented: duplicates,
    sourceIdentityCollisions: 0, repeatedUpstreamIdGroups: [...new Set(rows.map(row => row.detailIdentities!.demand))]
      .filter(demand => rows.filter(row => row.detailIdentities!.demand === demand).length > 1).length } };
}

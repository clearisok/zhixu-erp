import { readExcessWarehouse, type ExcessWarehouseFact } from './excess-warehouse.ts';
import { normalizeSourceUnit, resolveMaterialConfirmation, type MaterialConfirmation } from './confirmed-facts.ts';
import { compareMaterialQuantityFacts, type QuantityComparison } from "./quantity-facts.ts";
import type { AinuokeReportSnapshot } from '../ainuoke-api/model/ainuoke-api.ts';
import { normalizeAinuokeInsideOrderNo, normalizeAinuokeSalesContractNo } from '../ainuoke-sync/source/ainuoke-garment-color-size-adapter.ts';
import { isFactorySupplied, resolveCanonicalMaterialIdentity, type MaterialDemand, type MaterialInboundEvent, type MaterialReadinessStatus } from '../style-progress/model/style-progress.ts';
import { buildAinuokeMaterialApiPreview } from '../style-progress/service/ainuoke-material-api-preview.ts';
import { toAinuokeMaterialImportPreview } from '../style-progress/service/ainuoke-material-api-commit.ts';
import { deriveMaterialStatuses } from '../style-progress/service/style-progress-service.ts';

export type PreviewOrder = { salesContractNo: string; styleNo: string; insideOrderNo: string };
/** Explicit field allowlist: never expose a domain aggregate, raw row or commercial terms. */
export type ReadDemand = Pick<MaterialDemand,
  'id' | 'salesContractNo' | 'materialType' | 'materialCode' | 'materialName' | 'materialColor'
  | 'garmentColors' | 'specification' | 'supplyMethod' | 'requiredQuantity' | 'width' | 'gsm' | 'sourceMaterialDueDate'>;
export type ReadPurchase = {
  unit?: string | null; unitMatchStatus?: string;
  id: string; purchaseOrderNo: string; purchaseDate: string | null; supplier: string;
  quantity: number; color: string; specification: string;
  sourcePricing: { ownership: 'ainuoke_source'; currency: string | null; unitPrice: number | null; amount: number | null };
};
export type ReadMovement = Pick<MaterialInboundEvent, 'id' | 'documentNo' | 'eventDate' | 'quantity'> & { unit?: string | null; unitMatchStatus?: string };
export type ReadInbound = ReadMovement & { excessWarehouse: ExcessWarehouseFact };
export type ProgressRow = {
  demand: ReadDemand; canonicalKey: string; unit: string | null; unitStatus: 'known' | 'missing' | 'conflict';
  unitOrigin: 'source' | 'confirmed' | 'unknown'; sourceUnits: Array<string | null>;
  procurementResponsibility: 'guomao' | 'factory_confirmed'; confirmationStatus: 'none' | 'applied' | 'stale';
  purchases: ReadPurchase[]; inbounds: ReadInbound[];
  shipments: Array<ReadMovement & { transportMode: string }>; outbounds: ReadMovement[];
  purchased: number | null; purchaseShortfall: number | null; purchaseExcess: number | null;
  inbound: number | null; pendingInbound: number | null; shipped: number | null; outbound: number | null;
  status: MaterialReadinessStatus | null; issues: string[]; quantityComparison?: QuantityComparison;
};
export type MaterialItemCounts = {
  groups: number; demands: number; unknown: number;
  states: Record<MaterialReadinessStatus, number>;
};
export type MaterialSummary = {
  basis: 'demand_items'; quantitiesAggregatedAcrossDemands: false;
  fabric: MaterialItemCounts; trim: MaterialItemCounts; factoryExcluded: number;
};
export type MaterialProgressView = {
  schemaVersion: 'order-material-read.v1';
  sourceStatus: 'ready' | 'not_fetched' | 'not_connected' | 'incomplete' | 'identity_mismatch' | 'source_failed' | 'source_missing' | 'stale';
  message: string; order: PreviewOrder;
  fetchedAt: string | null; queryInsideOrderNo: string | null; insideOrderDrift: boolean;
  groups: Array<{ key: string; name: string; type: 'fabric' | 'trim'; rows: ProgressRow[] }>;
  rows: ProgressRow[]; factoryExcluded: number; duplicateSourceRows: number; duplicateEvents: number;
  summary: MaterialSummary;
};

const knownQuantity = (value: unknown) => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '')
  && Number.isFinite(Number(typeof value === 'string' ? value.replaceAll(',', '') : value))
  && Number(typeof value === 'string' ? value.replaceAll(',', '') : value) >= 0;
function byDemand<T extends { materialDemandId: string }>(events: T[]) {
  const index = new Map<string, T[]>();
  for (const event of events) { const items = index.get(event.materialDemandId) ?? []; items.push(event); index.set(event.materialDemandId, items); }
  return index;
}
const emptyCounts = (): MaterialItemCounts => ({ groups: 0, demands: 0, unknown: 0,
  states: { not_purchased: 0, purchasing: 0, pending_inbound: 0, ready: 0 } });
function summarize(view: Pick<MaterialProgressView, 'groups' | 'rows' | 'factoryExcluded'>): MaterialSummary {
  const summary: MaterialSummary = { basis: 'demand_items', quantitiesAggregatedAcrossDemands: false,
    fabric: emptyCounts(), trim: emptyCounts(), factoryExcluded: view.factoryExcluded };
  for (const group of view.groups) if (group.rows.some(row => row.procurementResponsibility !== 'factory_confirmed')) summary[group.type].groups++;
  for (const row of view.rows) {
    if (row.procurementResponsibility === 'factory_confirmed') continue;
    const counts = summary[row.demand.materialType]; counts.demands++;
    if (row.status === null) counts.unknown++; else counts.states[row.status]++;
  }
  return summary;
}
function readDemand(demand: MaterialDemand, contract: string): ReadDemand {
  return { id: demand.id, salesContractNo: contract, materialType: demand.materialType,
    materialCode: demand.materialCode, materialName: demand.materialName, materialColor: demand.materialColor,
    garmentColors: [...demand.garmentColors], specification: demand.specification, supplyMethod: demand.supplyMethod,
    requiredQuantity: demand.requiredQuantity, width: demand.width, gsm: demand.gsm,
    sourceMaterialDueDate: demand.sourceMaterialDueDate };
}
const readMovement = (event: MaterialInboundEvent): ReadMovement => ({ id: event.id,
  documentNo: event.documentNo, eventDate: event.eventDate, quantity: event.quantity });

/** Sole read projection for synthetic preview and the future trusted Server adapter.
 * This function does not authenticate callers. Server use must enter through read-service.ts.
 * Procurement prices are shared execution facts; Quote costs/terms and raw payloads are never returned.
 */
export function projectMaterialProgress(order: PreviewOrder, snapshots: AinuokeReportSnapshot[] | null, confirmations: readonly MaterialConfirmation[] = []): MaterialProgressView {
  const safeOrder: PreviewOrder = { salesContractNo: normalizeAinuokeSalesContractNo(order.salesContractNo),
    styleNo: order.styleNo, insideOrderNo: order.insideOrderNo };
  const view: MaterialProgressView = { schemaVersion: 'order-material-read.v1', sourceStatus: 'not_fetched',
    message: '数据未获取：尚无完整有效的 6087050 Source。', order: safeOrder,
    fetchedAt: null, queryInsideOrderNo: null, insideOrderDrift: false, groups: [], rows: [],
    factoryExcluded: 0, duplicateSourceRows: 0, duplicateEvents: 0,
    summary: summarize({ groups: [], rows: [], factoryExcluded: 0 }) };
  if (!snapshots?.length) return view;
  try {
    const target = safeOrder.salesContractNo;
    if (!target || snapshots.filter(page => page.reportId === '6087050' || page.reportId === '6087051').some(page => page.rows.some(row => normalizeAinuokeSalesContractNo(row.values.ExpContractNo) !== target))) {
      return { ...view, sourceStatus: 'identity_mismatch', message: '身份不匹配：Source 合同号与目标 SalesContractNo / BillNo 不一致，未关联任何物料。' };
    }
    const preview = buildAinuokeMaterialApiPreview({ snapshots });
    const source = preview.source;
    view.fetchedAt = source.fetchedAt;
    view.queryInsideOrderNo = source.query.insideOrderNo || null;
    view.insideOrderDrift = source.reportId === '6087050' && normalizeAinuokeInsideOrderNo(source.query.insideOrderNo) !== normalizeAinuokeInsideOrderNo(order.insideOrderNo);
    const rowCount = source.pages.reduce((total, page) => total + page.rowCount, 0);
    if (snapshots.some(page => !Number.isFinite(Date.parse(page.fetchedAt))) || rowCount !== source.reportedTotal
      || source.pages.some(page => !Number.isSafeInteger(page.total) || !Number.isSafeInteger(page.pageSize)
        || page.pageSize !== source.pages[0].pageSize || page.rowCount > page.pageSize
        || page.page < source.pages.length && page.rowCount !== page.pageSize)) {
      throw new Error('source_incomplete');
    }
    // Existing pure readiness validator, never its persistence command.
    if (preview.pipeline.demands.length && source.reportId === '6087050') toAinuokeMaterialImportPreview(preview, 'READ-ONLY PROJECTION');
    else if (preview.summary.rejectedRows || source.pages.some(page => page.total !== source.reportedTotal)) throw new Error('source_incomplete');
    const purchaseIndex = byDemand(preview.pipeline.purchaseEvents);
    const inboundIndex = byDemand(preview.pipeline.inboundEvents);
    const shipmentIndex = byDemand(preview.pipeline.shipmentEvents);
    const outboundIndex = byDemand(preview.pipeline.outboundEvents);
    const rawSourceIndex = new Map(preview.pipeline.rawRows.flatMap(raw => raw.trace.sourceKind === 'api' ? [[raw.trace.sourceRowIdentity, raw] as const] : []));
    const rawIndex = new Map<string, typeof preview.pipeline.rawRows>();
    for (const raw of preview.pipeline.rawRows) {
      if (!raw.normalizedDemandId) continue;
      const rows = rawIndex.get(raw.normalizedDemandId) ?? []; rows.push(raw); rawIndex.set(raw.normalizedDemandId, rows);
    }
    const groups = new Map<string, MaterialProgressView['groups'][number]>();
    for (const demand of preview.pipeline.demands) {
      // 6087051 supply method is a source fact, not proof that a demand is
      // irrelevant or supersedes another plan. Keep its identity and events.
      // The legacy import contract remains separate until its rules are reviewed.
      if (source.reportId !== '6087051' && isFactorySupplied(demand)) { view.factoryExcluded++; continue; }
      if (normalizeAinuokeSalesContractNo(demand.salesContractNo) !== target) throw new Error('source_identity');
      const purchases = purchaseIndex.get(demand.id) ?? [];
      const inbounds = inboundIndex.get(demand.id) ?? [];
      const shipments = shipmentIndex.get(demand.id) ?? [];
      const outbounds = outboundIndex.get(demand.id) ?? [];
      const sourceRows = rawIndex.get(demand.id) ?? [];
      const itSource = source.reportId === '6087051';
      const eventUnits = (refs: string[] | undefined, flow: 'purchase' | 'inbound' | 'outbound') => {
        if (!itSource) return {};
        const facts = (refs ?? []).map(ref => rawSourceIndex.get(ref)?.matchedUnits?.[flow]);
        const known = new Set(facts.map(fact => fact?.unit).filter(Boolean));
        const conflict = facts.some(fact => fact?.status === 'conflict') || known.size > 1;
        return {unit: !conflict && facts.length && facts.every(fact => fact?.status === 'matched') ? facts[0]!.unit : null,
          unitMatchStatus: conflict ? 'conflict' : facts.length && facts.every(fact => fact?.status === 'matched') ? 'matched' : 'missing'};
      };
      const units = sourceRows.map(raw => normalizeSourceUnit(raw.values.quantityUnit));
      const confirmation = resolveMaterialConfirmation(demand, sourceRows, confirmations);
      const rawUnitConflict = new Set(units.filter((unit): unit is string => unit !== null)).size > 1;
      const unitConflict = rawUnitConflict && confirmation.unit === null;
      const unit = confirmation.unit ?? (!unitConflict && units.length > 0 && units.every(value => value !== null) ? units[0] : null);
      const evidenceKnown = (quantityField: 'purchaseQuantity' | 'inboundQuantity' | 'shipmentQuantity' | 'outboundQuantity',
        documentField: 'purchaseOrderNo' | 'inboundDocumentNo' | 'shipmentDocumentNo' | 'outboundDocumentNo') => sourceRows.length > 0 && sourceRows.every(raw => {
        const flow = ({purchaseQuantity:'purchase',inboundQuantity:'inbound',shipmentQuantity:'shipment',outboundQuantity:'outbound'} as const)[quantityField];
        if (itSource && (flow === 'shipment' || unit === null || raw.unallocatedFlows?.includes(flow) || !raw.detailIdentities?.[flow]
          || raw.matchedUnits?.[flow]?.status !== 'matched' || normalizeSourceUnit(raw.matchedUnits?.[flow]?.unit) !== unit)) return false;
        const quantity = raw.values[quantityField];
        return knownQuantity(quantity) && (Number(typeof quantity === 'string' ? quantity.replaceAll(',', '') : quantity) === 0 || Boolean(String(raw.values[documentField] ?? '').trim()));
      });
      const purchased = !unitConflict && evidenceKnown('purchaseQuantity', 'purchaseOrderNo') ? purchases.reduce((total, event) => total + event.quantity, 0) : null;
      const inbound = !unitConflict && evidenceKnown('inboundQuantity', 'inboundDocumentNo') ? inbounds.reduce((total, event) => total + event.quantity, 0) : null;
      const shipped = !unitConflict && evidenceKnown('shipmentQuantity', 'shipmentDocumentNo') ? shipments.reduce((total, event) => total + event.quantity, 0) : null;
      const outbound = !unitConflict && evidenceKnown('outboundQuantity', 'outboundDocumentNo') ? outbounds.reduce((total, event) => total + event.quantity, 0) : null;
      if ([purchased, inbound, shipped, outbound].some(value => value !== null && !Number.isFinite(value))) throw new Error('source_quantity');
      const issues = [...(itSource ? ['按来源明细展示；单据有效状态未核实，齐套待核对', ...(isFactorySupplied(demand) ? ['厂供为来源标记；需求修订关系未确认，不自动替代或累加原申购，不据此认定工厂负责采购'] : []), ...(sourceRows.some(raw => raw.unallocatedFlows?.length) ? ['存在跨需求共享单据，分配数量待核对；不重复计入汇总'] : [])] : []), ...(confirmation.status === 'stale' ? ['人工确认与当前来源不一致，补充事实未应用，请重新核对'] : []),
        ...(confirmation.unit ? [`单位由人工确认补充；原始来源单位：${[...new Set(units)].map(value => value ?? '空白').join(' / ')}，不代表接口已补齐`] : []),
        ...(confirmation.unit && rawUnitConflict ? ['单位等价已确认，生产可用性尚未确认，暂停齐套判定'] : []),
        ...(confirmation.factory ? ['工厂自行采购，国贸无需催采；保留需求与流水，不代表工厂已到料'] : []),
        ...(unitConflict ? ['同一物料需求的来源计量单位冲突，数量汇总与状态判定已暂停'] : []),
        ...(!unitConflict && unit === null ? ['来源计量单位未知，数量仅按原始数值逐项展示'] : []),
        ...(purchased === null && !unitConflict ? [itSource ? '采购明细按原始数量保留，汇总口径待核对' : '采购来源数量缺失或无效，不能按零采购判定'] : []),
        ...(inbound === null && !unitConflict ? [itSource ? '入库明细按原始数量保留，汇总口径待核对' : '入库来源数量缺失或无效，不能判定齐套'] : []),
        ...(shipped === null && !unitConflict ? ['物料出运来源数量未知'] : []), ...(outbound === null && !unitConflict ? ['物料出库来源数量未知'] : [])];
      const pricingKnown = (references: string[] | undefined, field: 'purchaseUnitPrice' | 'purchaseAmount') => Boolean(references?.length)
        && references!.every(reference => {
          const value = rawSourceIndex.get(reference)?.values[field];
          return (typeof value === 'number' || typeof value === 'string' && value.trim() !== '')
            && Number.isFinite(Number(typeof value === 'string' ? value.replaceAll(',', '') : value));
        });
      const identity = resolveCanonicalMaterialIdentity({ ...demand, salesContractNo: target }, purchases);
      const row: ProgressRow = { demand: readDemand(demand, target), canonicalKey: identity.key, unit,
        unitStatus: unitConflict ? 'conflict' : unit === null ? 'missing' : 'known',
        unitOrigin: confirmation.unit ? 'confirmed' : unit ? 'source' : 'unknown', sourceUnits: [...new Set(units)],
        procurementResponsibility: confirmation.factory ? 'factory_confirmed' : 'guomao', confirmationStatus: confirmation.status,
        purchases: purchases.map(event => ({ ...eventUnits(event.sourceReferences, 'purchase'), id: event.id, purchaseOrderNo: event.purchaseOrderNo,
          purchaseDate: event.purchaseDate, supplier: event.supplier, quantity: event.quantity,
          color: event.color, specification: event.specification,
          sourcePricing: { ownership: 'ainuoke_source', currency: event.currency || null,
            unitPrice: pricingKnown(event.sourceReferences, 'purchaseUnitPrice') ? event.unitPrice : null,
            amount: pricingKnown(event.sourceReferences, 'purchaseAmount') ? event.amount : null } })),
        inbounds: inbounds.map(event => ({ ...readMovement(event), ...eventUnits(event.sourceReferences, 'inbound'),
          excessWarehouse: readExcessWarehouse(event.sourceReferences, rawSourceIndex, unit, unitConflict ? 'conflict' : unit === null ? 'missing' : 'known') })), shipments: shipments.map(event => ({ ...readMovement(event), transportMode: event.transportModeSnapshot })),
        outbounds: outbounds.map(event => ({...readMovement(event), ...eventUnits(event.sourceReferences, 'outbound')})), purchased, inbound, shipped, outbound,
        purchaseShortfall: itSource || purchased === null ? null : Math.max(0, demand.requiredQuantity - purchased),
        purchaseExcess: itSource || purchased === null ? null : Math.max(0, purchased - demand.requiredQuantity),
        pendingInbound: purchased === null || inbound === null ? null : Math.max(0, purchased - inbound),
        status: itSource || confirmation.factory || rawUnitConflict || purchased === null || inbound === null ? null : deriveMaterialStatuses(demand.requiredQuantity, purchased, inbound, 0, 0).readinessStatus, issues,
        quantityComparison: compareMaterialQuantityFacts(sourceRows.map(raw=>raw.values), purchased, unitConflict ? 'conflict' : unit===null ? 'missing' : 'known') };
      view.rows.push(row);
      let group = groups.get(identity.key);
      if (!group) { group = { key: identity.key, name: demand.materialName, type: demand.materialType, rows: [] }; groups.set(identity.key, group); }
      group.rows.push(row);
    }
    view.groups = [...groups.values()];
    view.duplicateSourceRows = source.duplicateSourceRowsPrevented;
    view.duplicateEvents = preview.pipeline.stats.duplicateEventRows;
    view.sourceStatus = 'ready'; view.summary = summarize(view);
    view.message = source.reportId === '6087051' ? '明细已读取；未核实单位或单据状态的部分标注待核对。'
      : view.rows.some(row => row.status === null) ? '完整分页已读取；部分数量来源不完整，这些物料暂停状态判定。' : '完整 Source 已校验；抓取时间不等于实时状态。';
    const currentDemands = new Set(preview.pipeline.demands.map(demand => demand.id));
    const unmatched = confirmations.filter(item => item.salesContractNo === target && !currentDemands.has(item.demandId)).length;
    if (unmatched) view.message += ` 有${unmatched}条人工确认未匹配当前需求，未应用，请重新核对。`;
    return view;
  } catch {
    // Never reflect Source/parser exception text: it may contain protected fields or raw values.
    return { ...view, sourceStatus: 'incomplete', message: '数据不完整：来源身份、分页或字段校验失败。不判定未采购或齐套。',
      fetchedAt: null, queryInsideOrderNo: null, insideOrderDrift: false,
      groups: [], rows: [], factoryExcluded: 0, duplicateSourceRows: 0, duplicateEvents: 0,
      summary: summarize({ groups: [], rows: [], factoryExcluded: 0 }) };
  }
}

export function filterProgressRows(view: MaterialProgressView, search: string, type: 'all' | 'fabric' | 'trim', status: 'all' | 'unknown' | MaterialReadinessStatus) {
  const needle = search.normalize('NFKC').trim().toLocaleLowerCase();
  return view.rows.filter(row => (type === 'all' || row.demand.materialType === type)
    && (status === 'all' || row.procurementResponsibility !== 'factory_confirmed' && (status === 'unknown' ? row.status === null : row.status === status))
    && (!needle || [row.demand.materialName, row.demand.materialCode, row.demand.materialColor, row.demand.specification,
      ...row.purchases.flatMap(event => [event.purchaseOrderNo, event.supplier])].join(' ').normalize('NFKC').toLocaleLowerCase().includes(needle)));
}

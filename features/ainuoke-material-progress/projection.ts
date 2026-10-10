import type { AinuokeReportSnapshot } from '../ainuoke-api/model/ainuoke-api.ts';
import { normalizeAinuokeSalesContractNo } from '../ainuoke-sync/source/ainuoke-garment-color-size-adapter.ts';
import { isFactorySupplied, resolveCanonicalMaterialIdentity, type MaterialDemand, type MaterialInboundEvent, type MaterialPurchaseEvent, type MaterialReadinessStatus } from '../style-progress/model/style-progress.ts';
import { buildAinuokeMaterialApiPreview } from '../style-progress/service/ainuoke-material-api-preview.ts';
import { toAinuokeMaterialImportPreview } from '../style-progress/service/ainuoke-material-api-commit.ts';
import { deriveMaterialStatuses } from '../style-progress/service/style-progress-service.ts';

export type PreviewOrder = { salesContractNo: string; styleNo: string; insideOrderNo: string };
export type ProgressRow = {
  demand: MaterialDemand; canonicalKey: string; purchases: MaterialPurchaseEvent[]; inbounds: MaterialInboundEvent[];
  purchased: number | null; purchaseShortfall: number | null; inbound: number | null; pendingInbound: number | null;
  status: MaterialReadinessStatus | null; issues: string[];
};
export type MaterialProgressView = {
  sourceStatus: 'ready' | 'not_fetched' | 'incomplete' | 'identity_mismatch'; message: string; order: PreviewOrder;
  fetchedAt: string | null; queryInsideOrderNo: string | null; insideOrderDrift: boolean;
  groups: Array<{ key: string; name: string; type: 'fabric' | 'trim'; rows: ProgressRow[] }>;
  rows: ProgressRow[]; factoryExcluded: number; duplicateSourceRows: number; duplicateEvents: number;
};

const knownQuantity = (value: unknown) => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '')
  && Number.isFinite(Number(typeof value === 'string' ? value.replaceAll(',', '') : value))
  && Number(typeof value === 'string' ? value.replaceAll(',', '') : value) >= 0;
function byDemand<T extends { materialDemandId: string }>(events: T[]) {
  const index = new Map<string, T[]>();
  for (const event of events) { const items = index.get(event.materialDemandId) ?? []; items.push(event); index.set(event.materialDemandId, items); }
  return index;
}

/** Read-only view over the existing Source/Normalize/Dedup/Validate domain. No repositories or commit calls. */
export function projectMaterialProgress(order: PreviewOrder, snapshots: AinuokeReportSnapshot[] | null): MaterialProgressView {
  const view: MaterialProgressView = { sourceStatus: 'not_fetched', message: '数据未获取：尚无完整有效的 6087050 Source。', order,
    fetchedAt: null, queryInsideOrderNo: null, insideOrderDrift: false, groups: [], rows: [], factoryExcluded: 0, duplicateSourceRows: 0, duplicateEvents: 0 };
  if (!snapshots?.length) return view;
  try {
    const target = normalizeAinuokeSalesContractNo(order.salesContractNo);
    if (!target || snapshots.some(page => page.rows.some(row => normalizeAinuokeSalesContractNo(row.values.ExpContractNo) !== target))) {
      return { ...view, sourceStatus: 'identity_mismatch', message: '身份不匹配：Source 合同号与目标 SalesContractNo / BillNo 不一致，未关联任何物料。' };
    }
    const preview = buildAinuokeMaterialApiPreview({ snapshots });
    const source = preview.source;
    view.fetchedAt = source.fetchedAt;
    view.queryInsideOrderNo = source.query.insideOrderNo;
    // Query drift is evidence, never the stable order/material identity.
    view.insideOrderDrift = source.query.insideOrderNo !== order.insideOrderNo;
    const rowCount = source.pages.reduce((total, page) => total + page.rowCount, 0);
    if (!Number.isFinite(Date.parse(source.fetchedAt)) || rowCount !== source.reportedTotal || source.pages.some(page => !Number.isSafeInteger(page.total) || !Number.isSafeInteger(page.pageSize) || page.pageSize !== source.pages[0].pageSize)) {
      throw new Error('分页数量与 reported total 不一致');
    }
    // Reuse the existing pure commit-readiness validator; never invoke its persistence command.
    if (preview.pipeline.demands.length) toAinuokeMaterialImportPreview(preview, 'SYNTHETIC READ-ONLY PREVIEW');
    else if (preview.summary.rejectedRows || source.pages.some(page => page.total !== source.reportedTotal)) throw new Error('来源行无效或分页不完整');
    const purchaseIndex = byDemand(preview.pipeline.purchaseEvents);
    const inboundIndex = byDemand(preview.pipeline.inboundEvents);
    const rawIndex = new Map<string, typeof preview.pipeline.rawRows>();
    for (const raw of preview.pipeline.rawRows) {
      if (!raw.normalizedDemandId) continue;
      const rows = rawIndex.get(raw.normalizedDemandId) ?? []; rows.push(raw); rawIndex.set(raw.normalizedDemandId, rows);
    }
    const groups = new Map<string, MaterialProgressView['groups'][number]>();
    for (const demand of preview.pipeline.demands) {
      if (isFactorySupplied(demand)) { view.factoryExcluded++; continue; }
      const purchases = purchaseIndex.get(demand.id) ?? [];
      const inbounds = inboundIndex.get(demand.id) ?? [];
      const sourceRows = rawIndex.get(demand.id) ?? [];
      const evidenceKnown = (quantityField: 'purchaseQuantity' | 'inboundQuantity', documentField: 'purchaseOrderNo' | 'inboundDocumentNo') => sourceRows.length > 0 && sourceRows.every(raw => {
        const quantity = raw.values[quantityField];
        return knownQuantity(quantity) && (Number(typeof quantity === 'string' ? quantity.replaceAll(',', '') : quantity) === 0 || Boolean(String(raw.values[documentField] ?? '').trim()));
      });
      const purchased = evidenceKnown('purchaseQuantity', 'purchaseOrderNo') ? purchases.reduce((total, event) => total + event.quantity, 0) : null;
      const inbound = evidenceKnown('inboundQuantity', 'inboundDocumentNo') ? inbounds.reduce((total, event) => total + event.quantity, 0) : null;
      const issues = [...(purchased === null ? ['采购来源数量缺失或无效，不能按零采购判定'] : []), ...(inbound === null ? ['入库来源数量缺失或无效，不能判定齐套'] : [])];
      const identity = resolveCanonicalMaterialIdentity(demand, purchases);
      const row: ProgressRow = { demand, canonicalKey: identity.key, purchases, inbounds, purchased, inbound,
        purchaseShortfall: purchased === null ? null : Math.max(0, demand.requiredQuantity - purchased),
        pendingInbound: purchased === null || inbound === null ? null : Math.max(0, purchased - inbound),
        status: purchased === null || inbound === null ? null : deriveMaterialStatuses(demand.requiredQuantity, purchased, inbound, 0, 0).readinessStatus, issues };
      view.rows.push(row);
      let group = groups.get(identity.key);
      if (!group) { group = { key: identity.key, name: demand.materialName, type: demand.materialType, rows: [] }; groups.set(identity.key, group); }
      group.rows.push(row);
    }
    view.groups = [...groups.values()];
    view.duplicateSourceRows = source.duplicateSourceRowsPrevented;
    view.duplicateEvents = preview.pipeline.stats.duplicateEventRows;
    view.sourceStatus = 'ready';
    view.message = view.rows.some(row => row.status === null) ? '完整分页已读取；部分数量来源不完整，这些物料暂停状态判定。' : '完整合成 Source 已校验；未连接实时艾诺科或正式 Server 物料库。';
    return view;
  } catch (error) {
    return { ...view, sourceStatus: 'incomplete', message: `数据不完整：${error instanceof Error ? error.message : 'Source 校验失败'}。不判定未采购或齐套。`, groups: [], rows: [] };
  }
}

export function filterProgressRows(view: MaterialProgressView, search: string, type: 'all' | 'fabric' | 'trim', status: 'all' | 'unknown' | MaterialReadinessStatus) {
  const needle = search.normalize('NFKC').trim().toLocaleLowerCase();
  return view.rows.filter(row => (type === 'all' || row.demand.materialType === type)
    && (status === 'all' || (status === 'unknown' ? row.status === null : row.status === status))
    && (!needle || [row.demand.materialName, row.demand.materialCode, row.demand.materialColor, row.demand.specification,
      ...row.purchases.flatMap(event => [event.purchaseOrderNo, event.supplier])].join(' ').normalize('NFKC').toLocaleLowerCase().includes(needle)));
}

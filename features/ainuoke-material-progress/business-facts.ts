import type { ProgressRow, ReadPurchase, ReadMovement } from './projection';

export type MaterialFlow = 'purchase' | 'inbound' | 'shipment' | 'outbound';
export type EventRelation = {
  sourceDetailId: string | null; sourceDocumentId: string | null; sourceDemandId: string | null;
  purchaseDetailId: string | null; relatedDemandIds: string[];
  status: 'linked' | 'shared' | 'unidentified'; problems: string[];
};
export type FlowQuantity = {
  state: 'known' | 'empty' | 'unit_unknown' | 'mixed_units' | 'allocation_pending' | 'unlinked' | 'incomplete';
  quantity: number | null; unit: string | null; eventCount: number;
  parts: Array<{ id: string; quantity: number; unit: string | null }>;
  reasons: string[];
};
export type QuantityGap = {
  quantity: number | null; unit: string | null;
  reason: 'known' | 'not_applicable' | 'not_started' | 'demand_unit_missing' | 'unit_mismatch' | 'association_pending' | 'variant_pending';
};
export type MaterialBusinessFacts = { flows: Record<MaterialFlow, FlowQuantity>; purchaseGap: QuantityGap; pendingInbound: QuantityGap };
type Event = (ReadPurchase | ReadMovement) & { relation?: EventRelation };
const rounded = (value: number) => Number(value.toFixed(9));

export function materialEventKey(event: Event): string {
  return event.relation?.sourceDetailId ? 'source:' + event.relation.sourceDetailId : 'projection:' + event.id;
}

export function businessTransactionCounts(rows: ProgressRow[]): Record<MaterialFlow, number> {
  const keys = {purchase:new Set<string>(),inbound:new Set<string>(),shipment:new Set<string>(),outbound:new Set<string>()};
  for (const row of rows) for (const [flow,events] of [['purchase',row.purchases],['inbound',row.inbounds],['shipment',row.shipments],['outbound',row.outbounds]] as const) {
    for (const event of events) keys[flow].add(row.demand.materialType+':'+materialEventKey(event));
    for (const event of row.unverifiedEvents??[]) if(event.flow===flow&&event.sourceDetailId) keys[flow].add(row.demand.materialType+':source:'+event.sourceDetailId);
  }
  return Object.fromEntries(Object.entries(keys).map(([flow,values])=>[flow,values.size])) as Record<MaterialFlow,number>;
}

/** Transaction units are independent of the demand unit. No cross-unit totals. */
export function flowQuantity(events: Event[], fallbackUnit: string | null, incomplete = false): FlowQuantity {
  const unique = [...new Map(events.map(event => [materialEventKey(event), event])).values()];
  const parts = unique.map(event => ({ id: materialEventKey(event), quantity: event.quantity, unit: event.unit === undefined ? fallbackUnit : event.unit }));
  const base = { quantity: null, unit: null, eventCount: unique.length, parts, reasons: [] };
  if (unique.some(event => !Number.isFinite(event.quantity) || event.quantity < 0)) return { ...base, state:'incomplete', reasons:['明细数量无效或业务方向待核实'] };
  if (incomplete) return { ...base, state: 'incomplete', reasons: ['存在未能核实明细身份或数量的记录'] };
  if (!unique.length) return { ...base, state: 'empty' };
  if (unique.some(event => event.relation?.status === 'shared')) return { ...base, state: 'allocation_pending', reasons: ['同一笔单据关联多条需求，未取得分配数量'] };
  if (unique.some(event => event.relation?.status === 'unidentified')) return { ...base, state: 'unlinked', reasons: ['来源缺少稳定明细编号，不能分配或累计'] };
  const units = new Set(parts.map(part => part.unit));
  if (units.has(null) || unique.some(event => event.unitMatchStatus === 'conflict')) {
    return { ...base, quantity: unique.length === 1 ? unique[0].quantity : null, state: 'unit_unknown', reasons: ['明细数量已取得，计量单位待核实'] };
  }
  if (units.size !== 1) return { ...base, state: 'mixed_units', reasons: ['明细使用不同计量单位，分别保留'] };
  const total = parts.reduce((sum, part) => sum + part.quantity, 0);
  if (!Number.isFinite(total)) return { ...base,state:'incomplete',reasons:['合计数量超出可核实范围'] };
  return { ...base, state: 'known', quantity: rounded(total), unit: parts[0].unit };
}

export function materialBusinessFacts(row: ProgressRow, incomplete: Partial<Record<MaterialFlow, boolean>> = {}): MaterialBusinessFacts {
  const flows = {
    purchase: flowQuantity(row.purchases, row.unit, incomplete.purchase),
    inbound: flowQuantity(row.inbounds, row.unit, incomplete.inbound),
    shipment: flowQuantity(row.shipments, row.unit, incomplete.shipment),
    outbound: flowQuantity(row.outbounds, row.unit, incomplete.outbound),
  };
  const self = row.demand.supplyMethod?.normalize('NFKC').trim() === '自购';
  const gap = (reason: QuantityGap['reason'], unit: string | null = null, quantity: number | null = null): QuantityGap => ({ reason, unit, quantity });
  const purchase = flows.purchase, inbound = flows.inbound;
  let purchaseGap: QuantityGap;
  if (!self) purchaseGap = gap('not_applicable');
  else if (!row.unit) purchaseGap = gap('demand_unit_missing');
  else if (row.purchases.some(event => event.relation?.problems.length)) purchaseGap = gap('variant_pending');
  else if (purchase.state === 'empty') purchaseGap = gap('known', row.unit, row.demand.requiredQuantity);
  else if (purchase.state !== 'known') purchaseGap = gap('association_pending');
  else if (purchase.unit !== row.unit) purchaseGap = gap('unit_mismatch');
  else purchaseGap = gap('known', row.unit, rounded(Math.max(0, row.demand.requiredQuantity - purchase.quantity!)));
  let pendingInbound: QuantityGap;
  if (purchase.state === 'empty' && inbound.state === 'empty') pendingInbound = gap('not_started');
  else if (purchase.state !== 'known' || !['known', 'empty'].includes(inbound.state)) pendingInbound = gap('association_pending');
  else if (inbound.state === 'known' && inbound.unit !== purchase.unit) pendingInbound = gap('unit_mismatch');
  else pendingInbound = gap('known', purchase.unit, rounded(Math.max(0, purchase.quantity! - (inbound.quantity ?? 0))));
  return { flows, purchaseGap, pendingInbound };
}

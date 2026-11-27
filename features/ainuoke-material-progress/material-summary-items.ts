import type { OrderMaterialReadModel } from './read-service';

/** Presentation only: count existing demand facts, never sum quantities or infer readiness. */
export function materialSummaryItems(model: OrderMaterialReadModel | null) {
  const view = model?.progress;
  if (!model || !view || view.summary.basis !== 'demand_items') return null;
  const historical = ['stale', 'source_failed'].includes(view.sourceStatus) && model.provenance === 'server_snapshot' && view.rows.length > 0;
  if (view.sourceStatus !== 'ready' && !historical) return null;
  // Match the existing projection's Server self-purchase scope; legacy synthetic scope stays separate.
  const rows = view.rows.filter(row => model.provenance === 'server_snapshot'
    ? row.demand.supplyMethod?.normalize('NFKC').trim() === '自购'
    : row.procurementResponsibility !== 'factory_confirmed');
  const fabric = view.summary.fabric.demands, trim = view.summary.trim.demands;
  if (new Set(rows.map(row => row.demand.id)).size !== rows.length
    || rows.filter(row => row.demand.materialType === 'fabric').length !== fabric
    || rows.filter(row => row.demand.materialType === 'trim').length !== trim) return null;
  const procurementUnknown = historical ? rows.length : rows.filter(row => row.status === null || row.purchaseShortfall === null).length;
  const inboundUnknown = historical ? rows.length : rows.filter(row => row.status === null).length;
  // 'ready' alone does not prove procurement complete: inbound can exceed purchases.
  const procurementComplete = historical ? 0 : rows.filter(row => row.status !== null && row.purchaseShortfall === 0).length;
  const inboundComplete = historical ? 0 : rows.filter(row => row.status === 'ready').length;
  const pendingInbound = rows.filter(row => row.business?.pendingInbound.reason === 'known'
    && row.business.pendingInbound.quantity !== null && row.business.pendingInbound.quantity > 0);
  const pendingInboundUnknown = rows.filter(row => !row.business || !['known', 'not_started'].includes(row.business.pendingInbound.reason)).length;
  const hasRecord = (flow: 'purchase' | 'inbound') => rows.filter(row => (flow === 'purchase' ? row.purchases : row.inbounds).length > 0
    || row.unverifiedEvents?.some(event => event.flow === flow)).length;
  return {
    historical, demands: rows.length, fabric, trim, purchaseRecords: hasRecord('purchase'), inboundRecords: hasRecord('inbound'),
    procurementComplete, inboundComplete, procurementUnknown, inboundUnknown,
    procurementRate: rows.length && !procurementUnknown ? procurementComplete / rows.length : null,
    inboundRate: rows.length && !inboundUnknown ? inboundComplete / rows.length : null,
    pendingPurchase: rows.length - procurementComplete - procurementUnknown,
    pendingInbound, pendingInboundUnknown,
    reviewItems: historical ? rows.length : rows.filter(row => row.status === null || row.purchaseShortfall === null).length,
    otherSupply: view.rows.length - rows.length,
  };
}

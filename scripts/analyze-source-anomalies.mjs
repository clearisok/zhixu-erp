import { isDeepStrictEqual } from 'node:util';

const text = value => String(value ?? '').normalize('NFKC').trim();
const blank = value => value === null || value === undefined || typeof value === 'string' && value.trim() === '';
export function quantityObservation(value, document) {
  if (blank(value)) return text(document) ? 'blank-with-document' : 'blank-no-event-unverified';
  if (typeof value !== 'number' && typeof value !== 'string') return 'invalid';
  const number = Number(String(value).replaceAll(',', ''));
  if (!Number.isFinite(number)) return 'invalid';
  if (number < 0) return 'negative-business-meaning-unverified';
  if (number === 0) return 'explicit-zero';
  return text(document) ? 'positive-with-document' : 'positive-without-document';
}
const demandFields = ['ExpContractNo','lx','GoodsNo','CnName','sjmc','CnColor','StyleColor','CnComposition','SupplyType','StyleNum','Num','Lost','picnum','MenFu','KeZhong','TotalNum','yyyl'];
const numericFields = new Set(['StyleNum','Num','Lost','picnum','TotalNum','yyyl']);
function identity(row) {
  return demandFields.map(key => numericFields.has(key) ? blank(row[key]) ? null : Number(row[key]) : text(row[key]));
}
const streams = [['purchase','cgnum','cgdh'],['inbound','rknum','rkdh'],['shipment','CYNum','cydh'],['outbound','OutStoreNum','ckdh']];
/** Private, allowlisted evidence only. No persistence, network, inferred conversion or mutation. */
export function analyzeSourceOrder(order) {
  const materialRows = (order.materialRawPages ?? []).flatMap(page => page.rows ?? []);
  const colorRows = (order.colorRawPages ?? []).flatMap(page => page.rows ?? []);
  const units = (order.conflictDemands ?? []).map(conflict => {
    const references = new Set(conflict.sourceRows.map(row => row.sourceRowIdentity));
    const rows = materialRows.filter(row => references.has(row.sourceRowIdentity));
    const identities = rows.map(row => identity(row.values));
    return {
      demandId: conflict.demand.id,
      allReferencesResolved: rows.length === references.size,
      sameDemandFields: identities.length > 1 && identities.every(value => isDeepStrictEqual(value, identities[0])),
      materialCode: conflict.demand.materialCode,
      materialName: conflict.demand.materialName,
      rows: rows.map(({ sourceRowIdentity, values: v }) => ({ sourceRowIdentity, sourceId: v.id ?? null,
        unit: v.QtyUnit ?? null, purchaseDocument: v.cgdh ?? null, purchaseQuantity: v.cgnum ?? null,
        inboundDocument: v.rkdh ?? null, shipmentDocument: v.cydh ?? null, outboundDocument: v.ckdh ?? null })),
      // Equal quantity on different documents is a question, never a deduplication rule.
      sameQuantityDifferentPurchaseDocuments: rows.length > 1 && new Set(rows.map(row => text(row.values.cgdh))).size > 1
        && rows.every(row => !blank(row.values.cgnum) && row.values.cgnum === rows[0].values.cgnum),
      resolution: 'retain-conflict-no-unit-alias-or-event-collapse',
    };
  });
  return {
    label: order.label, contract: order.current?.salesContractNo ?? null,
    units,
    colors: colorRows.map(({ sourceRowIdentity, values: v }) => {
      const sizes = Object.entries(v).filter(([key]) => /^Size\d+$/u.test(key));
      const emptyQuantityAndSizes = blank(v.SizeNum) && sizes.every(([, value]) => blank(value));
      return { sourceRowIdentity, color: v.CnColor ?? null, quantity: v.SizeNum ?? null,
        populatedSizes: Object.fromEntries(sizes.filter(([, value]) => !blank(value))),
        classification: emptyQuantityAndSizes ? text(v.CnColor) ? 'named-empty-color-unverified' : 'blank-placeholder-candidate-unverified'
          : !text(v.CnColor) ? 'missing-color-identity' : 'populated-color',
        // Candidate means evidence for human review, not permission to discard a row.
        mayDiscard: false };
    }),
    quantities: materialRows.flatMap(({ sourceRowIdentity, values: v }) => streams.map(([stream, quantity, document]) => ({
      sourceRowIdentity, stream, materialCode: v.GoodsNo ?? null, materialName: v.CnName ?? null,
      materialColor: v.CnColor ?? null, specification: v.CnComposition ?? null, unit: v.QtyUnit ?? null,
      document: v[document] ?? null, quantity: v[quantity] ?? null, classification: quantityObservation(v[quantity], v[document]),
    }))),
    emptyMaterial: materialRows.length === 0 && (order.materialRawPages?.length ?? 0) > 0,
    sourceActivation: 'not-authorized-by-analysis',
  };
}

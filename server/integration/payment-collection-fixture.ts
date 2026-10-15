import { createHash } from 'node:crypto';
import { accountFingerprint, APPROVED_HTTP_ORIGIN, APPROVED_HTTP_POLICY } from '../ainuoke-source/collector.js';
import { hash } from '../ainuoke-source/contract.js';
import type { ContractSelection } from '../ainuoke-source/payment-request-contract-probe.js';

export const collectionConfig = { sourceKey: 'synthetic-payment-collection', baseUrl: APPROVED_HTTP_ORIGIN,
  transportPolicy: APPROVED_HTTP_POLICY, username: 'synthetic-collection-account', password: 'Synthetic-Collection-Secret',
  operatorUsername: 'synthetic.collection.admin' } as const;
export function collectionSelection(suffix = '1'): ContractSelection {
  return { schemaVersion: 'ainuoke-payment-contract-selection.v1', sourceFingerprint: accountFingerprint(collectionConfig),
    samplesSha256: hash('synthetic-samples'), targets: [1, 2].map(i => ({ alias: 'S' + i,
      salesContractNo: 'SYN-SC-' + suffix + '-' + i, witness: { id: String(i * 1000), BillNo: 'SYN-APP-' + i, PurContractNo: 'SYN-PUR-' + i } })) };
}
export function collectionEvidence(selection: ContractSelection, start: number, total = 127) {
  const pages = [];
  for (const pass of [1, 2]) for (const [index, target] of selection.targets.entries())
    for (let page = 1; page <= Math.ceil(total / 100); page++) {
      const rows = Array.from({ length: Math.min(100, total - (page - 1) * 100) }, (_, i) => ({
        id: String((index + 1) * 1000 + (page - 1) * 100 + i), BillNo: target.witness.BillNo,
        ExpContractNo: target.salesContractNo, PurContractNo: target.witness.PurContractNo, CnName: '合成货款物料',
        Num: '115.50', OutStoreNum: '118', QtyUnit: i === 2 ? null : '个', tzamount: '-80.00',
        Price: 'EXACT-DECIMAL-SENTINEL', GoodsAmount: i === 3 ? '0' : '100.00',
      }));
      if (page === 1 && rows.length > 1) rows[1] = { ...rows[0] }; // Duplicate business rows stay distinct observations.
      const rawReportResponse = JSON.stringify({ reObj: { isOk: true }, reportObj: { reportId: 6086941, cellList: '[]' },
        dataList: JSON.stringify({ rows }).replaceAll('"EXACT-DECIMAL-SENTINEL"', '9007199254740993.000000000001'),
        dataCount: total, pageIndex: page, pageSize: 100 });
      pages.push({ alias: target.alias, pass, page, capturedAt: new Date(start + 10 * pages.length + 1).toISOString(),
        rawReportResponse, rawResponseSha256: createHash('sha256').update(rawReportResponse).digest('hex') });
    }
  return { schemaVersion: 'ainuoke-payment-contract-evidence.v1', result: 'complete', code: null as string | null, workerStage: 'validation',
    selectionHash: hash(selection), httpAttempts: pages.length + 1, reportRequests: pages.length, pages };
}

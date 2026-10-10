import type { AinuokeReportSnapshot, AinuokeSourceRow } from '../ainuoke-api/model/ainuoke-api.ts';
import type { PreviewOrder } from './projection.ts';

export const syntheticOrder: PreviewOrder = { salesContractNo: 'SC-SYNTHETIC-001', styleNo: 'STYLE-SYNTHETIC-01', insideOrderNo: 'SYNTHETIC-IN-CURRENT' };
export const syntheticFetchedAt = '2026-10-10T04:00:00.000Z';
export type DemoScenario = 'complete' | 'not_fetched' | 'incomplete' | 'identity_mismatch' | 'collision' | 'large';

function materialRow(id: string, type: '面料' | '辅料', name: string, color: string, specification: string,
  required: number, purchased: number | null, inbound: number | null, extra: Record<string, string | number | null> = {}): AinuokeSourceRow {
  return { sourceRowIdentity: `6087050:sha256:synthetic-${id}`, values: {
    id: `SYNTHETIC-${id}`, ExpContractNo: syntheticOrder.salesContractNo, insideorderno: 'SYNTHETIC-IN-OLD', styleno: syntheticOrder.styleNo,
    lx: type, GoodsNo: `SYNTHETIC-MAT-${id}`, CnName: name, CnColor: color, CnComposition: specification, SupplyType: '自购',
    StyleColor: color, StyleNum: 100, TotalNum: required, cgnum: purchased, rknum: inbound,
    cgdh: purchased && purchased > 0 ? `PO-SYNTHETIC-${id}` : null, cgrq: '2026-10-01', SupplierName: '合成供应商 · 演示专用',
    cgcnname: name, actualname: name, cgcncolor: color, cgCnComposition: specification,
    rkdh: inbound && inbound > 0 ? `IN-SYNTHETIC-${id}` : null, rkrq: '2026-10-08', ...extra,
  } };
}

/** Generated only; no credential, account, persistence or network access. Hash labels intentionally say synthetic. */
export function createSyntheticMaterialSource(scenario: DemoScenario = 'complete', largeCount = 5000): AinuokeReportSnapshot[] | null {
  if (scenario === 'not_fetched') return null;
  let rows: AinuokeSourceRow[];
  if (scenario === 'large') rows = Array.from({ length: largeCount }, (_, i) => materialRow(`bulk-${i}`, i % 2 ? '面料' : '辅料', `合成批量物料 ${String(i + 1).padStart(5, '0')}`, '蓝色', '批量测试规格', 100, 40, 0));
  else {
    const partial = materialRow('partial-a', '面料', '合成棉布', '蓝色', '棉 150cm / 200gsm', 100, 20, 0, { GoodsNo: 'SYNTHETIC-COTTON-BLUE' });
    const secondPurchase = structuredClone(partial);
    secondPurchase.sourceRowIdentity = '6087050:sha256:synthetic-partial-b';
    secondPurchase.values.cgdh = 'PO-SYNTHETIC-partial-b';
    secondPurchase.values.cgnum = 20;
    const duplicateEvent = structuredClone(partial);
    duplicateEvent.sourceRowIdentity = '6087050:sha256:synthetic-partial-event-duplicate';
    rows = [materialRow('unbought', '面料', '合成棉布', '黑色', '棉 150cm / 200gsm', 100, 0, 0), partial, secondPurchase,
      duplicateEvent, structuredClone(partial),
      materialRow('pending', '面料', '合成棉布', '蓝色', '棉 160cm / 220gsm', 100, 100, 0),
      materialRow('ready', '辅料', '合成拉链', '银色', '20cm', 100, 100, 100),
      materialRow('zero', '辅料', '合成零需求', '本色', '0 需求边界', 0, 0, 0),
      materialRow('unknown', '辅料', '合成未知采购', '白色', '缺数量边界', 100, null, 0),
      materialRow('factory', '辅料', '合成厂供标', '白色', '保留 Trace / 排除运营', 100, null, null, { SupplyType: '厂供' })];
  }
  if (scenario === 'identity_mismatch') rows[0].values.ExpContractNo = 'SC-OTHER-SYNTHETIC';
  if (scenario === 'collision') { const conflict = structuredClone(rows[0]); conflict.values.CnName = '合成冲突物料'; rows.push(conflict); }
  const pageSize = 200;
  const pages: AinuokeReportSnapshot[] = [];
  for (let i = 0; i < rows.length; i += pageSize) pages.push({ schemaVersion: 'ainuoke-direct-read.v2', reportId: '6087050',
    fetchedAt: syntheticFetchedAt, page: pages.length + 1, pageSize, total: rows.length,
    queryContext: { insideOrderNo: 'SYNTHETIC-IN-OLD' }, snapshotHash: `synthetic-page-${pages.length + 1}`,
    rows: rows.slice(i, i + pageSize) });
  if (scenario === 'incomplete') pages[0].total += 10;
  return pages;
}

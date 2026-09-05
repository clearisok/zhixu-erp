import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";

import { defaultBasicSettings, normalizeBasicSettings, resolvePurchasedTrimCostRule } from "../features/basic-settings/model/basic-settings.ts";
import { emptyAinuokeSyncState } from "../features/ainuoke-sync/model/ainuoke.ts";
import { normalizeStyleNo } from "../features/ainuoke-sync/model/style-normalizer.ts";
import { stableSourceHash } from "../features/ainuoke-sync/parser/ainuoke-excel-parser.ts";
import { parseHistoricalScheduleWorkbook } from "../features/ainuoke-sync/parser/historical-production-parser.ts";
import { candidateOrdersForContract, synchronizeAinuokeContracts } from "../features/ainuoke-sync/service/ainuoke-sync-service.ts";
import { changeOrderQuantity, createManualOrder } from "../features/order-center/service/order-service.ts";
import { getEffectiveColorQuantity, getEffectiveQuantity, validateOrderCollection } from "../features/order-center/model/order.ts";
import { createClosingPeriod, createAllocationDraft } from "../features/closing-center/service/closing-service.ts";
import { emptyClosingState } from "../features/closing-center/model/closing.ts";
import { defaultOperationsSettings } from "../features/operations-settings/model/operations-settings.ts";

const actor = { id: "admin", name: "管理员", userId: "admin", userName: "管理员" };
const settings = normalizeBasicSettings(defaultBasicSettings);
const order = (styleNo, quantity = 100, orderNo = "SO-1") => createManualOrder({ header: { orderNo, customerId: null, customerNameSnapshot: "客户", customerPoNo: "", orderDate: "2026-08-31", salespersonId: null, salespersonNameSnapshot: "", merchandiserId: null, merchandiserNameSnapshot: "", orderType: "processing", remark: "" }, style: { styleNo, styleName: "测试款", brandId: null, brandNameSnapshot: "OYSHO", productionCountry: "柬埔寨", initialQuantity: quantity }, actor, id: `order-${orderNo}`, createdAt: "2026-08-31T00:00:00.000Z" });
const contract = (patch = {}) => {
  const salesContractNo = patch.salesContractNo ?? "PI2608-001"; const styleNoRaw = patch.styleNoRaw ?? "6624/224-2(N-7708)"; const keys = normalizeStyleNo(styleNoRaw); const quantity = patch.quantity ?? 100;
  return { sourceFile: "销售合同.xlsx", sourceSheet: "销售合同", sourceRow: 4, sourceHash: stableSourceHash([salesContractNo]), salesContractNo, statusRaw: "", companyName: "", customerName: "客户", brandRaw: "OYSHO", brandNormalized: "OYSHO", styleNoRaw, ...keys, factoryStyleNo: "N-7708", poNo: "PO-1", quantity, contractDate: "2026-08-31", contractDeliveryDate: "2026-10-01", colorRows: [], colorLines: [{ colorName: "黑色", quantity, deliveryDate: "2026-10-01", sourceRows: [4] }], deliveryLines: [{ deliveryDate: "2026-10-01", quantity }], colorQuantity: quantity, quantityDifference: 0, validationStatus: "valid", boundOrderId: null, lastDisposition: null, syncedAt: "2026-08-31T00:00:00.000Z", ...patch };
};

test("style normalizer recognizes separators and factory suffix without erasing business suffix", () => {
  const a = normalizeStyleNo(" 6624/224-2 "); const b = normalizeStyleNo("6624-224-2"); const c = normalizeStyleNo("6624/224-2(N-7708)");
  assert.equal(a.baseStyleKey, b.baseStyleKey); assert.equal(b.baseStyleKey, c.baseStyleKey); assert.notEqual(c.strictStyleKey, b.strictStyleKey);
});

test("unique high-confidence match auto-binds instead of creating a duplicate", () => {
  const existing = order("6624-224-2"); const source = contract();
  assert.equal(candidateOrdersForContract(source, [existing]).filter((item) => item.highConfidence).length, 1);
  const result = synchronizeAinuokeContracts({ state: emptyAinuokeSyncState(), contracts: [source], orders: [existing], settings, actor, timestamp: "2026-08-31T00:00:00.000Z" });
  assert.equal(result.orders.length, 1); assert.equal(result.report.autoBoundCount, 1); assert.equal(result.orders[0].salesContractNo, source.salesContractNo); assert.equal(result.orders[0].creationSource, "manual");
});

test("ambiguous candidates are reviewed and no-candidate contracts auto-create", () => {
  const source = contract(); const first = order("6624-224-2", 100, "SO-1"); const second = order("6624/224-2", 100, "SO-2");
  const ambiguous = synchronizeAinuokeContracts({ state: emptyAinuokeSyncState(), contracts: [source], orders: [first, second], settings, actor });
  assert.equal(ambiguous.orders.length, 2); assert.equal(ambiguous.report.manualReviewCount, 1); assert.equal(ambiguous.state.reviews.length, 1);
  const created = synchronizeAinuokeContracts({ state: emptyAinuokeSyncState(), contracts: [contract({ styleNoRaw: "NO-CANDIDATE" })], orders: [], settings, actor });
  assert.equal(created.report.autoCreatedCount, 1); assert.equal(created.orders[0].creationSource, "ainuoke");
});

test("QA dataset orders never enter Ainuoke matching and MS2276C auto-creates", () => {
  const source = contract({ salesContractNo: "PI2608-284", styleNoRaw: "MS2276C", quantity: 6000 });
  const qaOrders = [1, 2, 3].map((index) => ({
    ...order("MS2276C", 6000, `QA-SO-${index}`),
    id: `uiqa-order-${index}`,
    orderNo: `QA-SO-${index}`,
    remark: "UI-REDESIGN-QA · ui-redesign-qa-v1",
    createdBy: "DEV/QA 数据生成器",
  }));
  assert.deepEqual(candidateOrdersForContract(source, qaOrders), []);
  const result = synchronizeAinuokeContracts({ state: emptyAinuokeSyncState(), contracts: [source], orders: qaOrders, settings, actor, timestamp: "2026-08-31T01:00:00.000Z" });
  assert.equal(result.report.autoCreatedCount, 1);
  assert.equal(result.report.manualReviewCount, 0);
  assert.equal(result.state.reviews.length, 0);
  assert.equal(result.orders.find((item) => item.salesContractNo === "PI2608-284")?.styleNo, "MS2276C");
});

test("successful rematch removes an obsolete order-match review", () => {
  const source = contract();
  const reviewed = synchronizeAinuokeContracts({ state: emptyAinuokeSyncState(), contracts: [source], orders: [order("6624-224-2", 100, "SO-1"), order("6624/224-2", 100, "SO-2")], settings, actor });
  assert.equal(reviewed.state.reviews.length, 1);
  const rematched = synchronizeAinuokeContracts({ state: reviewed.state, contracts: [source], orders: [], settings, actor });
  assert.equal(rematched.report.autoCreatedCount, 1);
  assert.equal(rematched.state.reviews.length, 0);
});

test("same contract sync is idempotent for orders, quantity history, colors, and delivery", () => {
  const source = contract(); const first = synchronizeAinuokeContracts({ state: emptyAinuokeSyncState(), contracts: [source], orders: [], settings, actor, timestamp: "2026-08-31T00:00:00.000Z" });
  const second = synchronizeAinuokeContracts({ state: first.state, contracts: [source], orders: first.orders, settings, actor, timestamp: "2026-08-31T00:01:00.000Z" });
  assert.equal(second.orders.length, 1); assert.equal(second.report.autoCreatedCount, 0); assert.equal(second.report.unchangedExistingCount, 1); assert.equal(second.orders[0].quantityChanges.length, first.orders[0].quantityChanges.length); assert.equal(second.orders[0].orderColorLines.length, first.orders[0].orderColorLines.length); assert.equal(second.orders[0].deliveryPlans.length, first.orders[0].deliveryPlans.length);
});

test("Ainuoke resync updates source color quantity without losing cancellation adjustments", () => {
  const first = synchronizeAinuokeContracts({ state: emptyAinuokeSyncState(), contracts: [contract()], orders: [], settings, actor, timestamp: "2026-08-31T00:00:00.000Z" });
  const lineId = first.orders[0].orderColorLines[0].id;
  const cancelled = changeOrderQuantity(first.orders[0], { afterQuantity: 80, changeType: "partial_cancel", reason: "客户取消黑色 20", actor, colorQuantities: [{ colorLineId: lineId, afterQuantity: 80 }] });
  const source120 = contract({ quantity: 120, colorQuantity: 120, colorLines: [{ colorName: "黑色", quantity: 120, deliveryDate: "2026-10-01", sourceRows: [4] }], deliveryLines: [{ deliveryDate: "2026-10-01", quantity: 120 }] });
  const resynced = synchronizeAinuokeContracts({ state: first.state, contracts: [source120], orders: [cancelled], settings, actor, timestamp: "2026-09-01T00:00:00.000Z" });
  const updated = resynced.orders[0];
  assert.equal(updated.orderColorLines[0].quantity, 120);
  assert.equal(updated.quantityChanges[0].colorAdjustments[0].delta, -20);
  assert.equal(getEffectiveColorQuantity(updated, lineId), 100);
  assert.equal(getEffectiveQuantity(updated), 100);
  assert.equal(updated.quantityChanges.length, 2);
  assert.equal(updated.quantityChanges.at(-1).source, "ainuoke_sync");
  assert.doesNotThrow(() => validateOrderCollection([updated]));
  const repeated = synchronizeAinuokeContracts({ state: resynced.state, contracts: [source120], orders: resynced.orders, settings, actor, timestamp: "2026-09-01T00:01:00.000Z" });
  assert.equal(repeated.orders[0].quantityChanges.length, 2);
  assert.equal(getEffectiveColorQuantity(repeated.orders[0], lineId), 100);
});

test("purchased trim rules start on 2026-08-01 and preserve null for other brands", () => {
  const ms = settings.brands.find((item) => item.name === "M&S"); const oysho = settings.brands.find((item) => item.name === "OYSHO");
  assert.equal(resolvePurchasedTrimCostRule(settings, ms.id, "2026-08-01")?.unitCost, 0.28); assert.equal(resolvePurchasedTrimCostRule(settings, oysho.id, "2026-08-01")?.unitCost, 0.1); assert.equal(resolvePurchasedTrimCostRule(settings, ms.id, "2026-07-31"), null); assert.equal(resolvePurchasedTrimCostRule(settings, null, "2026-08-31"), null);
});

test("new closing snapshots USD without an FX rate", () => {
  const salesOrder = order("CLOSE-1"); const created = createClosingPeriod(emptyClosingState(), { month: "2026-08", taxRateSnapshot: 13, actor });
  const allocation = createAllocationDraft({ period: created.period, order: salesOrder, settings: defaultOperationsSettings, actor });
  assert.equal(allocation.currencySnapshot, "USD"); assert.equal(allocation.fxRateSnapshot, null); assert.equal(allocation.legacyFxRateApplied, false);
});

test("historical schedule parser corrects a December-to-January cross-year date", async () => {
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("计划1");
  sheet.addRow(["组别", "客户", "款号", "数量", "上线时间", "下线时间", "天", "排入产量", "平均日产", "备注"]);
  sheet.addRow(["1组", "OYSHO", "6624/224-2", 7000, new Date("2026-12-20T00:00:00Z"), new Date("2026-01-05T00:00:00Z"), 12, "44000-7000", 600, "历史原文"]);
  const bytes = await workbook.xlsx.writeBuffer(); const rows = await parseHistoricalScheduleWorkbook(bytes, "排单.xlsx");
  assert.equal(rows.length, 1); assert.equal(rows[0].quantity, 7000); assert.equal(rows[0].plannedEndDate, "2027-01-05"); assert.equal(rows[0].dateCorrected, true);
});

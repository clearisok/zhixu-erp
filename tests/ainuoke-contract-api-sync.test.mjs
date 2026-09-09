import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { defaultBasicSettings, normalizeBasicSettings } from "../features/basic-settings/model/basic-settings.ts";
import { emptyAinuokeSyncState, validateAinuokeSyncState } from "../features/ainuoke-sync/model/ainuoke.ts";
import { buildAinuokeContractApiPreview, commitAinuokeContractApiPreview } from "../features/ainuoke-sync/service/ainuoke-contract-api-sync.ts";
import { changeOrderQuantity, createOrderPriceVersion, upsertDeliveryPlan } from "../features/order-center/service/order-service.ts";
import { getEffectiveColorQuantity, getEffectiveQuantity } from "../features/order-center/model/order.ts";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const contractSnapshot = fixture("ainuoke-api-contract-6086103.redacted.json");
const colorSnapshot = fixture("ainuoke-api-contract-6086997.redacted.json");
const actor = { id: "user-admin", name: "系统管理员", userId: "user-admin", userName: "系统管理员" };
const settings = normalizeBasicSettings(defaultBasicSettings);
const preview = (patch = {}) => buildAinuokeContractApiPreview({
  contractSnapshots: [contractSnapshot],
  colorSnapshots: [colorSnapshot],
  state: emptyAinuokeSyncState(),
  orders: [],
  settings,
  actor,
  timestamp: "2026-09-09T10:00:00.000Z",
  ...patch,
});

test("API snapshots flow through existing mirror and synchronize service in memory", () => {
  const result = preview();
  assert.equal(result.sync.report.contractsSeen, 1);
  assert.equal(result.sync.report.validContracts, 1);
  assert.equal(result.sync.report.autoCreatedCount, 1);
  assert.equal(result.sync.orders.length, 1);
  assert.equal(result.sync.orders[0].salesContractNo, "SC-API-001");
  assert.equal(result.sync.orders[0].orderColorLines.length, 2);
  assert.equal(result.sync.state.contracts[0].colorQuantity, 100);
  assert.equal(result.sync.state.contracts[0].quantityDifference, 0);
  assert.equal(result.dryRun.sourceKind, "api");
  assert.equal(result.dryRun.mode, "dry_run");
});

test("quantity mismatch and orphan color contract remain blocked by existing mirror rules", () => {
  const mismatchColors = structuredClone(colorSnapshot);
  mismatchColors.rows = mismatchColors.rows.map((row) => row.values.stylecolor === "BLUE" ? { ...row, values: { ...row.values, stylenum: 40 } } : row);
  const mismatch = preview({ colorSnapshots: [mismatchColors] });
  assert.equal(mismatch.sync.report.mismatchCount, 1);
  assert.equal(mismatch.sync.report.autoCreatedCount, 0);
  assert.equal(mismatch.sync.state.contracts[0].lastDisposition, "blocked");
  const orphanColors = structuredClone(colorSnapshot);
  orphanColors.rows = orphanColors.rows.map((row) => ({ ...row, values: { ...row.values, billno: "SC-ORPHAN" } }));
  assert.throws(() => preview({ colorSnapshots: [orphanColors] }), /不存在于销售合同来源/);
});

test("same API snapshot is idempotent and emits no duplicate review or log", () => {
  const first = preview();
  const second = preview({ state: first.sync.state, orders: first.sync.orders, timestamp: "2026-09-09T10:01:00.000Z" });
  assert.equal(second.sync.orders.length, 1);
  assert.equal(second.sync.report.autoCreatedCount, 0);
  assert.equal(second.sync.report.unchangedExistingCount, 1);
  assert.equal(second.sync.state.reviews.length, 0);
  assert.equal(second.sync.operationLogs.length, 0);
  assert.equal(second.sync.orders[0].quantityChanges.length, first.sync.orders[0].quantityChanges.length);
  assert.equal(second.sync.orders[0].orderColorLines.length, first.sync.orders[0].orderColorLines.length);
  assert.equal(second.sync.orders[0].deliveryPlans.length, first.sync.orders[0].deliveryPlans.length);
});

test("API resync preserves manual quantity/color, delivery, and price history", () => {
  const first = preview();
  let order = first.sync.orders[0];
  const red = order.orderColorLines.find((line) => line.colorName === "RED");
  const blue = order.orderColorLines.find((line) => line.colorName === "BLUE");
  order = changeOrderQuantity(order, { afterQuantity: 90, changeType: "partial_cancel", reason: "人工取消 10", actor, colorQuantities: [{ colorLineId: red.id, afterQuantity: 40 }, { colorLineId: blue.id, afterQuantity: 50 }] });
  order = upsertDeliveryPlan(order, { id: "delivery-manual", deliveryDate: "2026-11-01", quantity: 90, remark: "人工交期", source: "manual", salesContractNo: null }, actor);
  order = createOrderPriceVersion(order, { salePrice: 12, processingUnitPrice: 3, processingCurrency: "USD", exchangeRateSnapshot: 7, effectiveDate: "2026-09-09", reason: "人工调价", actor });
  const quantityChangeCount = order.quantityChanges.length;
  const priceCount = order.priceVersions.length;
  const resynced = preview({ state: first.sync.state, orders: [order], timestamp: "2026-09-09T10:02:00.000Z" });
  const updated = resynced.sync.orders[0];
  assert.equal(getEffectiveQuantity(updated), 90);
  assert.equal(getEffectiveColorQuantity(updated, red.id), 40);
  assert.equal(updated.quantityChanges.length, quantityChangeCount);
  assert.ok(updated.deliveryPlans.some((plan) => plan.id === "delivery-manual" && plan.source !== "ainuoke_sync"));
  assert.equal(updated.priceVersions.length, priceCount);
  assert.equal(updated.currentPriceVersionId, order.currentPriceVersionId);
});

test("preview has no repository side effects and commit requires ainuoke.sync", async () => {
  const result = preview();
  const writes = { orders: 0, ainuoke: 0, logs: 0 };
  const repositories = {
    orders: { async saveAll(orders) { writes.orders += 1; return orders; } },
    ainuoke: { async save(state) { writes.ainuoke += 1; return state; } },
    operationLogs: { async appendMany(logs) { writes.logs += 1; return logs; } },
  };
  assert.deepEqual(writes, { orders: 0, ainuoke: 0, logs: 0 });
  await assert.rejects(() => commitAinuokeContractApiPreview({ preview: result, canSync: false, actorName: actor.name, repositories }), /ainuoke\.sync/);
  assert.deepEqual(writes, { orders: 0, ainuoke: 0, logs: 0 });
  const committed = await commitAinuokeContractApiPreview({ preview: result, canSync: true, actorName: actor.name, repositories, timestamp: "2026-09-09T10:03:00.000Z" });
  assert.deepEqual(writes, { orders: 1, ainuoke: 1, logs: 1 });
  assert.equal(committed.run.mode, "commit");
  assert.equal(committed.run.sourceKind, "api");
  assert.deepEqual(committed.run.reportIds, ["6086103", "6086997"]);
  assert.deepEqual(committed.run.query, { insideOrderNo: "D1935" });
  assert.equal(committed.run.scheduleCount, 0);
  assert.equal(committed.run.closingCount, 0);
});

test("API ImportRun and trace survive JSON backup shape without secrets", () => {
  const result = preview();
  const state = validateAinuokeSyncState({ ...result.sync.state, importRuns: [result.dryRun] });
  const restored = validateAinuokeSyncState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.contracts[0].sourceKind, "api");
  assert.equal(restored.importRuns[0].sourceKind, "api");
  assert.equal(restored.importRuns[0].sourceFiles.length, 0);
  const serialized = JSON.stringify(restored).toLocaleLowerCase();
  for (const forbidden of ["password", "jwttoken", "sessionid", "authorization", "kaijin_my_token", "rungingsysid"]) assert.equal(serialized.includes(forbidden), false);
});

test("Browser Backup validator keeps the stable Ainuoke record validation path", () => {
  const source = readFileSync(new URL("../features/data-management/service/data-management-service.ts", import.meta.url), "utf8");
  assert.match(source, /AINUOKE_STORAGE_NAME/);
  assert.match(source, /validateAinuokeSyncState\(parsed\?\.data \?\? parsed\)/);
  assert.doesNotMatch(source, /password|jwtToken|sessionId|Authorization|kaijin_my_token/);
});

test("API commit orchestration cannot touch Scheduling or Closing", () => {
  const source = readFileSync(new URL("../features/ainuoke-sync/service/ainuoke-contract-api-sync.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /productionSchedulingRepository|closingRepository|operationsSettingsRepository|scheduleAssignments|ClosingAllocation/);
  assert.match(source, /preview\.sync\.orders/);
  assert.match(source, /preview\.sync\.operationLogs/);
});

test("existing Ainuoke Sync page exposes API/Excel source modes and explicit preview commit", () => {
  const source = readFileSync(new URL("../features/ainuoke-sync/components/ainuoke-sync-page.tsx", import.meta.url), "utf8");
  assert.match(source, /艾诺科 API/);
  assert.match(source, /Excel \/ 历史文件/);
  assert.match(source, /预检尚未写入正式数据/);
  assert.match(source, /数量差异/);
  assert.match(source, /permission="ainuoke\.view"/);
  assert.match(source, /permission="ainuoke\.sync"/);
  assert.match(source, /readAllPages\("sales_contracts"/);
  assert.match(source, /readAllPages\("sales_contract_color_sizes"/);
  assert.doesNotMatch(source, /readAllPages\("material_purchase_statistics"/);
});

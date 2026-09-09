import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { emptyStyleProgressData, isFactorySupplied, resolveCanonicalMaterialIdentity } from "../features/style-progress/model/style-progress.ts";
import { findStaleApiMaterialDemandIds, mergeImportedDemand, reconcileExpectedArrivalBatchesAfterImport, remapManualExpectedArrivalBatchesForAuthoritativeImport } from "../features/style-progress/repository/style-progress-repository.ts";
import { commitAinuokeMaterialApiPreview, toAinuokeMaterialImportPreview } from "../features/style-progress/service/ainuoke-material-api-commit.ts";
import { buildAinuokeMaterialApiPreview } from "../features/style-progress/service/ainuoke-material-api-preview.ts";

const fixture = () => JSON.parse(readFileSync(new URL("./fixtures/ainuoke-api-material-6087050.redacted.json", import.meta.url), "utf8"));
const actor = { userId: "user-material", userName: "物料用户" };

function isolatedRepositories() {
  const state = emptyStyleProgressData();
  const logs = [];
  const committed = new Set();
  return {
    state,
    logs,
    repositories: {
      styleProgress: {
        async commitImport(preview) {
          const existingDemands = new Map(state.demands.map((item) => [item.id, item]));
          const incomingIds = new Set(preview.demands.map((item) => item.id));
          const stale = findStaleApiMaterialDemandIds({ existingDemands: state.demands, incomingDemandIds: incomingIds, affectedSalesContractNos: preview.replaceSourceScope.affectedSalesContractNos });
          const merged = preview.demands.map((item) => mergeImportedDemand(item, existingDemands.get(item.id)));
          const affected = new Set([...stale, ...incomingIds]);
          const operationalKeys = ["purchaseEvents", "inboundEvents", "shipmentEvents", "outboundEvents"];
          const hasStaleEvents = operationalKeys.some((key) => {
            const nextIds = new Set(preview[key].map((item) => item.id));
            return state[key].some((item) => affected.has(item.materialDemandId) && !nextIds.has(item.id));
          });
          if (committed.has(preview.batch.id) && stale.size === 0 && !hasStaleEvents) return { duplicateFile: true, newDemands: 0, updatedDemands: 0, newPurchaseEvents: 0, newInboundEvents: 0, newShipmentEvents: 0, newOutboundEvents: 0, newRawSnapshots: 0 };
          committed.add(preview.batch.id);
          const remappedExpected = remapManualExpectedArrivalBatchesForAuthoritativeImport({ existingBatches: state.expectedArrivalBatches, existingDemands: state.demands, incomingDemands: merged, incomingPurchaseEvents: preview.purchaseEvents, staleDemandIds: stale });
          state.demands = [...state.demands.filter((item) => !stale.has(item.id) && !merged.some((incoming) => incoming.id === item.id)), ...merged];
          const replaceEvents = (key) => {
            const before = new Set(state[key].map((item) => item.id));
            state[key] = [...state[key].filter((item) => !affected.has(item.materialDemandId)), ...structuredClone(preview[key])];
            return preview[key].filter((item) => !before.has(item.id)).length;
          };
          const existingRaw = new Set(state.rawSnapshots.map((item) => item.id));
          const newRawSnapshots = preview.rawSnapshots.filter((item) => !existingRaw.has(item.id)).length;
          state.rawSnapshots = [...new Map([...state.rawSnapshots, ...structuredClone(preview.rawSnapshots)].map((item) => [item.id, item])).values()];
          state.expectedArrivalBatches = reconcileExpectedArrivalBatchesAfterImport({
            existingBatches: remappedExpected,
            incomingDemands: merged,
            incomingPurchaseEvents: preview.purchaseEvents,
          });
          for (const demand of state.demands) {
            const manualDates = state.expectedArrivalBatches.filter((batch) => batch.dateSource === "manual" && batch.allocations.some((allocation) => allocation.materialDemandId === demand.id)).map((batch) => batch.expectedArrivalAtHubDate).sort();
            if (manualDates.length) {
              demand.expectedDateSource = "manual";
              demand.expectedMaterialReadyDate = manualDates.at(-1);
            }
          }
          if (!state.batches.some((batch) => batch.id === preview.batch.id)) state.batches.push({ ...structuredClone(preview.batch), status: "committed", committedAt: "2026-09-09T06:00:00.000Z" });
          return {
            duplicateFile: false,
            newDemands: merged.filter((item) => !existingDemands.has(item.id)).length,
            updatedDemands: merged.filter((item) => existingDemands.has(item.id)).length,
            newPurchaseEvents: replaceEvents("purchaseEvents"),
            newInboundEvents: replaceEvents("inboundEvents"),
            newShipmentEvents: replaceEvents("shipmentEvents"),
            newOutboundEvents: replaceEvents("outboundEvents"),
            newRawSnapshots,
          };
        },
      },
      operationLogs: { async append(log) { logs.push(structuredClone(log)); return { ...log, id: `log-${logs.length}` }; } },
    },
  };
}

test("API Preview 只经 thin orchestration 调用 existing commitImport，并保存正式 Material entities", async () => {
  const preview = buildAinuokeMaterialApiPreview({ snapshots: fixture() });
  const isolated = isolatedRepositories();
  const result = await commitAinuokeMaterialApiPreview({ preview, canImport: true, actor, repositories: isolated.repositories });
  assert.equal(result.report.duplicateFile, false);
  assert.equal(isolated.state.batches.length, 1);
  assert.equal(isolated.state.rawSnapshots.length, 3);
  assert.equal(isolated.state.demands.length, 3);
  assert.deepEqual([isolated.state.purchaseEvents.length, isolated.state.inboundEvents.length, isolated.state.shipmentEvents.length, isolated.state.outboundEvents.length], [1, 1, 1, 1]);
  assert.ok(isolated.state.rawSnapshots.every((item) => item.sourceKind === "api" && item.reportId === "6087050"));
  assert.ok(isolated.state.rawSnapshots.every((item) => !Object.hasOwn(item, "fileName") && !Object.hasOwn(item, "sheetName") && !Object.hasOwn(item, "sourceRow")));
});

test("同一完整 Snapshot 的 batch identity 稳定，第二次 commit 新增为 0 且不重复写 OperationLog", async () => {
  const firstPages = fixture();
  const laterPages = fixture();
  for (const page of laterPages) {
    page.fetchedAt = "2026-09-09T08:00:00.000Z";
    page.snapshotHash = `later-${page.page}`;
  }
  const first = buildAinuokeMaterialApiPreview({ snapshots: firstPages });
  const later = buildAinuokeMaterialApiPreview({ snapshots: laterPages });
  assert.equal(later.sourceArtifactHash, first.sourceArtifactHash);
  assert.equal(later.importBatchId, first.importBatchId);
  const isolated = isolatedRepositories();
  const committed = await commitAinuokeMaterialApiPreview({ preview: first, canImport: true, actor, repositories: isolated.repositories });
  const repeated = await commitAinuokeMaterialApiPreview({ preview: later, canImport: true, actor, repositories: isolated.repositories });
  assert.equal(committed.report.duplicateFile, false);
  assert.deepEqual(repeated.report, { duplicateFile: true, newDemands: 0, updatedDemands: 0, newPurchaseEvents: 0, newInboundEvents: 0, newShipmentEvents: 0, newOutboundEvents: 0, newRawSnapshots: 0 });
  assert.equal(isolated.logs.length, 1);
});

test("已提交的同一 Snapshot 发现 prior-source stale facts 时执行一次 corrective replacement", async () => {
  const preview = buildAinuokeMaterialApiPreview({ snapshots: fixture() });
  const isolated = isolatedRepositories();
  await commitAinuokeMaterialApiPreview({ preview, canImport: true, actor, repositories: isolated.repositories });
  const target = preview.pipeline.demands[0];
  const stale = { ...structuredClone(target), id: "late-discovered-excel-demand", sourceActualName: "旧 Excel 实际名称", garmentColors: [target.garmentColors.join("/")], sourceKind: "excel", lastImportBatchId: "old-excel", sourceFileHash: "old-excel-hash" };
  isolated.state.demands.push(stale);
  isolated.state.purchaseEvents.push({ ...preview.pipeline.purchaseEvents[0], id: "late-discovered-excel-event", materialDemandId: stale.id, importBatchId: "old-excel" });

  const repaired = await commitAinuokeMaterialApiPreview({ preview, canImport: true, actor, repositories: isolated.repositories });
  const repeated = await commitAinuokeMaterialApiPreview({ preview, canImport: true, actor, repositories: isolated.repositories });

  assert.equal(repaired.report.duplicateFile, false);
  assert.equal(isolated.state.demands.some((item) => item.id === stale.id), false);
  assert.equal(isolated.state.purchaseEvents.some((item) => item.id === "late-discovered-excel-event"), false);
  assert.equal(repeated.report.duplicateFile, true);
  assert.equal(isolated.logs.length, 2);
});

test("API Material Import shape 保留 name-only Canonical 与 variant facts，并排除厂供 operational", () => {
  const pages = fixture();
  const variant = structuredClone(pages[0].rows[0]);
  variant.sourceRowIdentity = "6087050:sha256:variant-child";
  variant.values.id = 99999;
  variant.values.GoodsNo = "FABRIC-A-OTHER";
  variant.values.MenFu = "180";
  variant.values.KeZhong = "260";
  variant.values.cgprice = 9.9;
  pages[1].rows.push(variant);
  pages.forEach((page) => { page.total = 4; });
  const materialImport = toAinuokeMaterialImportPreview(buildAinuokeMaterialApiPreview({ snapshots: pages }), actor.userName);
  const fabrics = materialImport.demands.filter((item) => item.materialType === "fabric");
  assert.equal(new Set(fabrics.map((item) => resolveCanonicalMaterialIdentity(item, materialImport.purchaseEvents).key)).size, 1);
  assert.equal(new Set(fabrics.map((item) => item.materialCode)).size, 2);
  assert.equal(new Set(fabrics.map((item) => item.width)).size, 2);
  assert.equal(new Set(fabrics.map((item) => item.gsm)).size, 2);
  assert.ok(materialImport.rawSnapshots.some((item) => item.rawFields.SupplyType === "厂供"));
  assert.equal(materialImport.demands.filter((item) => !isFactorySupplied(item)).length, 3);
});

test("当前完整 API Snapshot 替换 affected contract 内所有 prior-source operational Demand", () => {
  const preview = buildAinuokeMaterialApiPreview({ snapshots: fixture() });
  const old = { ...preview.pipeline.demands[0], id: "old-api-demand", sourceKind: "api", sourceFactoryStyleNoSnapshot: "D1935" };
  const unrelated = { ...old, id: "other-contract-demand", salesContractNo: "PI-OTHER", sourceFactoryStyleNoSnapshot: "OTHER" };
  const excel = { ...old, id: "excel-demand", sourceKind: "excel" };
  const stale = findStaleApiMaterialDemandIds({ existingDemands: [old, unrelated, excel], incomingDemandIds: new Set(preview.pipeline.demands.map((item) => item.id)), affectedSalesContractNos: [old.salesContractNo] });
  assert.deepEqual([...stale], ["old-api-demand", "excel-demand"]);
});

test("Excel current facts 被 API authoritative snapshot 替换，同时保留历史 trace 与唯一人工计划", async () => {
  const preview = buildAinuokeMaterialApiPreview({ snapshots: fixture() });
  const target = preview.pipeline.demands.find((item) => item.materialType === "fabric");
  const sourceTarget = preview.pipeline.demands.find((item) => item.id !== target.id);
  const oldManual = {
    ...structuredClone(target),
    id: "excel-manual-demand",
    sourceActualName: "历史实际名称",
    garmentColors: [target.garmentColors.join("/")],
    sourceKind: "excel",
    lastImportBatchId: "excel-history-batch",
    sourceFileHash: "excel-history-hash",
  };
  const oldSource = {
    ...structuredClone(sourceTarget),
    id: "excel-source-demand",
    sourceActualName: "历史来源名称",
    garmentColors: [sourceTarget.garmentColors.join("/")],
    sourceKind: "excel",
    lastImportBatchId: "excel-history-batch",
    sourceFileHash: "excel-history-hash",
  };
  const isolated = isolatedRepositories();
  isolated.state.batches.push({ id: "excel-history-batch", sourceKind: "excel", fileHash: "excel-history-hash", status: "committed", createdAt: "2026-09-01T00:00:00.000Z", committedAt: "2026-09-01T00:01:00.000Z" });
  isolated.state.rawSnapshots.push({ id: "excel-raw", importBatchId: "excel-history-batch", fileHash: "excel-history-hash", sourceRow: 15917, rawFields: { source: "redacted-history" }, normalizedDemandId: oldManual.id, validationIssues: [] });
  isolated.state.demands.push(oldManual, oldSource);
  isolated.state.purchaseEvents.push({ ...preview.pipeline.purchaseEvents[0], id: "excel-event", materialDemandId: oldManual.id, importBatchId: "excel-history-batch" });
  isolated.state.expectedArrivalBatches.push(
    { id: "manual-plan", salesContractNo: oldManual.salesContractNo, canonicalMaterialKey: resolveCanonicalMaterialIdentity(oldManual, []).key, expectedArrivalAtHubDate: "2026-09-30", dateSource: "manual", allocations: [{ id: "manual-old", materialDemandId: oldManual.id, quantity: oldManual.requiredQuantity }], createdAt: "2026-09-01T00:00:00.000Z", createdBy: "planner", updatedAt: "2026-09-01T00:00:00.000Z", updatedBy: "planner" },
    { id: "source-plan-old", salesContractNo: oldSource.salesContractNo, canonicalMaterialKey: resolveCanonicalMaterialIdentity(oldSource, []).key, expectedArrivalAtHubDate: "2026-09-01", dateSource: "source", allocations: [{ id: "source-old", materialDemandId: oldSource.id, quantity: oldSource.requiredQuantity }], createdAt: "2026-09-01T00:00:00.000Z", createdBy: "source-import", updatedAt: "2026-09-01T00:00:00.000Z", updatedBy: "source-import" },
  );

  await commitAinuokeMaterialApiPreview({ preview, canImport: true, actor, repositories: isolated.repositories });

  assert.equal(isolated.state.demands.some((item) => item.id === oldManual.id || item.id === oldSource.id), false);
  assert.deepEqual(new Set(isolated.state.demands.map((item) => item.id)), new Set(preview.pipeline.demands.map((item) => item.id)));
  assert.equal(isolated.state.purchaseEvents.some((item) => item.id === "excel-event"), false);
  assert.equal(isolated.state.batches.some((item) => item.id === "excel-history-batch"), true);
  assert.equal(isolated.state.rawSnapshots.some((item) => item.id === "excel-raw"), true);
  const manual = isolated.state.expectedArrivalBatches.find((item) => item.id === "manual-plan");
  assert.equal(manual.allocations[0].materialDemandId, target.id);
  assert.equal(manual.canonicalMaterialKey, resolveCanonicalMaterialIdentity(target, preview.pipeline.purchaseEvents).key);
  const remappedTarget = isolated.state.demands.find((item) => item.id === target.id);
  assert.equal(remappedTarget.expectedDateSource, "manual");
  assert.equal(remappedTarget.expectedMaterialReadyDate, "2026-09-30");
  assert.equal(isolated.state.expectedArrivalBatches.some((item) => item.id === "source-plan-old"), false);
  assert.equal(isolated.state.rawSnapshots.some((item) => item.sourceKind === "api" && item.rawFields.SupplyType === "厂供"), true);
  assert.equal(isolated.state.demands.some(isFactorySupplied), true);
  assert.equal(isolated.state.expectedArrivalBatches.some((batch) => batch.allocations.some((allocation) => isolated.state.demands.find((demand) => demand.id === allocation.materialDemandId && isFactorySupplied(demand)))), false);
});

test("historical Excel source-following plan is removed and rebuilt from current API due date", () => {
  const preview = buildAinuokeMaterialApiPreview({ snapshots: fixture() });
  const target = preview.pipeline.demands.find((item) => item.sourceMaterialDueDate);
  const old = { ...structuredClone(target), id: "old-source", sourceActualName: "历史名称", garmentColors: [target.garmentColors.join("/")], sourceKind: "excel" };
  const oldBatch = { id: "old-source-plan", salesContractNo: old.salesContractNo, canonicalMaterialKey: resolveCanonicalMaterialIdentity(old, []).key, expectedArrivalAtHubDate: "2026-08-01", dateSource: "source", allocations: [{ id: "old-source-allocation", materialDemandId: old.id, quantity: old.requiredQuantity }], createdAt: "2026-09-01T00:00:00.000Z", createdBy: "source-import", updatedAt: "2026-09-01T00:00:00.000Z", updatedBy: "source-import" };
  const prepared = remapManualExpectedArrivalBatchesForAuthoritativeImport({ existingBatches: [oldBatch], existingDemands: [old], incomingDemands: [target], incomingPurchaseEvents: preview.pipeline.purchaseEvents, staleDemandIds: new Set([old.id]) });
  const refreshed = reconcileExpectedArrivalBatchesAfterImport({ existingBatches: prepared, incomingDemands: [target], incomingPurchaseEvents: preview.pipeline.purchaseEvents });
  assert.equal(refreshed.some((item) => item.id === oldBatch.id), false);
  assert.equal(refreshed.length, 1);
  assert.equal(refreshed[0].dateSource, "source");
  assert.equal(refreshed[0].expectedArrivalAtHubDate, target.sourceMaterialDueDate);
  assert.equal(refreshed[0].allocations[0].materialDemandId, target.id);
});

test("人工计划 remap 遇到 zero/multiple candidate 均 fail closed", () => {
  const preview = buildAinuokeMaterialApiPreview({ snapshots: fixture() });
  const target = preview.pipeline.demands[0];
  const old = { ...structuredClone(target), id: "old", sourceActualName: "历史名称", garmentColors: [target.garmentColors.join("/")], sourceKind: "excel" };
  const batch = { id: "manual", salesContractNo: old.salesContractNo, canonicalMaterialKey: resolveCanonicalMaterialIdentity(old, []).key, expectedArrivalAtHubDate: "2026-09-30", dateSource: "manual", allocations: [{ id: "allocation", materialDemandId: old.id, quantity: old.requiredQuantity }], createdAt: "2026-09-01T00:00:00.000Z", createdBy: "planner", updatedAt: "2026-09-01T00:00:00.000Z", updatedBy: "planner" };
  const run = (incomingDemands) => remapManualExpectedArrivalBatchesForAuthoritativeImport({ existingBatches: [batch], existingDemands: [old], incomingDemands, incomingPurchaseEvents: [], staleDemandIds: new Set([old.id]) });
  assert.throws(() => run([]), /无法唯一映射/);
  assert.throws(() => run([target, { ...target, id: "duplicate-candidate" }]), /无法唯一映射/);
});

test("重同步更新 Source due date，但保留 manual Effective；Actual event 不变成 Effective", async () => {
  const isolated = isolatedRepositories();
  const first = buildAinuokeMaterialApiPreview({ snapshots: fixture() });
  await commitAinuokeMaterialApiPreview({ preview: first, canImport: true, actor, repositories: isolated.repositories });
  const target = isolated.state.demands.find((item) => item.materialCode === "FABRIC-A");
  isolated.state.expectedArrivalBatches = [{ id: "manual", salesContractNo: target.salesContractNo, canonicalMaterialKey: resolveCanonicalMaterialIdentity(target, isolated.state.purchaseEvents).key, expectedArrivalAtHubDate: "2026-09-30", dateSource: "manual", allocations: [{ id: "manual-allocation", materialDemandId: target.id, quantity: target.requiredQuantity }], createdAt: "2026-09-09T00:00:00.000Z", createdBy: "planner", updatedAt: "2026-09-09T00:00:00.000Z", updatedBy: "planner" }];
  target.expectedMaterialReadyDate = "2026-09-30";
  target.expectedDateSource = "manual";
  const changed = fixture();
  changed[0].rows[0].sourceRowIdentity = "6087050:sha256:due-date-changed";
  changed[0].rows[0].values.cgjq = "2026-09-15";
  const next = buildAinuokeMaterialApiPreview({ snapshots: changed });
  await commitAinuokeMaterialApiPreview({ preview: next, canImport: true, actor, repositories: isolated.repositories });
  const updated = isolated.state.demands.find((item) => item.id === target.id);
  assert.equal(updated.sourceMaterialDueDate, "2026-09-15");
  assert.equal(updated.expectedMaterialReadyDate, "2026-09-30");
  assert.equal(updated.expectedDateSource, "manual");
  assert.equal(isolated.state.expectedArrivalBatches.find((item) => item.id === "manual").expectedArrivalAtHubDate, "2026-09-30");
  assert.equal(isolated.state.inboundEvents[0].eventDate, "2026-09-08");
});

test("不完整分页、identity collision、blocking validation、stale mutation 与权限不足均 fail closed", async () => {
  const valid = buildAinuokeMaterialApiPreview({ snapshots: fixture() });
  const isolated = isolatedRepositories();
  await assert.rejects(() => commitAinuokeMaterialApiPreview({ preview: valid, canImport: false, actor, repositories: isolated.repositories }), /style_progress\.import/);
  const incomplete = structuredClone(valid);
  incomplete.source.reportedTotal = 99;
  await assert.rejects(() => commitAinuokeMaterialApiPreview({ preview: incomplete, canImport: true, actor, repositories: isolated.repositories }), /分页不完整/);
  const collision = structuredClone(valid);
  collision.source.sourceIdentityCollisions = 1;
  await assert.rejects(() => commitAinuokeMaterialApiPreview({ preview: collision, canImport: true, actor, repositories: isolated.repositories }), /collision/);
  const blocked = structuredClone(valid);
  blocked.summary.rejectedRows = 1;
  await assert.rejects(() => commitAinuokeMaterialApiPreview({ preview: blocked, canImport: true, actor, repositories: isolated.repositories }), /阻断校验错误/);
  const mutated = structuredClone(valid);
  mutated.pipeline.rawRows[0].rawFields.CnName = "changed after preview";
  await assert.rejects(() => commitAinuokeMaterialApiPreview({ preview: mutated, canImport: true, actor, repositories: isolated.repositories }), /Preview 已变化/);
  assert.equal(isolated.state.batches.length, 0);
  assert.equal(isolated.logs.length, 0);
});

test("Preview alone and commit orchestration cannot mutate SalesOrder, Scheduling or Closing", async () => {
  const business = { salesOrders: [{ id: "order" }], scheduling: [{ id: "schedule" }], closing: [{ id: "closing" }] };
  const before = structuredClone(business);
  const preview = buildAinuokeMaterialApiPreview({ snapshots: fixture() });
  const isolated = isolatedRepositories();
  assert.deepEqual(business, before);
  await commitAinuokeMaterialApiPreview({ preview, canImport: true, actor, repositories: isolated.repositories });
  assert.deepEqual(business, before);
  const source = readFileSync(new URL("../features/style-progress/service/ainuoke-material-api-commit.ts", import.meta.url), "utf8");
  assert.match(source, /styleProgress\.commitImport\(materialImport\)/);
  assert.doesNotMatch(source, /orderRepository|saveAll|productionSchedulingRepository|closingRepository|commitImport\(preview\.pipeline/);
});

test("UI requires Preview-first and a second explicit style_progress.import confirmation", () => {
  const source = readFileSync(new URL("../features/ainuoke-sync/components/ainuoke-sync-page.tsx", import.meta.url), "utf8");
  assert.match(source, /运行物料 API 预检/);
  assert.match(source, /setMaterialCommitOpen\(true\)/);
  assert.match(source, /title="确认导入款式进度"/);
  assert.match(source, /permission="style_progress\.import"/);
  assert.match(source, /当前绑定 Snapshot/);
  for (const label of ["InsideOrderNo", "获取时间", "Source rows", "Canonical groups", "Demands", "厂供 Source rows", "SalesOrder", "Scheduling", "Closing"]) assert.match(source, new RegExp(label));
  assert.doesNotMatch(source, /ainuoke\.view[^\n]{0,300}commitMaterialApiPreview/);
});

test("API ImportBatch/Raw/OperationLog trace 不含 credential、token 或 session", async () => {
  const preview = buildAinuokeMaterialApiPreview({ snapshots: fixture() });
  const isolated = isolatedRepositories();
  await commitAinuokeMaterialApiPreview({ preview, canImport: true, actor, repositories: isolated.repositories });
  const encoded = JSON.stringify({ state: isolated.state, logs: isolated.logs }).toLocaleLowerCase();
  for (const forbidden of ["password", "jwttoken", "sessionid", "credential-secret", "authorization", "kaijin_my_token"]) assert.equal(encoded.includes(forbidden), false);
  assert.equal(isolated.logs[0].action, "导入面辅料跟进");
  assert.equal(isolated.logs[0].entityType, "MaterialImportBatch");
});

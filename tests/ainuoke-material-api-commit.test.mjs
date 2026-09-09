import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { emptyStyleProgressData, isFactorySupplied, resolveCanonicalMaterialIdentity } from "../features/style-progress/model/style-progress.ts";
import { findStaleApiMaterialDemandIds, mergeImportedDemand, reconcileExpectedArrivalBatchesAfterImport } from "../features/style-progress/repository/style-progress-repository.ts";
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
          if (committed.has(preview.batch.id)) return { duplicateFile: true, newDemands: 0, updatedDemands: 0, newPurchaseEvents: 0, newInboundEvents: 0, newShipmentEvents: 0, newOutboundEvents: 0, newRawSnapshots: 0 };
          committed.add(preview.batch.id);
          const existingDemands = new Map(state.demands.map((item) => [item.id, item]));
          const stale = findStaleApiMaterialDemandIds({ existingDemands: state.demands, incomingDemandIds: new Set(preview.demands.map((item) => item.id)), insideOrderNo: preview.replaceSourceScope.queryContext.insideOrderNo });
          const merged = preview.demands.map((item) => mergeImportedDemand(item, existingDemands.get(item.id)));
          state.demands = [...state.demands.filter((item) => !stale.has(item.id) && !merged.some((incoming) => incoming.id === item.id)), ...merged];
          const replaceEvents = (key) => {
            const affected = new Set([...stale, ...merged.map((item) => item.id)]);
            const before = new Set(state[key].map((item) => item.id));
            state[key] = [...state[key].filter((item) => !affected.has(item.materialDemandId)), ...structuredClone(preview[key])];
            return preview[key].filter((item) => !before.has(item.id)).length;
          };
          const existingRaw = new Set(state.rawSnapshots.map((item) => item.id));
          const newRawSnapshots = preview.rawSnapshots.filter((item) => !existingRaw.has(item.id)).length;
          state.rawSnapshots = [...new Map([...state.rawSnapshots, ...structuredClone(preview.rawSnapshots)].map((item) => [item.id, item])).values()];
          state.expectedArrivalBatches = reconcileExpectedArrivalBatchesAfterImport({
            existingBatches: state.expectedArrivalBatches.flatMap((batch) => {
              const allocations = batch.allocations.filter((item) => !stale.has(item.materialDemandId));
              return allocations.length ? [{ ...batch, allocations }] : [];
            }),
            incomingDemands: merged,
            incomingPurchaseEvents: preview.purchaseEvents,
          });
          state.batches.push({ ...structuredClone(preview.batch), status: "committed", committedAt: "2026-09-09T06:00:00.000Z" });
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

test("当前完整 API Snapshot 缺失的同 scope 旧 Demand 被标记为 stale，不会无限 append", () => {
  const preview = buildAinuokeMaterialApiPreview({ snapshots: fixture() });
  const old = { ...preview.pipeline.demands[0], id: "old-api-demand", sourceKind: "api", sourceFactoryStyleNoSnapshot: "D1935" };
  const unrelated = { ...old, id: "other-api-demand", sourceFactoryStyleNoSnapshot: "OTHER" };
  const excel = { ...old, id: "excel-demand", sourceKind: "excel" };
  const stale = findStaleApiMaterialDemandIds({ existingDemands: [old, unrelated, excel], incomingDemandIds: new Set(preview.pipeline.demands.map((item) => item.id)), insideOrderNo: " D1935 " });
  assert.deepEqual([...stale], ["old-api-demand"]);
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

test("API ImportBatch/Raw/OperationLog trace 不含 credential、token 或 session", async () => {
  const preview = buildAinuokeMaterialApiPreview({ snapshots: fixture() });
  const isolated = isolatedRepositories();
  await commitAinuokeMaterialApiPreview({ preview, canImport: true, actor, repositories: isolated.repositories });
  const encoded = JSON.stringify({ state: isolated.state, logs: isolated.logs }).toLocaleLowerCase();
  for (const forbidden of ["password", "jwttoken", "sessionid", "credential-secret", "authorization", "kaijin_my_token"]) assert.equal(encoded.includes(forbidden), false);
  assert.equal(isolated.logs[0].action, "导入面辅料跟进");
  assert.equal(isolated.logs[0].entityType, "MaterialImportBatch");
});

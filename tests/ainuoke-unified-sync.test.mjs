import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { defaultBasicSettings, normalizeBasicSettings } from "../features/basic-settings/model/basic-settings.ts";
import { emptyAinuokeSyncState } from "../features/ainuoke-sync/model/ainuoke.ts";
import {
  commitAinuokeUnifiedPreview,
  runAinuokeUnifiedPreview,
} from "../features/ainuoke-sync/service/ainuoke-unified-sync.ts";
import { emptyStyleProgressData } from "../features/style-progress/model/style-progress.ts";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const actor = { id: "user-admin", name: "系统管理员", userId: "user-admin", userName: "系统管理员" };

function createHarness() {
  let ainuoke = emptyAinuokeSyncState();
  let orders = [];
  let styleProgress = emptyStyleProgressData();
  const logs = [];
  const reads = [];
  const writes = { contract: 0, material: 0 };
  const reportFixtures = {
    sales_contracts: [fixture("ainuoke-api-contract-6086103.redacted.json")],
    sales_contract_color_sizes: [fixture("ainuoke-api-contract-6086997.redacted.json")],
    material_purchase_statistics: fixture("ainuoke-api-material-6087050.redacted.json"),
  };
  const repositories = {
    ainuoke: {
      async load() { return structuredClone(ainuoke); },
      async save(next) { writes.contract += 1; ainuoke = structuredClone(next); return structuredClone(ainuoke); },
    },
    orders: {
      async list() { return structuredClone(orders); },
      async saveAll(next) { orders = structuredClone(next); return structuredClone(orders); },
    },
    styleProgress: {
      async loadAll() { return structuredClone(styleProgress); },
      async commitImport(preview) {
        writes.material += 1;
        const affectedContracts = new Set(preview.replaceSourceScope?.affectedSalesContractNos ?? []);
        const incomingDemandIds = new Set(preview.demands.map((item) => item.id));
        const staleDemandIds = new Set(styleProgress.demands
          .filter((item) => affectedContracts.has(item.salesContractNo) && !incomingDemandIds.has(item.id))
          .map((item) => item.id));
        const existingBatch = styleProgress.batches.some((item) => item.id === preview.batch.id && item.status === "committed");
        const currentFactIds = new Set([
          ...styleProgress.demands,
          ...styleProgress.rawSnapshots,
          ...styleProgress.purchaseEvents,
          ...styleProgress.inboundEvents,
          ...styleProgress.shipmentEvents,
          ...styleProgress.outboundEvents,
        ].map((item) => item.id));
        const incomingFacts = [
          ...preview.demands,
          ...preview.rawSnapshots,
          ...preview.purchaseEvents,
          ...preview.inboundEvents,
          ...preview.shipmentEvents,
          ...preview.outboundEvents,
        ];
        if (existingBatch && !staleDemandIds.size && incomingFacts.every((item) => currentFactIds.has(item.id))) {
          return { duplicateFile: true, newDemands: 0, updatedDemands: 0, newPurchaseEvents: 0, newInboundEvents: 0, newShipmentEvents: 0, newOutboundEvents: 0, newRawSnapshots: 0 };
        }
        const existingDemandIds = new Set(styleProgress.demands.map((item) => item.id));
        const replaceEvents = (key) => {
          const existingIds = new Set(styleProgress[key].map((item) => item.id));
          const affectedIds = new Set([...incomingDemandIds, ...staleDemandIds]);
          styleProgress[key] = [
            ...styleProgress[key].filter((item) => !affectedIds.has(item.materialDemandId)),
            ...structuredClone(preview[key]),
          ];
          return preview[key].filter((item) => !existingIds.has(item.id)).length;
        };
        styleProgress.demands = [
          ...styleProgress.demands.filter((item) => !affectedContracts.has(item.salesContractNo)),
          ...structuredClone(preview.demands),
        ];
        const existingRawIds = new Set(styleProgress.rawSnapshots.map((item) => item.id));
        styleProgress.rawSnapshots = [...new Map([...styleProgress.rawSnapshots, ...structuredClone(preview.rawSnapshots)].map((item) => [item.id, item])).values()];
        if (!existingBatch) styleProgress.batches.push({ ...structuredClone(preview.batch), status: "committed", committedAt: "2026-09-10T00:00:00.000Z" });
        return {
          duplicateFile: false,
          newDemands: preview.demands.filter((item) => !existingDemandIds.has(item.id)).length,
          updatedDemands: preview.demands.filter((item) => existingDemandIds.has(item.id)).length,
          newPurchaseEvents: replaceEvents("purchaseEvents"),
          newInboundEvents: replaceEvents("inboundEvents"),
          newShipmentEvents: replaceEvents("shipmentEvents"),
          newOutboundEvents: replaceEvents("outboundEvents"),
          newRawSnapshots: preview.rawSnapshots.filter((item) => !existingRawIds.has(item.id)).length,
        };
      },
    },
    operationLogs: {
      async append(log) { logs.push(structuredClone(log)); return log; },
      async appendMany(next) { logs.push(...structuredClone(next)); return next; },
    },
  };
  const dependencies = {
    reports: {
      async readAllReportPages(userId, reportKey, input) {
        reads.push({ userId, reportKey, input: structuredClone(input) });
        return structuredClone(reportFixtures[reportKey]);
      },
    },
    ainuoke: repositories.ainuoke,
    orders: repositories.orders,
    styleProgress: repositories.styleProgress,
    loadSettings: () => normalizeBasicSettings(defaultBasicSettings),
  };
  const preview = (timestamp = "2026-09-10T01:00:00.000Z") => runAinuokeUnifiedPreview({
    userId: actor.userId,
    insideOrderNo: " d1935 ",
    canView: true,
    actor,
    dependencies,
    timestamp,
  });
  const commit = (value, options = {}) => commitAinuokeUnifiedPreview({
    preview: value,
    canSyncContracts: options.canSyncContracts ?? true,
    canImportMaterials: options.canImportMaterials ?? true,
    actor,
    repositories: options.repositories ?? repositories,
    timestamp: options.timestamp ?? "2026-09-10T01:01:00.000Z",
  });
  return {
    preview,
    commit,
    dependencies,
    repositories,
    reportFixtures,
    reads,
    writes,
    logs,
    get state() { return { ainuoke, orders, styleProgress }; },
  };
}

async function seedCurrent(harness) {
  const first = await harness.preview();
  const committed = await harness.commit(first);
  assert.equal(committed.status, "success");
  return first;
}

test("unified read fetches all three allowlisted reports and reuses both existing preview services", async () => {
  const harness = createHarness();
  const preview = await harness.preview();
  assert.deepEqual(harness.reads.map((item) => item.reportKey).sort(), ["material_purchase_statistics", "sales_contract_color_sizes", "sales_contracts"]);
  assert.ok(harness.reads.every((item) => item.input.query.insideOrderNo === "D1935" && item.input.pageSize === 50 && item.input.maxPages === 100));
  assert.equal(preview.contract.sync.report.contractsSeen, 1);
  assert.equal(preview.material.summary.demands, 3);
  assert.equal(preview.summary.contract.salesContractNo, "SC-API-001");
  assert.equal(preview.summary.material.canonicalMaterialGroups, 3);
  assert.equal(preview.summary.confirmRequired, true);
});

test("no-change returns already-current status and never opens a write path", async () => {
  const harness = createHarness();
  await seedCurrent(harness);
  const beforeWrites = structuredClone(harness.writes);
  const beforeLogs = harness.logs.length;
  const current = await harness.preview("2026-09-10T01:02:00.000Z");
  assert.equal(current.summary.contract.state, "no_change");
  assert.equal(current.summary.material.state, "no_change");
  assert.equal(current.summary.confirmRequired, false);
  const result = await harness.commit(current);
  assert.equal(result.status, "no_change");
  assert.deepEqual(harness.writes, beforeWrites);
  assert.equal(harness.logs.length, beforeLogs);
});

test("change summary distinguishes contract-only, material-only, and both-changed", async () => {
  const contractOnly = createHarness();
  await seedCurrent(contractOnly);
  contractOnly.reportFixtures.sales_contracts[0].rows[0].values.DeliveryDate = "2026-11-01 00:00:00";
  const contractPreview = await contractOnly.preview("2026-09-10T01:03:00.000Z");
  assert.equal(contractPreview.summary.contract.state, "changed");
  assert.equal(contractPreview.summary.material.state, "no_change");

  const materialOnly = createHarness();
  await seedCurrent(materialOnly);
  materialOnly.reportFixtures.material_purchase_statistics[0].rows[0].sourceRowIdentity = "6087050:sha256:changed-material";
  materialOnly.reportFixtures.material_purchase_statistics[0].rows[0].values.TotalNum = 60;
  const materialPreview = await materialOnly.preview("2026-09-10T01:04:00.000Z");
  assert.equal(materialPreview.summary.contract.state, "no_change");
  assert.equal(materialPreview.summary.material.state, "changed");

  const both = createHarness();
  await seedCurrent(both);
  both.reportFixtures.sales_contracts[0].rows[0].values.DeliveryDate = "2026-11-01 00:00:00";
  both.reportFixtures.material_purchase_statistics[0].rows[0].sourceRowIdentity = "6087050:sha256:both-changed";
  const bothPreview = await both.preview("2026-09-10T01:05:00.000Z");
  assert.equal(bothPreview.summary.contract.state, "changed");
  assert.equal(bothPreview.summary.material.state, "changed");
});

test("contract and material blocking errors disable the whole unified commit", async () => {
  const contractBlocked = createHarness();
  contractBlocked.reportFixtures.sales_contracts[0].rows[0].values.Num = 101;
  const contractPreview = await contractBlocked.preview();
  assert.equal(contractPreview.summary.contract.state, "blocked");
  assert.equal(contractPreview.summary.confirmRequired, false);
  await assert.rejects(() => contractBlocked.commit(contractPreview), /阻断错误/);
  assert.deepEqual(contractBlocked.writes, { contract: 0, material: 0 });

  const materialBlocked = createHarness();
  materialBlocked.reportFixtures.material_purchase_statistics[0].rows[0].values.ExpContractNo = "";
  const materialPreview = await materialBlocked.preview();
  assert.equal(materialPreview.summary.material.state, "blocked");
  assert.equal(materialPreview.summary.confirmRequired, false);
  await assert.rejects(() => materialBlocked.commit(materialPreview), /阻断错误/);
  assert.deepEqual(materialBlocked.writes, { contract: 0, material: 0 });
});

test("permission combinations require only the changed domain capabilities", async () => {
  const harness = createHarness();
  const both = await harness.preview();
  await assert.rejects(() => harness.commit(both, { canSyncContracts: false }), /ainuoke\.sync/);
  await assert.rejects(() => harness.commit(both, { canImportMaterials: false }), /style_progress\.import/);
  assert.deepEqual(harness.writes, { contract: 0, material: 0 });

  const materialOnly = createHarness();
  await seedCurrent(materialOnly);
  materialOnly.reportFixtures.material_purchase_statistics[0].rows[0].sourceRowIdentity = "6087050:sha256:permission-material";
  const preview = await materialOnly.preview("2026-09-10T01:06:00.000Z");
  const committed = await materialOnly.commit(preview, { canSyncContracts: false, canImportMaterials: true });
  assert.equal(committed.status, "success");
  assert.equal(committed.contract.status, "skipped");
  assert.equal(committed.material.status, "success");
});

test("contract commits before material and reports partial failure without fake rollback", async () => {
  const harness = createHarness();
  const preview = await harness.preview();
  const failingRepositories = {
    ...harness.repositories,
    styleProgress: {
      ...harness.repositories.styleProgress,
      async commitImport() { throw new Error("material repository unavailable"); },
    },
  };
  const result = await harness.commit(preview, { repositories: failingRepositories });
  assert.equal(result.status, "partial_failure");
  assert.equal(result.contract.status, "success");
  assert.equal(result.material.status, "failed");
  assert.equal(result.material.error, "material repository unavailable");
  assert.equal(result.retrySafe, true);
  assert.equal(harness.state.orders.length, 1);
  assert.equal(harness.state.styleProgress.demands.length, 0);
});

test("safe retry reruns preview, skips completed contract, and does not duplicate contract logs", async () => {
  const harness = createHarness();
  const first = await harness.preview();
  const failingRepositories = {
    ...harness.repositories,
    styleProgress: {
      ...harness.repositories.styleProgress,
      async commitImport() { throw new Error("temporary material failure"); },
    },
  };
  const partial = await harness.commit(first, { repositories: failingRepositories });
  assert.equal(partial.status, "partial_failure");
  const contractLogCount = harness.logs.filter((item) => item.module === "艾诺科同步").length;

  const retryPreview = await harness.preview("2026-09-10T01:07:00.000Z");
  assert.equal(retryPreview.summary.contract.state, "no_change");
  assert.equal(retryPreview.summary.material.state, "changed");
  const retried = await harness.commit(retryPreview);
  assert.equal(retried.status, "success");
  assert.equal(retried.contract.status, "skipped");
  assert.equal(retried.material.status, "success");
  assert.equal(harness.logs.filter((item) => item.module === "艾诺科同步").length, contractLogCount);
});

test("integrity mutation and local baseline changes both fail stale protection before writes", async () => {
  const mutated = createHarness();
  const mutatedPreview = await mutated.preview();
  mutatedPreview.summary.contract.quantity = 999;
  await assert.rejects(() => mutated.commit(mutatedPreview), /Preview 已变化/);
  assert.deepEqual(mutated.writes, { contract: 0, material: 0 });

  const stale = createHarness();
  const stalePreview = await stale.preview();
  await stale.repositories.ainuoke.save({ ...emptyAinuokeSyncState(), reviews: [{ id: "external-change", kind: "order_match", sourceKey: "external", salesContractNo: null, candidateOrderIds: [], reason: "external", resolvedAt: null, resolvedBy: null, createdAt: "2026-09-10T01:00:30.000Z" }] });
  const writesBefore = structuredClone(stale.writes);
  await assert.rejects(() => stale.commit(stalePreview), /本地业务数据已变化/);
  assert.deepEqual(stale.writes, writesBefore);
});

test("unified orchestration never accepts raw report selectors or creates a third domain pipeline", () => {
  const source = readFileSync(new URL("../features/ainuoke-sync/service/ainuoke-unified-sync.ts", import.meta.url), "utf8");
  for (const key of ["sales_contracts", "sales_contract_color_sizes", "material_purchase_statistics"]) assert.match(source, new RegExp(`\"${key}\"`));
  assert.match(source, /buildAinuokeContractApiPreview/);
  assert.match(source, /buildAinuokeMaterialApiPreview/);
  assert.match(source, /commitAinuokeContractApiPreview/);
  assert.match(source, /commitAinuokeMaterialApiPreview/);
  assert.doesNotMatch(source, /reportId\s*:\s*input|conditionList|sqlCdtn|synchronizeAinuokeContracts\(|normalizeMaterialSourceRows\(|commitImport\(/);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { emptyStyleProgressData, resolveCanonicalMaterialIdentity } from "../features/style-progress/model/style-progress.ts";
import { buildAinuokeMaterialApiPreview } from "../features/style-progress/service/ainuoke-material-api-preview.ts";

const fixture = () => JSON.parse(fs.readFileSync(new URL("./fixtures/ainuoke-api-material-6087050.redacted.json", import.meta.url), "utf8"));

test("6087050 API rows 进入唯一 Material Normalize/Dedup/Validate Preview", () => {
  const preview = buildAinuokeMaterialApiPreview({ snapshots: fixture() });
  assert.equal(preview.source.sourceRowCount, 3);
  assert.equal(preview.summary.normalizedRows, 3);
  assert.equal(preview.summary.rejectedRows, 0);
  assert.equal(preview.summary.demands, 3);
  assert.equal(preview.summary.purchaseEvents, 1);
  assert.equal(preview.summary.inboundEvents, 1);
  assert.equal(preview.summary.shipmentEvents, 1);
  assert.equal(preview.summary.outboundEvents, 1);
  assert.ok(preview.pipeline.rawRows.every((row) => row.trace.sourceKind === "api"));
});

test("API Raw Trace 保留 report/hash/fetched/query/schema 且不伪造 Excel 坐标", () => {
  const preview = buildAinuokeMaterialApiPreview({ snapshots: fixture() });
  for (const row of preview.pipeline.rawRows) {
    assert.equal(row.trace.reportId, "6087050");
    assert.equal(row.trace.sourceSchemaVersion, "ainuoke-direct-read.v2");
    assert.equal(row.trace.queryContext.insideOrderNo, "D1935");
    assert.match(row.trace.sourceRowIdentity, /^6087050:sha256:/);
    for (const forbidden of ["fileName", "fileHash", "sheetName", "sourceRow"]) assert.equal(Object.hasOwn(row.trace, forbidden), false);
  }
});

test("malformed required identity fields 保留 rejected trace 并 fail validation closed", () => {
  const pages = fixture();
  delete pages[0].rows[0].values.CnName;
  pages[0].rows[0].values.TotalNum = "not-a-number";
  const preview = buildAinuokeMaterialApiPreview({ snapshots: pages });
  assert.equal(preview.summary.normalizedRows, 2);
  assert.equal(preview.summary.rejectedRows, 1);
  assert.equal(preview.pipeline.rawRows.length, 3);
  assert.equal(preview.pipeline.rawRows[0].normalizedDemandId, null);
  assert.ok(preview.summary.errors.some((issue) => issue.message === "面辅料名称为空"));
  assert.ok(preview.summary.errors.some((issue) => issue.message === "需求数量无效"));
});

test("Canonical Material 保持合同 + 类型 + 名称，materialCode/宽克重/价格只留 child facts", () => {
  const pages = fixture();
  const variant = structuredClone(pages[0].rows[0]);
  variant.sourceRowIdentity = "6087050:sha256:dddddddd";
  variant.values.id = 71003;
  variant.values.GoodsNo = "FABRIC-A-VARIANT";
  variant.values.CnColor = "蓝色";
  variant.values.MenFu = "160";
  variant.values.KeZhong = "220";
  variant.values.cgprice = 3.5;
  pages[1].rows.push(variant);
  pages[0].total = 4;
  pages[1].total = 4;
  const preview = buildAinuokeMaterialApiPreview({ snapshots: pages });
  const fabrics = preview.pipeline.demands.filter((demand) => demand.materialType === "fabric");
  assert.equal(fabrics.length, 2);
  assert.equal(new Set(fabrics.map((demand) => resolveCanonicalMaterialIdentity(demand, preview.pipeline.purchaseEvents).key)).size, 1);
  assert.deepEqual(new Set(fabrics.map((demand) => demand.materialCode)), new Set(["FABRIC-A", "FABRIC-A-VARIANT"]));
  assert.deepEqual(new Set(fabrics.map((demand) => demand.width)), new Set(["150", "160"]));
  assert.deepEqual(new Set(fabrics.map((demand) => demand.gsm)), new Set(["200", "220"]));
  assert.equal(preview.summary.fabricGroups, 1);
});

test("同合同同类型同名辅料按现有规则合并 Canonical Group", () => {
  const pages = fixture();
  const variant = structuredClone(pages[0].rows[1]);
  variant.sourceRowIdentity = "6087050:sha256:eeeeeeee";
  variant.values.id = 71004;
  variant.values.GoodsNo = "TRIM-B-SECOND-CODE";
  variant.values.CnColor = "灰色";
  pages[1].rows.push(variant);
  pages[0].total = 4;
  pages[1].total = 4;
  const preview = buildAinuokeMaterialApiPreview({ snapshots: pages });
  const trims = preview.pipeline.demands.filter((demand) => demand.materialName === "辅料 B");
  assert.equal(trims.length, 2);
  assert.equal(new Set(trims.map((demand) => resolveCanonicalMaterialIdentity(demand, []).key)).size, 1);
  assert.equal(preview.summary.trimGroups, 2);
});

test("厂供保留 Raw/Trace 但退出 operational material groups", () => {
  const preview = buildAinuokeMaterialApiPreview({ snapshots: fixture() });
  assert.equal(preview.summary.vendorSupplySourceRows, 1);
  assert.equal(preview.pipeline.rawRows.filter((row) => row.values.supplyMethod === "厂供").length, 1);
  assert.equal(preview.summary.canonicalMaterialGroups, 3);
  assert.equal(preview.summary.operationalMaterialGroups, 2);
});

test("Source/Effective/Actual 不串义，actualConsumption 仅在有证据时映射", () => {
  const preview = buildAinuokeMaterialApiPreview({ snapshots: fixture() });
  const fabric = preview.pipeline.demands.find((demand) => demand.materialCode === "FABRIC-A");
  assert.equal(fabric.sourceMaterialDueDate, "2026-09-10");
  assert.equal(fabric.expectedMaterialReadyDate, "2026-09-10");
  assert.equal(fabric.expectedDateSource, "source");
  assert.equal(fabric.actualConsumption, null);
  assert.equal(preview.pipeline.inboundEvents[0].eventDate, "2026-09-08");
  assert.equal(preview.summary.warnings[0].code, "actual_consumption_unmapped");
});

test("API Preview 不修改既有 manual ExpectedArrivalBatch 或任何 persisted state", () => {
  const existing = emptyStyleProgressData();
  existing.expectedArrivalBatches.push({ id: "manual-1", dateSource: "manual", expectedArrivalAtHubDate: "2026-09-20", allocations: [] });
  const before = structuredClone(existing);
  buildAinuokeMaterialApiPreview({ snapshots: fixture() });
  assert.deepEqual(existing, before);
});

test("同一 API Snapshot 重复 Preview 完全幂等", () => {
  const pages = fixture();
  const first = buildAinuokeMaterialApiPreview({ snapshots: pages, now: "2026-09-09T04:00:00.000Z" });
  const second = buildAinuokeMaterialApiPreview({ snapshots: structuredClone(pages), now: "2026-09-09T04:00:00.000Z" });
  assert.deepEqual(second, first);
});

test("当前 API 行数与历史 Excel 行数不同不是 validation error", () => {
  const historicalExcelRowCount = 2;
  const preview = buildAinuokeMaterialApiPreview({ snapshots: fixture() });
  assert.notEqual(preview.source.sourceRowCount, historicalExcelRowCount);
  assert.equal(preview.summary.errors.length, 0);
  assert.doesNotMatch(JSON.stringify(preview.summary), /parity|Excel.*不一致|row.count.mismatch/i);
});

test("API Preview 无 commitImport、Style Progress Repository、Order、Scheduling 或 Closing 写路径", () => {
  const previewSource = fs.readFileSync(new URL("../features/style-progress/service/ainuoke-material-api-preview.ts", import.meta.url), "utf8");
  const adapterSource = fs.readFileSync(new URL("../features/style-progress/source/ainuoke-material-api-adapter.ts", import.meta.url), "utf8");
  for (const source of [previewSource, adapterSource]) assert.doesNotMatch(source, /commitImport|styleProgressRepository|orderRepository|saveAll|productionSchedulingRepository|closingRepository|operationLogRepository/);
});

test("API Preview/Raw/Snapshot 不含 password、token、session 或 credential", () => {
  const encoded = JSON.stringify(buildAinuokeMaterialApiPreview({ snapshots: fixture() }));
  assert.doesNotMatch(encoded.toLowerCase(), /password|jwt.?token|session.?id|credential-secret|authorization|kaijin_my_token/);
});

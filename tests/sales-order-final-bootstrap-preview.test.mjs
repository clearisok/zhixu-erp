import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFinalSalesOrderBootstrapPreview,
  compareFinalSalesOrderBootstrapSnapshots,
} from "../features/ainuoke-sync/service/sales-order-final-bootstrap-preview.ts";

const fetchedAt = "2026-09-11T10:00:00.000Z";

function rawRow(id, insideOrderNo, billNo, patch = {}) {
  return {
    sourceRowIdentity: `6086103:sha256:${id}`,
    values: {
      id,
      InsideOrderNo: insideOrderNo,
      BillNo: billNo,
      Status: "草拟",
      ContractDate: "2026-08-01",
      DeliveryDate: "2026-10-01",
      GoodsDesc: `STYLE-${id}`,
      CompanyName: "COMPANY",
      CustomerName: "CUSTOMER",
      Brand: "BRAND",
      Num: 100,
      ...patch,
    },
  };
}

function discovery(rawRows, patch = {}) {
  return {
    schemaVersion: "ainuoke-order-discovery.v1",
    reportId: "6086103",
    visibilityScope: "current_account_visible",
    fetchedAt,
    total: rawRows.length,
    pageCount: 1,
    rows: rawRows.map((row) => ({
      sourceId: String(row.values.id),
      sourceRowIdentity: row.sourceRowIdentity,
      insideOrderNo: String(row.values.InsideOrderNo),
      salesContractNo: String(row.values.BillNo),
      lifecycleStatusRaw: String(row.values.Status),
      contractDate: String(row.values.ContractDate),
      deliveryDate: String(row.values.DeliveryDate),
      styleNo: String(row.values.GoodsDesc),
    })),
    snapshotHash: "stable-hash",
    ...patch,
  };
}

function rawSnapshot(rows) {
  return {
    schemaVersion: "ainuoke-direct-read.v2",
    reportId: "6086103",
    fetchedAt,
    page: 1,
    pageSize: Math.max(rows.length, 1),
    total: rows.length,
    queryContext: {},
    snapshotHash: "raw-hash",
    rows,
  };
}

function colorSource(billNo, insideOrderNo, status, options = {}) {
  const rows = status === "missing" ? [] : [{
    sourceRowIdentity: `6087105:sha256:${billNo}`,
    sourceId: "detail-1",
    salesContractNo: billNo,
    styleNo: options.styleNo ?? "STYLE-1",
    insideOrderNo: options.detailInsideOrderNo ?? insideOrderNo,
    insideOrderNoDrift: Boolean(options.drift),
    customerOrderNo: null,
    sizeRuleRaw: "S,M",
    sizeRuleTokens: ["S", "M"],
    colorName: status === "invalid" ? "" : "RED",
    quantity: status === "invalid" ? null : 100,
    deliveryDate: "2026-10-01",
    sizeAllocations: [{ slot: 1, sizeName: "S", quantity: 40 }, { slot: 2, sizeName: "M", quantity: 60 }],
    populatedSizeSlots: [1, 2],
    sizeValuesValid: status !== "invalid",
    highestPopulatedSizeSlot: 2,
    populatedBeyondSizeRule: false,
    sizeQuantityTotal: 100,
    sizeMatrixStatus: status === "invalid" ? "SIZE_MATRIX_QUANTITY_MISMATCH" : "SIZE_MATRIX_VALID",
  }];
  return {
    schemaVersion: "ainuoke-garment-color-size.v1",
    reportId: "6087105",
    requestedSalesContractNo: billNo,
    discoveryInsideOrderNo: insideOrderNo,
    detailInsideOrderNos: rows.map((row) => row.insideOrderNo),
    insideOrderNoDrift: Boolean(options.drift),
    expectedStyleNo: options.styleNo ?? "STYLE-1",
    upstreamRows: rows.length,
    exactRows: rows.length,
    containsFalsePositiveRows: 0,
    colorDetailStatus: status,
    rows,
    usableRows: status === "usable" ? rows : [],
    issues: status === "invalid" ? [{ code: "BLANK_COLOR", sourceRowIdentity: rows[0].sourceRowIdentity, message: "raw diagnostic omitted" }] : [],
    fetchedAt,
    sourceHash: `color-source-${billNo}`,
  };
}

test("final preview creates every usable, missing, and invalid BillNo candidate", async () => {
  const rows = [
    rawRow("1", "D1", "PI-1", { GoodsDesc: "STYLE-1" }),
    rawRow("2", "D2", "PI-2", { GoodsDesc: "STYLE-2", Status: "生效" }),
    rawRow("3", "D3", "PI-3", { GoodsDesc: "STYLE-3" }),
  ];
  const before = discovery(rows);
  const details = [
    { salesContractNo: "PI-1", pages: 1, source: colorSource("PI-1", "D1", "usable", { styleNo: "STYLE-1" }) },
    { salesContractNo: "PI-2", pages: 1, source: colorSource("PI-2", "D2", "missing", { styleNo: "STYLE-2" }) },
    { salesContractNo: "PI-3", pages: 1, source: colorSource("PI-3", "D3", "invalid", { styleNo: "STYLE-3", detailInsideOrderNo: "D3-CHANGED", drift: true }) },
  ];
  const preview = await buildFinalSalesOrderBootstrapPreview({
    discoveryBefore: before,
    discoveryAfter: structuredClone(before),
    discoveryRawSnapshots: [rawSnapshot(rows)],
    details,
  });
  assert.equal(preview.orderNoPolicy, "SERVER_GENERATED_SO_SEQUENCE");
  assert.equal(preview.readyForDisposablePostgres, true);
  assert.deepEqual(preview.coverage, { exactOrders: 2, missing: 1, invalid: 1, usable: 1 });
  assert.deepEqual(preview.candidates.map((candidate) => candidate.colorDetailStatus), ["usable", "missing", "invalid"]);
  assert.deepEqual(preview.candidates.map((candidate) => candidate.colors.length), [1, 0, 0]);
  assert.equal(preview.identity.insideOrderNoDriftCount, 1);
  assert.deepEqual(preview.colorQuantityParity, { equal: 1, lower: 0, higher: 0 });
  assert.equal(preview.candidates[0].colors[0].sourceMetadata.sizeMatrixStatus, "SIZE_MATRIX_VALID");
  assert.deepEqual(preview.candidates[2].source.sourceMetadata.colorDetail.issues, [
    { code: "BLANK_COLOR", sourceRowIdentity: "6087105:sha256:PI-3" },
  ]);
  assert.equal(preview.candidates[2].source.sourceMetadata.colorDetail.sizeEvidence[0].sizeMatrixStatus, "SIZE_MATRIX_QUANTITY_MISMATCH");
  assert.equal(JSON.stringify(preview).includes("raw diagnostic omitted"), false);
  assert.equal(preview.candidates.some((candidate) => "orderNo" in candidate), false);
  assert.match(preview.previewHash, /^[a-f0-9]{64}$/);
});

test("final preview is deterministic and fails closed on query or BillNo coverage gaps", async () => {
  const rows = [rawRow("1", "D1", "PI-1", { GoodsDesc: "STYLE-1" })];
  const before = discovery(rows);
  const detail = { salesContractNo: "PI-1", pages: 1, source: colorSource("PI-1", "D1", "usable", { styleNo: "STYLE-1" }) };
  const first = await buildFinalSalesOrderBootstrapPreview({
    discoveryBefore: before,
    discoveryAfter: before,
    discoveryRawSnapshots: [rawSnapshot(rows)],
    details: [detail],
  });
  const second = await buildFinalSalesOrderBootstrapPreview({
    discoveryBefore: before,
    discoveryAfter: before,
    discoveryRawSnapshots: [{ ...rawSnapshot(rows), fetchedAt: "2026-09-11T11:00:00.000Z" }],
    details: [{ ...detail, source: { ...detail.source, fetchedAt: "2026-09-11T11:00:00.000Z" } }],
  });
  assert.equal(first.previewHash, second.previewHash);
  await assert.rejects(() => buildFinalSalesOrderBootstrapPreview({
    discoveryBefore: before,
    discoveryAfter: before,
    discoveryRawSnapshots: [rawSnapshot(rows)],
    details: [{ salesContractNo: "PI-1", pages: 0, error: "timeout" }],
  }), /queries failed/);
  await assert.rejects(() => buildFinalSalesOrderBootstrapPreview({
    discoveryBefore: before,
    discoveryAfter: before,
    discoveryRawSnapshots: [rawSnapshot(rows)],
    details: [],
  }), /coverage/);
});

test("final stale guard compares the BillNo identity set and snapshot hash", () => {
  const beforeRows = [rawRow("1", "D1", "PI-1"), rawRow("2", "D2", "PI-2")];
  const afterRows = [rawRow("1", "D1-CHANGED", "PI-1"), rawRow("3", "D3", "PI-3")];
  const result = compareFinalSalesOrderBootstrapSnapshots(
    discovery(beforeRows, { snapshotHash: "before" }),
    discovery(afterRows, { snapshotHash: "after" }),
  );
  assert.deepEqual(result.addedBillNos, ["PI-3"]);
  assert.deepEqual(result.removedBillNos, ["PI-2"]);
  assert.equal(result.changedIdentityCount, 1);
  assert.equal(result.stable, false);
});

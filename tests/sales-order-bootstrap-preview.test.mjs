import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSalesOrderBootstrapPreview,
  compareSalesOrderBootstrapSnapshots,
  salesOrderBootstrapIssueCounts,
} from "../features/ainuoke-sync/service/sales-order-bootstrap-preview.ts";

const fetchedAt = "2026-09-11T08:00:00.000Z";

function contractRow(id, insideOrderNo, salesContractNo, patch = {}) {
  return {
    sourceRowIdentity: `6086103:sha256:${id}`,
    values: {
      id,
      InsideOrderNo: insideOrderNo,
      BillNo: salesContractNo,
      Status: "生效",
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

function rawDiscoverySnapshot(rows) {
  return {
    schemaVersion: "ainuoke-direct-read.v2",
    reportId: "6086103",
    fetchedAt,
    page: 1,
    pageSize: Math.max(rows.length, 1),
    total: rows.length,
    queryContext: {},
    snapshotHash: "raw-discovery-hash",
    rows,
  };
}

function mappedDiscovery(rows, patch = {}) {
  return {
    schemaVersion: "ainuoke-order-discovery.v1",
    reportId: "6086103",
    visibilityScope: "current_account_visible",
    fetchedAt,
    total: rows.length,
    pageCount: 1,
    rows: rows.map((row) => ({
      sourceId: String(row.values.id),
      sourceRowIdentity: row.sourceRowIdentity,
      insideOrderNo: String(row.values.InsideOrderNo).trim().toUpperCase(),
      salesContractNo: String(row.values.BillNo).trim().toUpperCase(),
      lifecycleStatusRaw: String(row.values.Status),
      contractDate: String(row.values.ContractDate),
      deliveryDate: String(row.values.DeliveryDate),
      styleNo: String(row.values.GoodsDesc),
    })),
    snapshotHash: "stable-discovery-hash",
    ...patch,
  };
}

function colorSnapshot(insideOrderNo, salesContractNo, id, quantities = [40, 60]) {
  return {
    schemaVersion: "ainuoke-direct-read.v2",
    reportId: "6086997",
    fetchedAt,
    page: 1,
    pageSize: 50,
    total: quantities.length,
    queryContext: { insideOrderNo },
    snapshotHash: `color-hash-${id}`,
    rows: quantities.map((quantity, index) => ({
      sourceRowIdentity: `6086997:sha256:${id}-${index}`,
      values: {
        billno: salesContractNo,
        GoodsDesc: `STYLE-${id}`,
        InsideOrderNo: insideOrderNo,
        stylecolor: ["RED", "BLUE", "GREEN"][index],
        stylenum: quantity,
      },
    })),
  };
}

function detail(row, quantities) {
  const insideOrderNo = String(row.values.InsideOrderNo).trim().toUpperCase();
  return {
    insideOrderNo,
    colorSnapshots: [colorSnapshot(insideOrderNo, row.values.BillNo, row.values.id, quantities)],
  };
}

test("bootstrap candidate mapping preserves all statuses, source facts, deterministic ordering and hash", async () => {
  const rows = [
    contractRow("10", " d10 ", "sc-10", { Status: "草拟" }),
    contractRow("2", "D2", "SC-2", { Status: "生效" }),
  ];
  const discovery = mappedDiscovery(rows);
  const input = {
    discoveryBefore: discovery,
    discoveryAfter: structuredClone(discovery),
    discoveryRawSnapshots: [rawDiscoverySnapshot(rows)],
    details: [detail(rows[0]), detail(rows[1])],
    contractStrategy: "DISCOVERY_ROW_REUSE",
  };
  const first = await buildSalesOrderBootstrapPreview(input);
  const reordered = await buildSalesOrderBootstrapPreview({ ...input, details: [...input.details].reverse() });
  const refetched = await buildSalesOrderBootstrapPreview({
    ...input,
    discoveryRawSnapshots: input.discoveryRawSnapshots.map((page) => ({ ...page, fetchedAt: "2026-09-11T09:00:00.000Z" })),
    details: input.details.map((item) => ({
      ...item,
      colorSnapshots: item.colorSnapshots.map((page) => ({ ...page, fetchedAt: "2026-09-11T09:00:00.000Z" })),
    })),
  });

  assert.equal(first.readyForDisposableDryRun, true);
  assert.equal(first.orderNoPolicy, "NEEDS_USER_DECISION");
  assert.deepEqual(first.statusDistribution, [{ status: "草拟", count: 1 }, { status: "生效", count: 1 }]);
  assert.deepEqual(first.candidates.map((candidate) => candidate.source.sourceId), ["2", "10"]);
  assert.deepEqual(first.candidates.map((candidate) => candidate.previewOnlyOrderNo), ["PREVIEW-000001", "PREVIEW-000002"]);
  assert.equal(first.candidates[0].source.insideOrderNo, "D2");
  assert.equal(first.candidates[0].source.quantity, 100);
  assert.equal(first.candidates[0].colors.length, 2);
  assert.equal("id" in first.candidates[0], false);
  assert.match(first.previewHash, /^[a-f0-9]{64}$/);
  assert.equal(first.previewHash, reordered.previewHash);
  assert.equal(first.previewHash, refetched.previewHash);
});

test("reconciliation detects duplicate and cross-identity conflicts", async () => {
  const rows = [
    contractRow("1", "D1", "SC-1"),
    contractRow("1", "D1", "SC-2"),
    contractRow("3", "D3", "SC-2"),
  ];
  rows[1].sourceRowIdentity = rows[0].sourceRowIdentity;
  const discovery = mappedDiscovery(rows);
  const preview = await buildSalesOrderBootstrapPreview({
    discoveryBefore: discovery,
    discoveryAfter: discovery,
    discoveryRawSnapshots: [rawDiscoverySnapshot(rows)],
    details: rows.map((row) => detail(row)),
    contractStrategy: "DISCOVERY_ROW_REUSE",
  });
  const counts = salesOrderBootstrapIssueCounts(preview).blocking;
  assert.equal(counts.duplicate_source_id, 1);
  assert.equal(counts.duplicate_source_row_identity, 1);
  assert.equal(counts.duplicate_inside_order_no, 1);
  assert.equal(counts.duplicate_sales_contract_no, 1);
  assert.equal(counts.inside_order_multiple_contracts, 1);
  assert.equal(counts.sales_contract_multiple_inside_orders, 1);
  assert.equal(preview.readyForDisposableDryRun, false);
});

test("reconciliation blocks detail failures and identity mismatches", async () => {
  const rows = [contractRow("1", "D1", "SC-1"), contractRow("2", "D2", "SC-2")];
  const mismatchedContract = contractRow("2", "OTHER", "SC-2");
  const discovery = mappedDiscovery(rows);
  const preview = await buildSalesOrderBootstrapPreview({
    discoveryBefore: discovery,
    discoveryAfter: discovery,
    discoveryRawSnapshots: [rawDiscoverySnapshot(rows)],
    details: [
      { insideOrderNo: "D1", contractError: "timeout", colorError: "not attempted" },
      {
        insideOrderNo: "D2",
        contractSnapshots: [{ ...rawDiscoverySnapshot([mismatchedContract]), queryContext: { insideOrderNo: "D2" } }],
        colorSnapshots: [colorSnapshot("D2", "SC-2", "2")],
      },
    ],
    contractStrategy: "PER_ORDER_DETAIL",
  });
  const counts = salesOrderBootstrapIssueCounts(preview).blocking;
  assert.equal(counts.contract_detail_failure, 1);
  assert.equal(counts.color_detail_failure, 1);
  assert.equal(counts.identity_mismatch, 1);
  assert.equal(preview.candidates.length, 0);
});

test("color quantity differences are warnings and never silently corrected", async () => {
  const rows = [contractRow("1", "D1", "SC-1")];
  const discovery = mappedDiscovery(rows);
  const preview = await buildSalesOrderBootstrapPreview({
    discoveryBefore: discovery,
    discoveryAfter: discovery,
    discoveryRawSnapshots: [rawDiscoverySnapshot(rows)],
    details: [detail(rows[0], [30, 60])],
    contractStrategy: "DISCOVERY_ROW_REUSE",
  });
  assert.equal(salesOrderBootstrapIssueCounts(preview).warning.color_quantity_difference, 1);
  assert.deepEqual(preview.candidates[0].colors.map((color) => color.quantity), [30, 60]);
  assert.equal(preview.candidates[0].source.quantity, 100);
  assert.equal(preview.readyForDisposableDryRun, true);
});

test("malformed color details are counted as color failures", async () => {
  const rows = [contractRow("1", "D1", "SC-1")];
  const discovery = mappedDiscovery(rows);
  const brokenColor = colorSnapshot("D1", "SC-1", "1");
  delete brokenColor.rows[0].values.stylecolor;
  const preview = await buildSalesOrderBootstrapPreview({
    discoveryBefore: discovery,
    discoveryAfter: discovery,
    discoveryRawSnapshots: [rawDiscoverySnapshot(rows)],
    details: [{ insideOrderNo: "D1", colorSnapshots: [brokenColor] }],
    contractStrategy: "DISCOVERY_ROW_REUSE",
  });
  assert.deepEqual(preview.contractDetail, { success: 1, failure: 0 });
  assert.deepEqual(preview.colorDetail, { success: 0, failure: 1 });
  assert.equal(salesOrderBootstrapIssueCounts(preview).blocking.color_detail_failure, 1);
});

test("snapshot stale guard reports additions, removals and identity changes", () => {
  const beforeRows = [contractRow("1", "D1", "SC-1"), contractRow("2", "D2", "SC-2"), contractRow("3", "D3", "SC-3")];
  const afterRows = [contractRow("1", "D1-CHANGED", "SC-1"), contractRow("3", "D3", "SC-3"), contractRow("4", "D4", "SC-4")];
  const result = compareSalesOrderBootstrapSnapshots(
    mappedDiscovery(beforeRows, { snapshotHash: "before" }),
    mappedDiscovery(afterRows, { snapshotHash: "after" }),
  );
  assert.deepEqual(result.added, ["4"]);
  assert.deepEqual(result.removed, ["2"]);
  assert.equal(result.changedIdentityCount, 1);
  assert.equal(result.stable, false);
});

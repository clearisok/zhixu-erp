import "fake-indexeddb/auto";

import { performance } from "node:perf_hooks";
import React from "react";
import { renderToString } from "react-dom/server";
import { DataTable, type DataColumn } from "../components/foundation/data-table.tsx";
import { PermissionProvider } from "../features/permissions/components/permission-provider.tsx";
import { replaceStyleProgressData, styleProgressRepository } from "../features/style-progress/repository/style-progress-repository.ts";
import { loadStyleProgress } from "../features/style-progress/service/style-progress-loader.ts";
import { buildStyleProgressProjections, type StyleProgressProjection } from "../features/style-progress/service/style-progress-service.ts";
import { createStyleProgressBenchmarkFixture } from "./style-progress-benchmark-fixture.ts";

const DEFAULT_SIZES = [1_000, 5_000, 10_000, 20_000];

function parseSizes(): number[] {
  const argument = process.argv.find((value) => value.startsWith("--sizes="));
  if (!argument) return DEFAULT_SIZES;
  return argument.slice("--sizes=".length).split(",").map(Number);
}

function iterationsFor(size: number): number {
  if (size <= 5_000) return 3;
  if (size <= 10_000) return 2;
  return 1;
}

async function medianDuration(action: () => unknown | Promise<unknown>, iterations: number): Promise<number> {
  const values: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    await action();
    values.push(performance.now() - startedAt);
  }
  values.sort((left, right) => left - right);
  return values[Math.floor(values.length / 2)];
}

const columns: DataColumn<StyleProgressProjection>[] = [
  { key: "risk", header: "风险", width: 90, render: (row) => row.salesRisk },
  { key: "style", header: "工厂款号", width: 130, render: (row) => row.factoryStyleNo || row.styleNo },
  { key: "contract", header: "销售合同", width: 130, render: (row) => row.salesContractNo },
  { key: "brand", header: "品牌", width: 120, render: (row) => row.brand },
  { key: "owner", header: "跟单人", width: 90, render: (row) => row.owner },
  { key: "quantity", header: "成衣数量", width: 100, render: (row) => row.garmentQuantity },
  { key: "delivery", header: "合同交期", width: 110, render: (row) => row.contractDeliveryDate },
  { key: "fabric", header: "面料齐套", width: 95, render: (row) => `${row.fabricReady}/${row.fabricTotal}` },
  { key: "trim", header: "辅料齐套", width: 95, render: (row) => `${row.trimReady}/${row.trimTotal}` },
  { key: "rate", header: "总齐套", width: 85, render: (row) => row.readinessRate.toFixed(1) },
  { key: "unpurchase", header: "未采购", width: 80, render: (row) => row.notPurchasedCount },
  { key: "inbound", header: "待入库", width: 80, render: (row) => row.pendingInboundCount },
  { key: "transport", header: "运输风险", width: 110, render: (row) => row.transportRisk },
];

function renderDataTable(rows: StyleProgressProjection[]): string {
  return renderToString(
    <PermissionProvider>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.salesContractNo}
        ariaLabel="款式进度 benchmark"
      />
    </PermissionProvider>,
  );
}

const results = [];
for (const size of parseSizes()) {
  const fixture = createStyleProgressBenchmarkFixture(size);
  await replaceStyleProgressData(fixture.data);
  const iterations = iterationsFor(size);
  const repositoryLoadAllMs = await medianDuration(() => styleProgressRepository.loadAll(), iterations);
  let projectionRows: StyleProgressProjection[] = [];
  const projectionMs = await medianDuration(() => {
    projectionRows = buildStyleProgressProjections({
      data: fixture.data,
      orders: fixture.orders,
      scheduling: fixture.scheduling,
      settings: fixture.settings,
      today: "2026-09-10",
    });
  }, iterations);
  const loadProgressMs = await medianDuration(() => loadStyleProgress({
    loadOrders: async () => fixture.orders,
    loadScheduling: async () => fixture.scheduling,
    loadSettings: () => fixture.settings,
  }), iterations);
  const dataTableRenderMs = await medianDuration(() => renderDataTable(projectionRows), iterations);
  results.push({
    demands: size,
    contracts: fixture.orders.length,
    expectedArrivalBatches: fixture.data.expectedArrivalBatches.length,
    iterations,
    repositoryLoadAllMs,
    projectionMs,
    loadProgressMs,
    dataTableRenderMs,
  });
  console.table(results.slice(-1));
}

console.log("STYLE_PROGRESS_BENCHMARK_JSON");
console.log(JSON.stringify(results, null, 2));

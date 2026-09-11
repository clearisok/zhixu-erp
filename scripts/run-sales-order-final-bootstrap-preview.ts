import pg from "pg";
import { resolve } from "node:path";
import { createAinuokeBridgeClient } from "../features/ainuoke-api/client/ainuoke-bridge-client.ts";
import type { AinuokeOrderDiscoveryQuery, AinuokeReportSnapshot } from "../features/ainuoke-api/model/ainuoke-api.ts";
import { adaptAinuokeOrderDiscoverySnapshots } from "../features/ainuoke-api/source/ainuoke-order-discovery-adapter.ts";
import {
  adaptAinuokeGarmentColorSizeSnapshots,
  normalizeAinuokeSalesContractNo,
} from "../features/ainuoke-sync/source/ainuoke-garment-color-size-adapter.ts";
import {
  buildFinalSalesOrderBootstrapPreview,
  type FinalSalesOrderBootstrapDetail,
} from "../features/ainuoke-sync/service/sales-order-final-bootstrap-preview.ts";
import { synchronizePermissionCatalog } from "../server/auth/permissions.ts";
import type { TrustedIdentity } from "../server/auth/session.ts";
import { runMigrations } from "../server/db/migration-runner.ts";
import { startDisposablePostgres } from "../server/integration/postgres-container.ts";
import { runSalesOrderBootstrapDryRun } from "../server/sales-orders/bootstrap-dry-run.ts";

const { Pool } = pg;
const ORIGIN = "http://127.0.0.1:3001";
const CONCURRENCY = 4;
const PAGE_SIZE = 50;

function createCookieFetch(): typeof fetch {
  let cookie: string | null = null;
  return async (input, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("Origin", ORIGIN);
    if (cookie) headers.set("Cookie", cookie);
    const response = await fetch(input, { ...init, headers });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";", 1)[0];
    return response;
  };
}

async function readDetails(
  client: ReturnType<typeof createAinuokeBridgeClient>,
  userId: string,
  contracts: ReadonlyArray<{ insideOrderNo: string; salesContractNo: string; styleNo: string }>,
): Promise<FinalSalesOrderBootstrapDetail[]> {
  const results = new Array<FinalSalesOrderBootstrapDetail>(contracts.length);
  let cursor = 0;
  let complete = 0;
  async function worker(): Promise<void> {
    while (cursor < contracts.length) {
      const index = cursor;
      cursor += 1;
      const contract = contracts[index];
      try {
        const snapshots = await client.readAllGarmentColorSizePages(userId, {
          salesContractNo: contract.salesContractNo,
          pageSize: PAGE_SIZE,
          maxPages: 100,
        });
        results[index] = {
          salesContractNo: contract.salesContractNo,
          pages: snapshots.length,
          source: await adaptAinuokeGarmentColorSizeSnapshots({
            snapshots,
            requestedSalesContractNo: contract.salesContractNo,
            discoveryInsideOrderNo: contract.insideOrderNo,
            expectedStyleNo: contract.styleNo,
          }),
        };
      } catch (error) {
        results[index] = {
          salesContractNo: contract.salesContractNo,
          pages: 0,
          error: error instanceof Error ? error.message : "6087105 query failed",
        };
      }
      complete += 1;
      if (complete % 25 === 0 || complete === contracts.length) {
        console.log(`6087105 progress ${complete}/${contracts.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return results;
}

async function seedTrustedActor(pool: pg.Pool): Promise<TrustedIdentity> {
  const row = await pool.query<{ id: string; public_id: string }>(
    `INSERT INTO app_users(username, password_hash, display_name, role, active)
     VALUES ('final-bootstrap-preview', crypt('disposable-only', gen_salt('bf', 12)), 'Final Bootstrap Preview', 'viewer', true)
     RETURNING id::text, public_id::text`,
  );
  return {
    internalUserId: row.rows[0].id,
    userId: row.rows[0].public_id,
    username: "final-bootstrap-preview",
    userName: "Final Bootstrap Preview",
    permissions: ["order.view"],
  };
}

function blankAndDuplicateBillNos(values: readonly string[]): { blank: number; duplicates: number } {
  const normalized = values.map(normalizeAinuokeSalesContractNo);
  return {
    blank: normalized.filter((value) => !value).length,
    duplicates: normalized.length - new Set(normalized).size,
  };
}

async function main(): Promise<void> {
  const userId = process.argv[2]?.trim();
  if (!userId) throw new Error("Usage: tsx scripts/run-sales-order-final-bootstrap-preview.ts <browser-local-user-id>");
  const client = createAinuokeBridgeClient({ fetchImpl: createCookieFetch() });
  const beforePages = await client.readAllOrderDiscoveryPages(userId, { pageSize: PAGE_SIZE, maxPages: 100 });
  const discoveryBefore = await adaptAinuokeOrderDiscoverySnapshots(beforePages);
  console.log(`Discovery before ${discoveryBefore.total}/${discoveryBefore.pageCount} ${discoveryBefore.snapshotHash}`);
  const details = await readDetails(client, userId, discoveryBefore.rows);
  const afterPages = await client.readAllOrderDiscoveryPages(userId, { pageSize: PAGE_SIZE, maxPages: 100 });
  const discoveryAfter = await adaptAinuokeOrderDiscoverySnapshots(afterPages);
  const billNo = blankAndDuplicateBillNos(discoveryBefore.rows.map((row) => row.salesContractNo));
  const queryFailures = details.filter((detail) => detail.error || !detail.source).length;
  if (queryFailures) throw new Error(`6087105 query failures prevent final preview: ${queryFailures}`);
  const preview = await buildFinalSalesOrderBootstrapPreview({
    discoveryBefore,
    discoveryAfter,
    discoveryRawSnapshots: beforePages as ReadonlyArray<AinuokeReportSnapshot<AinuokeOrderDiscoveryQuery>>,
    details,
  });

  let disposable: Awaited<ReturnType<typeof startDisposablePostgres>> | null = null;
  let pool: pg.Pool | null = null;
  try {
    if (!preview.readyForDisposablePostgres || billNo.blank || billNo.duplicates) {
      throw new Error("Fresh Preview failed closed before disposable PostgreSQL");
    }
    disposable = await startDisposablePostgres();
    const databaseUrl = await disposable.createDatabase("final_bootstrap_preview");
    pool = new Pool({ connectionString: databaseUrl });
    const migrations = await runMigrations(pool, resolve("database/migrations"));
    await synchronizePermissionCatalog(pool);
    const actor = await seedTrustedActor(pool);
    const dryRun = await runSalesOrderBootstrapDryRun(
      pool,
      actor,
      preview.candidates.map((candidate) => ({ source: candidate.source, colors: candidate.colors })),
    );
    const trustedLogs = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM operation_logs WHERE actor_public_id = $1::uuid AND actor_name = $2",
      [actor.userId, actor.userName],
    );
    const ready = preview.snapshot.stable
      && dryRun.created === preview.discovery.total
      && dryRun.rejected === 0
      && dryRun.idempotencyPassed
      && dryRun.rollbackPassed
      && dryRun.orderNumberDuplicates === 0
      && dryRun.uuidDuplicates === 0
      && dryRun.clientOverrideRejected
      && dryRun.mutationRejected
      && !dryRun.rollbackNumberReuse
      && trustedLogs.rows[0].count === preview.discovery.total;
    console.log(`FINAL_PREVIEW_RESULT=${JSON.stringify({
      discoveryBefore: {
        total: discoveryBefore.total,
        pages: discoveryBefore.pageCount,
        status: preview.discovery.statusDistribution,
        hash: discoveryBefore.snapshotHash,
      },
      discoveryAfter: { total: discoveryAfter.total, hash: discoveryAfter.snapshotHash },
      snapshot: preview.snapshot,
      billNo,
      detail: {
        queries: preview.queries.total,
        success: preview.queries.successful,
        failed: preview.queries.failed,
        pages: preview.queries.pages,
        exactOrders: preview.coverage.exactOrders,
        missing: preview.coverage.missing,
        invalid: preview.coverage.invalid,
        usable: preview.coverage.usable,
      },
      insideOrderNoDrift: preview.identity.insideOrderNoDriftCount,
      colorQuantityParity: preview.colorQuantityParity,
      candidate: {
        planned: preview.candidates.length,
        colorUsable: preview.coverage.usable,
        colorMissing: preview.coverage.missing,
        colorInvalid: preview.coverage.invalid,
        previewHash: preview.previewHash,
      },
      disposablePostgres: {
        migrations: migrations.applied,
        planned: dryRun.planned,
        created: dryRun.created,
        rejected: dryRun.rejected,
        idempotentReturns: dryRun.idempotent,
        sourceLinkConflicts: dryRun.sourceLinkConflicts,
        schemaRejections: dryRun.schemaRejections,
        rollbackProbes: dryRun.rolledBack,
        trustedOperationLogs: trustedLogs.rows[0].count,
      },
      orderNumbers: {
        first: dryRun.firstOrderNo,
        last: dryRun.lastOrderNo,
        duplicates: dryRun.orderNumberDuplicates,
        clientOverrideRejected: dryRun.clientOverrideRejected,
        mutationRejected: dryRun.mutationRejected,
        rollbackNumberReuse: dryRun.rollbackNumberReuse,
      },
      uuidDuplicates: dryRun.uuidDuplicates,
      ainuokeReads: beforePages.length + preview.queries.pages + afterPages.length,
      readsByReport: { "6086103": beforePages.length + afterPages.length, "6087105": preview.queries.pages, "6086997": 0, "6087050": 0 },
      writes: { ainuoke: 0, realPostgres: 0, browser: 0, quote: 0, styleProgress: 0, scheduling: 0, closing: 0 },
      readyForRealBootstrap: ready,
      reason: ready
        ? "Fresh BillNo snapshot is stable and every candidate passed the disposable PostgreSQL service path. Real bootstrap still requires separate explicit authorization."
        : "Fresh Preview or disposable PostgreSQL validation failed.",
    })}`);
    if (!ready) process.exitCode = 1;
  } finally {
    if (pool) await pool.end();
    if (disposable) await disposable.stop();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Final bootstrap preview failed");
  process.exitCode = 1;
});

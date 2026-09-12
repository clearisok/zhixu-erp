import pg from "pg";
import { resolve } from "node:path";
import { synchronizePermissionCatalog } from "../server/auth/permissions.ts";
import type { TrustedIdentity } from "../server/auth/session.ts";
import { runMigrations } from "../server/db/migration-runner.ts";
import { startDisposablePostgres } from "../server/integration/postgres-container.ts";
import { runSalesOrderBootstrapDryRun } from "../server/sales-orders/bootstrap-dry-run.ts";
import { buildFreshSalesOrderBootstrapPlan } from "../server/sales-orders/bootstrap-source.ts";

const { Pool } = pg;

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

async function main(): Promise<void> {
  const userId = process.argv[2]?.trim();
  if (!userId) throw new Error("Usage: tsx scripts/run-sales-order-final-bootstrap-preview.ts <browser-local-user-id>");
  const plan = await buildFreshSalesOrderBootstrapPlan({
    ainuokeUserId: userId,
    onProgress: (progress) => {
      if (progress.phase === "color_details" && (progress.completed % 25 === 0 || progress.completed === progress.total)) {
        console.log(`6087105 progress ${progress.completed}/${progress.total}`);
      }
    },
  });
  const { preview, billNo } = plan;
  console.log(`Discovery before ${preview.snapshot.beforeTotal}/${preview.discovery.pages} ${preview.snapshot.beforeHash}`);

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
        total: preview.snapshot.beforeTotal,
        pages: preview.discovery.pages,
        status: preview.discovery.statusDistribution,
        hash: preview.snapshot.beforeHash,
      },
      discoveryAfter: { total: preview.snapshot.afterTotal, hash: preview.snapshot.afterHash },
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
      ainuokeReads: plan.reads.total,
      readsByReport: plan.reads.byReport,
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

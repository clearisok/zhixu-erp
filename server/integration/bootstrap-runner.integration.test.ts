import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import pg from "pg";
import type { FinalSalesOrderBootstrapPreview } from "../../features/ainuoke-sync/service/sales-order-final-bootstrap-preview.js";
import { runMigrations } from "../db/migration-runner.js";
import {
  BootstrapExecutionError,
  BootstrapGuardError,
  REAL_BOOTSTRAP_CLI_CONFIRMATION,
  REAL_BOOTSTRAP_ENV_CONFIRMATION,
  assertExecuteConfirmation,
  executeProductionSalesOrderBootstrap,
  inspectFirstBootstrapPreconditions,
  loadExistingBootstrapActor,
  parseBootstrapCliArguments,
} from "../sales-orders/bootstrap-runner.js";
import { startDisposablePostgres } from "./postgres-container.js";
import { frozenFoundationMigrations } from "./frozen-foundation-migrations.js";

const { Pool } = pg;
let migrationsDirectory: string;

function databaseName(databaseUrl: string): string {
  return decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
}

async function migratedDatabase(
  postgres: Awaited<ReturnType<typeof startDisposablePostgres>>,
  label: string,
): Promise<{ pool: pg.Pool; database: string }> {
  const databaseUrl = await postgres.createDatabase(label);
  const pool = new Pool({ connectionString: databaseUrl });
  await runMigrations(pool, migrationsDirectory);
  return { pool, database: databaseName(databaseUrl) };
}

async function seedExistingActor(pool: pg.Pool, username: string, active = true): Promise<void> {
  await pool.query(
    `INSERT INTO app_users(username, password_hash, display_name, role, active)
     VALUES ($1, crypt(gen_random_uuid()::text, gen_salt('bf', 12)), $2, 'viewer', $3)`,
    [username, `Existing ${username}`, active],
  );
}

function candidate(sequence: number, input: {
  billNo: string;
  quantity: number;
  status: "usable" | "missing" | "invalid";
  colors?: Array<{ name: string; quantity: number }>;
}) {
  const sourceId = `source-${sequence}`;
  return {
    sequence,
    colorDetailStatus: input.status,
    source: {
      sourceId,
      sourceRowIdentity: `6086103:sha256:${sourceId}`,
      salesContractNo: input.billNo,
      insideOrderNo: `INSIDE-${sequence}`,
      lifecycleStatusRaw: sequence % 2 ? "草拟" : "生效",
      contractDate: "2026-09-01",
      contractDeliveryDate: "2026-10-01",
      styleNo: `STYLE-${sequence}`,
      companyNameSnapshot: "Fixture Company",
      customerNameSnapshot: "Fixture Customer",
      brandNameSnapshot: "Fixture Brand",
      quantity: input.quantity,
      sourceHash: `contract-hash-${sequence}`,
      fetchedAt: "2026-09-12T00:00:00.000Z",
      sourceMetadata: {
        reportId: "6086103",
        visibilityScope: "current_account_visible",
        colorDetail: { status: input.status },
      },
    },
    colors: (input.colors ?? []).map((color, index) => ({
      sourceLineIdentity: `6087105:sha256:${sourceId}:${index + 1}`,
      colorName: color.name,
      quantity: color.quantity,
      deliveryDate: null,
      sourceHash: `color-hash-${sequence}-${index + 1}`,
      sourceMetadata: { reportId: "6087105", salesContractNo: input.billNo },
    })),
  };
}

function previewWithCandidates(
  candidates: ReturnType<typeof candidate>[],
): FinalSalesOrderBootstrapPreview {
  const usable = candidates.filter((item) => item.colorDetailStatus === "usable").length;
  const missing = candidates.filter((item) => item.colorDetailStatus === "missing").length;
  const invalid = candidates.filter((item) => item.colorDetailStatus === "invalid").length;
  return {
    schemaVersion: "sales-order-final-bootstrap-preview.v2",
    orderNoPolicy: "SERVER_GENERATED_SO_SEQUENCE",
    discovery: { total: candidates.length, pages: 1, statusDistribution: [{ status: "草拟", count: candidates.length }] },
    queries: { total: candidates.length, successful: candidates.length, failed: 0, pages: candidates.length },
    coverage: { exactOrders: candidates.length - missing, usable, missing, invalid },
    identity: { insideOrderNoDriftCount: 0 },
    colorQuantityParity: { equal: usable, lower: 0, higher: 0 },
    candidates,
    snapshot: {
      beforeTotal: candidates.length,
      afterTotal: candidates.length,
      beforeHash: "stable-discovery-hash",
      afterHash: "stable-discovery-hash",
      addedBillNos: [],
      removedBillNos: [],
      changedIdentityCount: 0,
      stable: true,
    },
    previewHash: "immutable-preview-hash",
    readyForDisposablePostgres: true,
  };
}

const fixedPreview = () => previewWithCandidates([
  candidate(1, {
    billNo: "PI-001",
    quantity: 10,
    status: "usable",
    colors: [{ name: "RED", quantity: 5 }, { name: "BLUE", quantity: 5 }],
  }),
  candidate(2, { billNo: "PI-002", quantity: 7, status: "invalid" }),
  candidate(3, {
    billNo: "PI-003",
    quantity: 3,
    status: "usable",
    colors: [{ name: "GREEN", quantity: 3 }],
  }),
]);

test("guarded production SalesOrder bootstrap runner rehearses only in disposable PostgreSQL", async (context) => {
  const frozen = await frozenFoundationMigrations();
  migrationsDirectory = frozen.directory;
  context.after(frozen.dispose);
  const postgres = await startDisposablePostgres();
  const pools: pg.Pool[] = [];
  try {
    await context.test("current expanded migration set still fails the frozen production guard closed", async () => {
      const database = await migratedDatabase(postgres, "expanded_migrations");
      pools.push(database.pool);
      const report = await inspectFirstBootstrapPreconditions(database.pool, resolve("database/migrations"), database.database);
      assert.ok(report.reasons.includes("repository_migration_set_mismatch"));
    });
    await context.test("requires one CLI mode, Ainuoke user ID, and both execute confirmations", () => {
      assert.throws(() => parseBootstrapCliArguments([]), BootstrapGuardError);
      assert.throws(() => parseBootstrapCliArguments(["--plan", "--execute", "--ainuoke-user-id=user-1"]), BootstrapGuardError);
      assert.deepEqual(parseBootstrapCliArguments(["--plan", "--ainuoke-user-id=user-1"]), {
        mode: "plan",
        ainuokeUserId: "user-1",
        confirmation: null,
      });
      assert.throws(() => assertExecuteConfirmation({ mode: "execute", cliConfirmation: null, envConfirmation: "YES" }), BootstrapGuardError);
      assert.throws(() => assertExecuteConfirmation({ mode: "execute", cliConfirmation: "zhixu", envConfirmation: undefined }), BootstrapGuardError);
      assert.doesNotThrow(() => assertExecuteConfirmation({
        mode: "execute",
        cliConfirmation: REAL_BOOTSTRAP_CLI_CONFIRMATION,
        envConfirmation: REAL_BOOTSTRAP_ENV_CONFIRMATION,
      }));
    });

    await context.test("rejects wrong target and missing migration ledger", async () => {
      const databaseUrl = await postgres.createDatabase("runner_missing_ledger");
      const pool = new Pool({ connectionString: databaseUrl });
      pools.push(pool);
      const report = await inspectFirstBootstrapPreconditions(pool, migrationsDirectory, "zhixu");
      assert.equal(report.ready, false);
      assert.ok(report.reasons.includes("target_database_mismatch"));
      assert.ok(report.reasons.includes("migration_ledger_mismatch"));
    });

    await context.test("rejects non-empty SalesOrder state and consumed sequence", async () => {
      const nonEmpty = await migratedDatabase(postgres, "runner_non_empty");
      pools.push(nonEmpty.pool);
      await nonEmpty.pool.query("INSERT INTO sales_orders(creation_source) VALUES ('manual')");
      const nonEmptyReport = await inspectFirstBootstrapPreconditions(nonEmpty.pool, migrationsDirectory, nonEmpty.database);
      assert.equal(nonEmptyReport.ready, false);
      assert.ok(nonEmptyReport.reasons.includes("first_bootstrap_requires_empty_sales_order_state"));

      const consumed = await migratedDatabase(postgres, "runner_consumed_sequence");
      pools.push(consumed.pool);
      await consumed.pool.query("SELECT nextval('sales_order_number_seq')");
      const consumedReport = await inspectFirstBootstrapPreconditions(consumed.pool, migrationsDirectory, consumed.database);
      assert.equal(consumedReport.ready, false);
      assert.ok(consumedReport.reasons.includes("first_bootstrap_requires_unconsumed_sequence"));
    });

    await context.test("requires an existing active actor and accepts empty permissions", async () => {
      const database = await migratedDatabase(postgres, "runner_actor");
      pools.push(database.pool);
      await assert.rejects(() => loadExistingBootstrapActor(database.pool, "missing-actor"), BootstrapGuardError);
      await seedExistingActor(database.pool, "inactive-actor", false);
      await assert.rejects(() => loadExistingBootstrapActor(database.pool, "inactive-actor"), BootstrapGuardError);
      await seedExistingActor(database.pool, "existing-actor");
      const actor = await loadExistingBootstrapActor(database.pool, "existing-actor");
      assert.equal(actor.username, "existing-actor");
      assert.deepEqual(actor.permissions, []);
    });

    await context.test("rejects a stale Preview before any SalesOrder write", async () => {
      const database = await migratedDatabase(postgres, "runner_stale_preview");
      pools.push(database.pool);
      await seedExistingActor(database.pool, "stale-preview-owner");
      const stalePreview = fixedPreview();
      stalePreview.snapshot.stable = false;
      await assert.rejects(
        () => executeProductionSalesOrderBootstrap(database.pool, {
          preview: stalePreview,
          migrationsDirectory,
          actorUsername: "stale-preview-owner",
          expectedDatabase: database.database,
          cliConfirmation: REAL_BOOTSTRAP_CLI_CONFIRMATION,
          envConfirmation: REAL_BOOTSTRAP_ENV_CONFIRMATION,
        }),
        (error: unknown) => error instanceof BootstrapGuardError
          && error.reasons.includes("fresh_preview_snapshot_not_stable"),
      );
      const counts = await database.pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM sales_orders",
      );
      assert.equal(counts.rows[0].count, 0);
    });

    await context.test("creates all in BillNo order, preserves invalid colors as empty, and replays idempotently", async () => {
      const database = await migratedDatabase(postgres, "runner_success");
      pools.push(database.pool);
      await seedExistingActor(database.pool, "bootstrap-owner");
      const result = await executeProductionSalesOrderBootstrap(database.pool, {
        preview: fixedPreview(),
        migrationsDirectory,
        actorUsername: "bootstrap-owner",
        expectedDatabase: database.database,
        cliConfirmation: REAL_BOOTSTRAP_CLI_CONFIRMATION,
        envConfirmation: REAL_BOOTSTRAP_ENV_CONFIRMATION,
      });
      assert.equal(result.planned, 3);
      assert.equal(result.created, 3);
      assert.equal(result.idempotent, 3);
      assert.equal(result.reconciliation.passed, true);
      assert.equal(result.reconciliation.operationLogsByActor, 3);
      assert.equal(result.reconciliation.firstOrderNo, "SO-00000001");
      assert.equal(result.reconciliation.lastOrderNo, "SO-00000003");
      assert.deepEqual(result.countsBeforeReplay, result.countsAfterReplay);
      const invalidColors = await database.pool.query<{ count: number }>(`SELECT count(*)::int AS count
        FROM ainuoke_sales_order_color_mirrors color
        JOIN sales_order_source_links link ON link.sales_order_id = color.sales_order_id
        WHERE link.external_id = 'source-2'`);
      assert.equal(invalidColors.rows[0].count, 0);
      const serialized = JSON.stringify(result);
      assert.doesNotMatch(serialized, /password|password_hash|session.?token|cookie/iu);
    });

    await context.test("stops after the first write failure without creating later candidates", async () => {
      const database = await migratedDatabase(postgres, "runner_failure_stop");
      pools.push(database.pool);
      await seedExistingActor(database.pool, "failure-owner");
      const failurePreview = previewWithCandidates([
        candidate(1, { billNo: "PI-001", quantity: 1, status: "usable", colors: [{ name: "RED", quantity: 1 }] }),
        candidate(2, { billNo: "PI-002", quantity: 1, status: "usable", colors: [{ name: "BROKEN", quantity: -1 }] }),
        candidate(3, { billNo: "PI-003", quantity: 1, status: "usable", colors: [{ name: "GREEN", quantity: 1 }] }),
      ]);
      let failure: BootstrapExecutionError | null = null;
      try {
        await executeProductionSalesOrderBootstrap(database.pool, {
          preview: failurePreview,
          migrationsDirectory,
          actorUsername: "failure-owner",
          expectedDatabase: database.database,
          cliConfirmation: REAL_BOOTSTRAP_CLI_CONFIRMATION,
          envConfirmation: REAL_BOOTSTRAP_ENV_CONFIRMATION,
        });
      } catch (error) {
        if (error instanceof BootstrapExecutionError) failure = error;
        else throw error;
      }
      assert.ok(failure);
      assert.equal(failure.report.phase, "create");
      assert.equal(failure.report.createdBeforeFailure, 1);
      assert.equal(failure.report.failedBillNo, "PI-002");
      assert.equal(failure.report.currentCounts.salesOrders, 1);
      const later = await database.pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM sales_order_source_links WHERE external_id = 'source-3'",
      );
      assert.equal(later.rows[0].count, 0);
      const logs = await database.pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM operation_logs WHERE entity_type = 'SalesOrder'",
      );
      assert.equal(logs.rows[0].count, 1);
    });
  } finally {
    await Promise.all(pools.map((pool) => pool.end()));
    await postgres.stop();
  }
});

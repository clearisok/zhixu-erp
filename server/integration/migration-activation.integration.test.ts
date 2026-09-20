import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import pg from "pg";
import {
  inspectMigrationStatus,
  PendingMigrationsError,
  runMigrations,
  verifyMigrationsCurrent,
} from "../db/migration-runner.js";
import { initializeServer } from "../startup.js";
import { startDisposablePostgres } from "./postgres-container.js";

const { Pool } = pg;
const execFileAsync = promisify(execFile);

async function migrationDirectory(files: Record<string, string>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "zhixu-migration-activation-"));
  await Promise.all(Object.entries(files).map(([filename, contents]) =>
    writeFile(join(directory, filename), contents, "utf8")
  ));
  return directory;
}

test("server migration activation safety uses only a disposable PG16 container", async (t) => {
  const postgres = await startDisposablePostgres();
  t.after(async () => postgres.stop());

  await t.test("missing ledger is reported read-only and does not initialize schema", async () => {
    const databaseUrl = await postgres.createDatabase("missing_ledger_read_only");
    const directory = await migrationDirectory({
      "0001_foundation.sql": "CREATE TABLE activation_marker(id INTEGER PRIMARY KEY);",
    });
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const before = await pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'",
      );
      const status = await inspectMigrationStatus(pool, directory);
      assert.deepEqual(status, {
        ledgerExists: false,
        applied: [],
        pending: ["0001_foundation.sql"],
        integrity: "migration_required",
      });
      await assert.rejects(
        () => verifyMigrationsCurrent(pool, directory),
        (error: unknown) => error instanceof PendingMigrationsError
          && error.code === "pending_migrations"
          && /npm run db:migrate/.test(error.message),
      );
      const after = await pool.query<{ count: number; ledger: string | null; marker: string | null }>(
        `SELECT
           (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public') AS count,
           to_regclass('public.schema_migrations')::text AS ledger,
           to_regclass('public.activation_marker')::text AS marker`,
      );
      assert.equal(after.rows[0].count, before.rows[0].count);
      assert.equal(after.rows[0].ledger, null);
      assert.equal(after.rows[0].marker, null);
    } finally {
      await pool.end();
      await rm(directory, { recursive: true, force: true });
    }
  });

  await t.test("pending 0004 and 0005 block startup before permissions, bootstrap, and listen", async () => {
    const databaseUrl = await postgres.createDatabase("pending_stacked_migrations");
    const baselineDirectory = await migrationDirectory({
      "0001_trusted_auth_rbac_operation_logs.sql": await readFile(resolve("database/migrations/0001_trusted_auth_rbac_operation_logs.sql"), "utf8"),
      "0002_sales_order_foundation.sql": await readFile(resolve("database/migrations/0002_sales_order_foundation.sql"), "utf8"),
      "0003_sales_order_number_sequence.sql": await readFile(resolve("database/migrations/0003_sales_order_number_sequence.sql"), "utf8"),
    });
    const stackedDirectory = await migrationDirectory({
      "0001_trusted_auth_rbac_operation_logs.sql": await readFile(resolve("database/migrations/0001_trusted_auth_rbac_operation_logs.sql"), "utf8"),
      "0002_sales_order_foundation.sql": await readFile(resolve("database/migrations/0002_sales_order_foundation.sql"), "utf8"),
      "0003_sales_order_number_sequence.sql": await readFile(resolve("database/migrations/0003_sales_order_number_sequence.sql"), "utf8"),
      "0004_pending_fixture.sql": "CREATE TABLE must_not_be_created_by_startup_0004(id INTEGER);",
      "0005_pending_fixture.sql": "CREATE TABLE must_not_be_created_by_startup_0005(id INTEGER);",
    });
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      await runMigrations(pool, baselineDirectory);
      const salesOrdersBefore = await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM sales_orders");
      const logsBefore = await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM operation_logs");
      const sequenceBefore = await pool.query<{ last_value: string; is_called: boolean }>("SELECT last_value::text, is_called FROM sales_order_number_seq");
      const calls: string[] = [];

      await assert.rejects(
        () => initializeServer({
          verifyMigrations: () => verifyMigrationsCurrent(pool, stackedDirectory),
          synchronizePermissions: async () => { calls.push("permissions"); },
          bootstrapAdmin: async () => { calls.push("bootstrap"); },
          listen: async () => { calls.push("listen"); },
        }),
        (error: unknown) => error instanceof PendingMigrationsError
          && error.pending.join(",") === "0004_pending_fixture.sql,0005_pending_fixture.sql",
      );

      assert.deepEqual(calls, []);
      await assert.rejects(
        () => execFileAsync(
          process.execPath,
          ["--import", "tsx", "server/index.ts"],
          {
            cwd: resolve("."),
            encoding: "utf8",
            timeout: 30_000,
            windowsHide: true,
            env: {
              ...process.env,
              NODE_ENV: "test",
              DATABASE_URL: databaseUrl,
              ZHIXU_MIGRATIONS_DIR: stackedDirectory,
              ZHIXU_SERVER_HOST: "127.0.0.1",
              ZHIXU_SERVER_PORT: "31999",
            },
          },
        ),
        (error: unknown) => {
          const result = error as { code?: number; stdout?: string; stderr?: string };
          assert.equal(result.code, 1);
          assert.doesNotMatch(result.stdout ?? "", /server_listening/);
          assert.match(result.stderr ?? "", /"event":"server_startup_failed"/);
          assert.match(result.stderr ?? "", /"code":"pending_migrations"/);
          assert.doesNotMatch(result.stderr ?? "", /postgresql:\/\//i);
          return true;
        },
      );
      const evidence = await pool.query<{
        marker_0004: string | null;
        marker_0005: string | null;
        sales_orders: number;
        operation_logs: number;
        last_value: string;
        is_called: boolean;
      }>(`SELECT
        to_regclass('public.must_not_be_created_by_startup_0004')::text AS marker_0004,
        to_regclass('public.must_not_be_created_by_startup_0005')::text AS marker_0005,
        (SELECT count(*)::int FROM sales_orders) AS sales_orders,
        (SELECT count(*)::int FROM operation_logs) AS operation_logs,
        (SELECT last_value::text FROM sales_order_number_seq) AS last_value,
        (SELECT is_called FROM sales_order_number_seq) AS is_called`);
      assert.equal(evidence.rows[0].marker_0004, null);
      assert.equal(evidence.rows[0].marker_0005, null);
      assert.equal(evidence.rows[0].sales_orders, salesOrdersBefore.rows[0].count);
      assert.equal(evidence.rows[0].operation_logs, logsBefore.rows[0].count);
      assert.equal(evidence.rows[0].last_value, sequenceBefore.rows[0].last_value);
      assert.equal(evidence.rows[0].is_called, sequenceBefore.rows[0].is_called);
    } finally {
      await pool.end();
      await Promise.all([
        rm(baselineDirectory, { recursive: true, force: true }),
        rm(stackedDirectory, { recursive: true, force: true }),
      ]);
    }
  });

  await t.test("actual Q1 0005 stays pending until explicit apply and has no 0004 dependency", async () => {
    const databaseUrl = await postgres.createDatabase("q1_0005_explicit_activation");
    const baselineFiles = {
      "0001_trusted_auth_rbac_operation_logs.sql": await readFile(resolve("database/migrations/0001_trusted_auth_rbac_operation_logs.sql"), "utf8"),
      "0002_sales_order_foundation.sql": await readFile(resolve("database/migrations/0002_sales_order_foundation.sql"), "utf8"),
      "0003_sales_order_number_sequence.sql": await readFile(resolve("database/migrations/0003_sales_order_number_sequence.sql"), "utf8"),
    };
    const baselineDirectory = await migrationDirectory(baselineFiles);
    const q1Directory = await migrationDirectory({
      ...baselineFiles,
      "0005_quote_foundation.sql": await readFile(resolve("database/migrations/0005_quote_foundation.sql"), "utf8"),
    });
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      await runMigrations(pool, baselineDirectory);
      assert.deepEqual(await inspectMigrationStatus(pool, q1Directory), {
        ledgerExists: true,
        applied: Object.keys(baselineFiles),
        pending: ["0005_quote_foundation.sql"],
        integrity: "valid",
      });

      const calls: string[] = [];
      await assert.rejects(
        () => initializeServer({
          verifyMigrations: () => verifyMigrationsCurrent(pool, q1Directory),
          synchronizePermissions: async () => { calls.push("permissions"); },
          bootstrapAdmin: async () => { calls.push("bootstrap"); },
          listen: async () => { calls.push("listen"); },
        }),
        (error: unknown) => error instanceof PendingMigrationsError
          && error.pending.join(",") === "0005_quote_foundation.sql",
      );
      assert.deepEqual(calls, []);
      const beforeApply = await pool.query<{ quote_tables: number; version_0005: number }>(
        `SELECT
           (SELECT count(*)::int FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name LIKE 'quote_center_%') AS quote_tables,
           (SELECT count(*)::int FROM schema_migrations WHERE version = 5) AS version_0005`,
      );
      assert.deepEqual(beforeApply.rows[0], { quote_tables: 0, version_0005: 0 });

      assert.deepEqual((await runMigrations(pool, q1Directory)).applied, ["0005_quote_foundation.sql"]);
      assert.deepEqual(await verifyMigrationsCurrent(pool, q1Directory), {
        ledgerExists: true,
        applied: [...Object.keys(baselineFiles), "0005_quote_foundation.sql"],
        pending: [],
        integrity: "valid",
      });
      const afterApply = await pool.query<{ quote_tables: number; version_0004: number; version_0005: number }>(
        `SELECT
           (SELECT count(*)::int FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name LIKE 'quote_center_%') AS quote_tables,
           (SELECT count(*)::int FROM schema_migrations WHERE version = 4) AS version_0004,
           (SELECT count(*)::int FROM schema_migrations WHERE version = 5) AS version_0005`,
      );
      assert.deepEqual(afterApply.rows[0], { quote_tables: 8, version_0004: 0, version_0005: 1 });
    } finally {
      await pool.end();
      await Promise.all([
        rm(baselineDirectory, { recursive: true, force: true }),
        rm(q1Directory, { recursive: true, force: true }),
      ]);
    }
  });

  await t.test("explicit migration command path applies pending migrations and startup then continues", async () => {
    const databaseUrl = await postgres.createDatabase("explicit_apply");
    const directory = await migrationDirectory({
      "0001_foundation.sql": "CREATE TABLE explicitly_applied(id INTEGER PRIMARY KEY);",
    });
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      await assert.rejects(() => verifyMigrationsCurrent(pool, directory), PendingMigrationsError);
      const migration = await runMigrations(pool, directory);
      assert.deepEqual(migration.applied, ["0001_foundation.sql"]);
      assert.deepEqual(await verifyMigrationsCurrent(pool, directory), {
        ledgerExists: true,
        applied: ["0001_foundation.sql"],
        pending: [],
        integrity: "valid",
      });

      const calls: string[] = [];
      await initializeServer({
        verifyMigrations: () => verifyMigrationsCurrent(pool, directory),
        synchronizePermissions: async () => { calls.push("permissions"); },
        bootstrapAdmin: async () => { calls.push("bootstrap"); },
        listen: async () => { calls.push("listen"); },
      });
      assert.deepEqual(calls, ["permissions", "bootstrap", "listen"]);
    } finally {
      await pool.end();
      await rm(directory, { recursive: true, force: true });
    }
  });

  await t.test("read-only verification preserves missing-file and checksum guards", async () => {
    const databaseUrl = await postgres.createDatabase("integrity_guards");
    const directory = await migrationDirectory({
      "0001_value.sql": "CREATE TABLE integrity_value(id INTEGER);",
    });
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      await runMigrations(pool, directory);
      await writeFile(join(directory, "0001_value.sql"), "CREATE TABLE changed_integrity_value(id INTEGER);", "utf8");
      await assert.rejects(() => inspectMigrationStatus(pool, directory), /checksum mismatch/i);
      await rm(join(directory, "0001_value.sql"));
      await assert.rejects(() => inspectMigrationStatus(pool, directory), /missing from the migration directory/i);
    } finally {
      await pool.end();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

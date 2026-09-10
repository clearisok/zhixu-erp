import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import pg from "pg";
import { createApp } from "../app.js";
import { runMigrations } from "../db/migration-runner.js";
import { startDisposablePostgres } from "./postgres-container.js";

const { Pool } = pg;

async function migrationDirectory(files: Record<string, string>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "zhixu-migrations-"));
  await Promise.all(Object.entries(files).map(([filename, contents]) =>
    writeFile(join(directory, filename), contents, "utf8")
  ));
  return directory;
}

test("PostgreSQL server foundation uses only a disposable PG16 container", async (t) => {
  const postgres = await startDisposablePostgres();
  t.after(async () => postgres.stop());

  await t.test("empty migration and rerun are ordered and idempotent", async () => {
    const databaseUrl = await postgres.createDatabase("empty_rerun");
    const directory = await migrationDirectory({
      "0002_second.sql": "INSERT INTO ordered_values(value) VALUES (2);",
      "0001_first.sql": "CREATE TABLE ordered_values(value INTEGER NOT NULL); INSERT INTO ordered_values(value) VALUES (1);",
    });
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const first = await runMigrations(pool, directory);
      assert.deepEqual(first.applied, ["0001_first.sql", "0002_second.sql"]);
      const second = await runMigrations(pool, directory);
      assert.deepEqual(second.applied, []);
      assert.deepEqual(second.skipped, ["0001_first.sql", "0002_second.sql"]);
      const values = await pool.query<{ value: number }>("SELECT value FROM ordered_values ORDER BY value");
      assert.deepEqual(values.rows.map((row) => row.value), [1, 2]);
      const ledger = await pool.query("SELECT version, filename, checksum, applied_at, duration_ms FROM schema_migrations ORDER BY version");
      assert.equal(ledger.rowCount, 2);
      assert.match(ledger.rows[0].checksum, /^[a-f0-9]{64}$/);
      assert.ok(ledger.rows[0].applied_at instanceof Date);
      assert.ok(ledger.rows[0].duration_ms >= 0);
    } finally {
      await pool.end();
      await rm(directory, { recursive: true, force: true });
    }
  });

  await t.test("checksum drift fails closed", async () => {
    const databaseUrl = await postgres.createDatabase("checksum");
    const directory = await migrationDirectory({ "0001_value.sql": "CREATE TABLE value_one(id INTEGER);" });
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      await runMigrations(pool, directory);
      await writeFile(join(directory, "0001_value.sql"), "CREATE TABLE changed_value(id INTEGER);", "utf8");
      await assert.rejects(() => runMigrations(pool, directory), /checksum mismatch/i);
    } finally {
      await pool.end();
      await rm(directory, { recursive: true, force: true });
    }
  });

  await t.test("a failed migration rolls back only its transaction", async () => {
    const databaseUrl = await postgres.createDatabase("rollback");
    const directory = await migrationDirectory({
      "0001_good.sql": "CREATE TABLE durable_value(id INTEGER);",
      "0002_bad.sql": "CREATE TABLE rolled_back_value(id INTEGER); SELECT definitely_invalid();",
    });
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      await assert.rejects(() => runMigrations(pool, directory), /0002_bad\.sql/);
      const durable = await pool.query("SELECT to_regclass('public.durable_value') AS name, to_regclass('public.rolled_back_value') AS rolled_back");
      assert.equal(durable.rows[0].name, "durable_value");
      assert.equal(durable.rows[0].rolled_back, null);
      const ledger = await pool.query("SELECT filename FROM schema_migrations ORDER BY version");
      assert.deepEqual(ledger.rows.map((row) => row.filename), ["0001_good.sql"]);
    } finally {
      await pool.end();
      await rm(directory, { recursive: true, force: true });
    }
  });

  await t.test("concurrent runners serialize and never double-apply", async () => {
    const databaseUrl = await postgres.createDatabase("concurrency");
    const directory = await migrationDirectory({
      "0001_once.sql": "CREATE TABLE apply_once(id INTEGER PRIMARY KEY); SELECT pg_sleep(0.25); INSERT INTO apply_once VALUES (1);",
    });
    const firstPool = new Pool({ connectionString: databaseUrl });
    const secondPool = new Pool({ connectionString: databaseUrl });
    try {
      await Promise.all([
        runMigrations(firstPool, directory),
        runMigrations(secondPool, directory),
      ]);
      const rows = await firstPool.query("SELECT count(*)::int AS count FROM apply_once");
      const ledger = await firstPool.query("SELECT count(*)::int AS count FROM schema_migrations WHERE version = 1");
      assert.equal(rows.rows[0].count, 1);
      assert.equal(ledger.rows[0].count, 1);
    } finally {
      await Promise.all([firstPool.end(), secondPool.end()]);
      await rm(directory, { recursive: true, force: true });
    }
  });

  await t.test("health reports ready and unavailable database states truthfully", async () => {
    const databaseUrl = await postgres.createDatabase("health");
    const pool = new Pool({ connectionString: databaseUrl });
    const events: Record<string, unknown>[] = [];
    const server = createServer(createApp({ pool, logger: { error: (event) => events.push(event) } }));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    try {
      const ready = await fetch(`http://127.0.0.1:${address.port}/api/v1/health`);
      assert.equal(ready.status, 200);
      assert.deepEqual(await ready.json(), { status: "ok", database: "ready" });
      await pool.end();
      const unavailable = await fetch(`http://127.0.0.1:${address.port}/api/v1/health`);
      assert.equal(unavailable.status, 503);
      const payload = await unavailable.json() as { error: { code: string; requestId: string } };
      assert.equal(payload.error.code, "database_unavailable");
      assert.ok(payload.error.requestId);
      assert.deepEqual(events.map((event) => event.event), ["database_healthcheck_failed"]);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      if (!pool.ended) await pool.end();
    }
  });
});

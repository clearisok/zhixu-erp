import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import pg from "pg";
import type { TrustedIdentity } from "../auth/session.js";
import { inspectMigrationStatus, PendingMigrationsError, runMigrations, verifyMigrationsCurrent } from "../db/migration-runner.js";
import { allocateQuoteCode, formatQuoteCode, shanghaiDate } from "../quotes/numbering.js";
import { createTrustedQuoteService } from "../quotes/service.js";
import { initializeServer } from "../startup.js";
import { startDisposablePostgres } from "./postgres-container.js";

const migrationNames = [
  "0001_trusted_auth_rbac_operation_logs.sql",
  "0002_sales_order_foundation.sql",
  "0003_sales_order_number_sequence.sql",
  "0004_confirmed_commercial_terms.sql",
  "0005_quote_foundation.sql",
  "0006_quote_number_sequence.sql",
] as const;

async function migrationDirectory(names: readonly string[]): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "zhixu-quote-numbering-"));
  await Promise.all(names.map(async (name) => {
    await writeFile(join(directory, name), await readFile(resolve("database/migrations", name), "utf8"), "utf8");
  }));
  return directory;
}

async function insertLegacyQuote(pool: pg.Pool, id: string, quoteCode: string): Promise<void> {
  await pool.query("BEGIN");
  try {
    await pool.query(
      "INSERT INTO quote_center_quotes(id,quote_code,default_revision_id,metadata) VALUES ($1,$2,$3,'{}'::jsonb)",
      [id, quoteCode, `${id}-revision`],
    );
    await pool.query(
      "INSERT INTO quote_center_revisions(quote_id,id,position,metadata) VALUES ($1,$2,0,'{}'::jsonb)",
      [id, `${id}-revision`],
    );
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

async function seedActor(pool: pg.Pool): Promise<TrustedIdentity> {
  const user = await pool.query<{ id: string; public_id: string }>(
    `INSERT INTO app_users(username,password_hash,display_name,role,active)
     VALUES ('numbering-actor',crypt('disposable-only',gen_salt('bf',4)),'Numbering Actor','viewer',true)
     RETURNING id::text,public_id::text`,
  );
  return {
    internalUserId: user.rows[0].id,
    userId: user.rows[0].public_id,
    username: "numbering-actor",
    userName: "Numbering Actor",
    permissions: ["quote.create"],
  };
}

test("Q2B2B Quote numbering uses disposable PostgreSQL only", { timeout: 240_000 }, async (t) => {
  const postgres = await startDisposablePostgres();
  const baselineDirectory = await migrationDirectory(migrationNames.slice(0, 5));
  const fullDirectory = await migrationDirectory(migrationNames);
  t.after(async () => {
    await Promise.all([
      rm(baselineDirectory, { recursive: true, force: true }),
      rm(fullDirectory, { recursive: true, force: true }),
    ]);
    await postgres.stop();
  });

  await t.test("formatting is global-width compatible and uses the Asia/Shanghai date", () => {
    const instant = new Date("2026-09-20T16:30:00.000Z");
    assert.equal(shanghaiDate(instant).isoDate, "2026-09-21");
    assert.equal(formatQuoteCode(instant, BigInt(1)), "QT-2026-0921-001");
    assert.equal(formatQuoteCode(instant, BigInt(9)), "QT-2026-0921-009");
    assert.equal(formatQuoteCode(instant, BigInt(99)), "QT-2026-0921-099");
    assert.equal(formatQuoteCode(instant, BigInt(999)), "QT-2026-0921-999");
    assert.equal(formatQuoteCode(instant, BigInt(1000)), "QT-2026-0921-1000");
  });

  await t.test("0006 calibrates to the largest valid global suffix and preserves unusual legacy codes", async () => {
    const pool = new pg.Pool({ connectionString: await postgres.createDatabase("quote_number_calibration") });
    try {
      await runMigrations(pool, baselineDirectory);
      await insertLegacyQuote(pool, "legacy-1", "QT-2026-0817-001");
      await insertLegacyQuote(pool, "legacy-9", "QT-2026-0818-009");
      await insertLegacyQuote(pool, "legacy-1000", "QT-2026-0901-1000");
      await insertLegacyQuote(pool, "legacy-unusual", "LEGACY-CUSTOM-CODE");
      assert.deepEqual((await runMigrations(pool, fullDirectory)).applied, ["0006_quote_number_sequence.sql"]);
      assert.deepEqual(
        (await pool.query("SELECT last_value::text,is_called FROM quote_center_quote_number_seq")).rows[0],
        { last_value: "1001", is_called: false },
      );
      const client = await pool.connect();
      try {
        assert.equal(await allocateQuoteCode(client, new Date("2026-09-20T16:30:00.000Z")), "QT-2026-0921-1001");
      } finally {
        client.release();
      }
      assert.deepEqual(
        (await pool.query("SELECT quote_code FROM quote_center_quotes ORDER BY id")).rows.map((row) => row.quote_code),
        ["QT-2026-0817-001", "QT-2026-0901-1000", "QT-2026-0818-009", "LEGACY-CUSTOM-CODE"],
      );
      await assert.rejects(
        () => insertLegacyQuote(pool, "duplicate-after-0006", "LEGACY-CUSTOM-CODE"),
        (error: unknown) => (error as { code?: string }).code === "23505",
      );
      await assert.rejects(
        () => pool.query("UPDATE quote_center_quotes SET quote_code='changed' WHERE id='legacy-unusual'"),
        (error: unknown) => (error as { constraint?: string }).constraint === "quote_center_quote_code_immutable",
      );
    } finally {
      await pool.end();
    }
  });

  await t.test("duplicate legacy quoteCode makes 0006 fail closed without changing data or ledger", async () => {
    const pool = new pg.Pool({ connectionString: await postgres.createDatabase("quote_number_duplicates") });
    try {
      await runMigrations(pool, baselineDirectory);
      await insertLegacyQuote(pool, "duplicate-a", "QT-2026-0817-001");
      await insertLegacyQuote(pool, "duplicate-b", "QT-2026-0817-001");
      await assert.rejects(
        () => runMigrations(pool, fullDirectory),
        (error: unknown) => (error as { cause?: { code?: string } }).cause?.code === "23505",
      );
      assert.equal((await pool.query("SELECT count(*)::int AS count FROM schema_migrations WHERE version=6")).rows[0].count, 0);
      assert.equal((await pool.query("SELECT to_regclass('public.quote_center_quote_number_seq')::text AS name")).rows[0].name, null);
      assert.equal((await pool.query("SELECT count(*)::int AS count FROM quote_center_quotes WHERE quote_code='QT-2026-0817-001'")).rows[0].count, 2);
    } finally {
      await pool.end();
    }
  });

  await t.test("pending 0006 blocks startup before schema, permission, bootstrap or listen writes", async () => {
    const pool = new pg.Pool({ connectionString: await postgres.createDatabase("quote_number_pending") });
    try {
      await runMigrations(pool, baselineDirectory);
      assert.deepEqual((await inspectMigrationStatus(pool, fullDirectory)).pending, ["0006_quote_number_sequence.sql"]);
      const calls: string[] = [];
      await assert.rejects(
        () => initializeServer({
          verifyMigrations: () => verifyMigrationsCurrent(pool, fullDirectory),
          synchronizePermissions: async () => { calls.push("permissions"); },
          bootstrapAdmin: async () => { calls.push("bootstrap"); },
          listen: async () => { calls.push("listen"); },
        }),
        (error: unknown) => error instanceof PendingMigrationsError && error.pending[0] === "0006_quote_number_sequence.sql",
      );
      assert.deepEqual(calls, []);
      assert.equal((await pool.query("SELECT to_regclass('public.quote_center_quote_number_seq')::text AS name")).rows[0].name, null);
      assert.equal((await pool.query("SELECT count(*)::int AS count FROM schema_migrations WHERE version=6")).rows[0].count, 0);
      assert.deepEqual((await runMigrations(pool, fullDirectory)).applied, ["0006_quote_number_sequence.sql"]);
      assert.deepEqual((await runMigrations(pool, fullDirectory)).skipped, [...migrationNames]);
      assert.equal((await inspectMigrationStatus(pool, fullDirectory)).integrity, "valid");
    } finally {
      await pool.end();
    }
  });

  await t.test("allocator skips an occupied candidate without changing it", async () => {
    const pool = new pg.Pool({ connectionString: await postgres.createDatabase("quote_number_collision") });
    try {
      await runMigrations(pool, fullDirectory);
      await insertLegacyQuote(pool, "occupied-nine", "QT-2026-0921-009");
      await pool.query("SELECT setval('quote_center_quote_number_seq',9,false)");
      const client = await pool.connect();
      try {
        assert.equal(await allocateQuoteCode(client, new Date("2026-09-20T16:30:00.000Z")), "QT-2026-0921-010");
        assert.equal(await allocateQuoteCode(client, new Date("2026-09-21T16:30:00.000Z")), "QT-2026-0922-011");
      } finally {
        client.release();
      }
      assert.equal((await pool.query("SELECT quote_code FROM quote_center_quotes WHERE id='occupied-nine'")).rows[0].quote_code, "QT-2026-0921-009");
    } finally {
      await pool.end();
    }
  });

  await t.test("concurrent runtime creates are unique and failed audit leaves a permanent sequence gap", async () => {
    const pool = new pg.Pool({ connectionString: await postgres.createDatabase("quote_number_concurrency"), max: 20 });
    try {
      const firstRun = await runMigrations(pool, fullDirectory);
      assert.deepEqual(firstRun.applied, [...migrationNames]);
      assert.deepEqual((await runMigrations(pool, fullDirectory)).skipped, [...migrationNames]);
      const actor = await seedActor(pool);
      const fixedDate = new Date("2026-09-20T16:30:00.000Z");
      const service = createTrustedQuoteService(pool, { now: () => fixedDate });
      const records = await Promise.all(Array.from({ length: 12 }, () => service.createRuntimeDraft(actor)));
      assert.equal(new Set(records.map((record) => record.quote.id)).size, 12);
      assert.equal(new Set(records.map((record) => record.quote.quoteCode)).size, 12);
      assert.equal(new Set(records.map((record) => record.quote.quoteCode.split("-").at(-1))).size, 12);
      assert.ok(records.every((record) => record.version === 1));
      assert.ok(records.every((record) => record.quote.revisions[0].baseInfo.quoteDate === "2026-09-21"));
      assert.ok(records.every((record) => record.quote.revisions[0].createdAt === fixedDate.toISOString()));
      assert.equal((await pool.query("SELECT count(*)::int AS count FROM operation_logs WHERE entity_type='Quote' AND action='创建报价'")).rows[0].count, 12);

      const beforeFailedValue = BigInt((await pool.query("SELECT last_value::text AS value FROM quote_center_quote_number_seq")).rows[0].value);
      await pool.query(`CREATE FUNCTION reject_numbering_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_type='Quote' AND NEW.action='创建报价' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER reject_numbering_audit BEFORE INSERT ON operation_logs FOR EACH ROW EXECUTE FUNCTION reject_numbering_audit();`);
      await assert.rejects(() => service.createRuntimeDraft(actor));
      const failedValue = BigInt((await pool.query("SELECT last_value::text AS value FROM quote_center_quote_number_seq")).rows[0].value);
      assert.ok(failedValue > beforeFailedValue);
      assert.equal((await pool.query("SELECT count(*)::int AS count FROM quote_center_quotes")).rows[0].count, 12);
      await pool.query("DROP TRIGGER reject_numbering_audit ON operation_logs; DROP FUNCTION reject_numbering_audit();");
      const afterFailure = await service.createRuntimeDraft(actor);
      const nextValue = BigInt(afterFailure.quote.quoteCode.split("-").at(-1)!);
      assert.ok(nextValue > failedValue);
      assert.equal((await pool.query("SELECT count(*)::int AS count FROM confirmed_commercial_terms")).rows[0].count, 0);
      assert.equal((await pool.query("SELECT count(*)::int AS count FROM sales_orders")).rows[0].count, 0);
    } finally {
      await pool.end();
    }
  });
});

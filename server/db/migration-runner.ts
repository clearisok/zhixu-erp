import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Pool, PoolClient } from "pg";

const MIGRATION_FILE_PATTERN = /^(\d{4,})_([a-z0-9][a-z0-9_-]*)\.sql$/;
const MIGRATION_LOCK_ID = "873215970214";

export type MigrationFile = {
  version: string;
  filename: string;
  checksum: string;
  sql: string;
};

export type MigrationRunResult = {
  applied: string[];
  skipped: string[];
};

type AppliedMigration = {
  version: string;
  filename: string;
  checksum: string;
};

function checksumFor(contents: string): string {
  return createHash("sha256").update(contents, "utf8").digest("hex");
}

export async function discoverMigrations(directory: string): Promise<MigrationFile[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const migrations: MigrationFile[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".sql")) continue;
    const match = MIGRATION_FILE_PATTERN.exec(entry.name);
    if (!match) throw new Error(`Invalid migration filename: ${entry.name}`);
    const sql = await readFile(resolve(directory, entry.name), "utf8");
    migrations.push({
      version: BigInt(match[1]).toString(),
      filename: entry.name,
      checksum: checksumFor(sql),
      sql,
    });
  }

  migrations.sort((left, right) => {
    const leftVersion = BigInt(left.version);
    const rightVersion = BigInt(right.version);
    return leftVersion < rightVersion ? -1 : leftVersion > rightVersion ? 1 : 0;
  });

  const versions = new Set<string>();
  for (const migration of migrations) {
    if (versions.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`);
    }
    versions.add(migration.version);
  }
  return migrations;
}

async function ensureLedger(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version BIGINT PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0)
    )
  `);
}

async function readAppliedMigrations(client: PoolClient): Promise<AppliedMigration[]> {
  const result = await client.query<AppliedMigration>(
    "SELECT version::text AS version, filename, checksum FROM schema_migrations ORDER BY version",
  );
  return result.rows;
}

function verifyAppliedMigrations(
  migrations: MigrationFile[],
  appliedMigrations: AppliedMigration[],
): Set<string> {
  const byVersion = new Map(migrations.map((migration) => [migration.version, migration]));
  const appliedVersions = new Set<string>();
  for (const applied of appliedMigrations) {
    const migration = byVersion.get(applied.version);
    if (!migration) {
      throw new Error(
        `Applied migration ${applied.version} (${applied.filename}) is missing from the migration directory`,
      );
    }
    if (migration.filename !== applied.filename || migration.checksum !== applied.checksum) {
      throw new Error(`Migration checksum mismatch: ${applied.filename}`);
    }
    appliedVersions.add(applied.version);
  }
  return appliedVersions;
}

export async function runMigrations(
  pool: Pool,
  migrationsDirectory: string,
): Promise<MigrationRunResult> {
  const migrations = await discoverMigrations(migrationsDirectory);
  const client = await pool.connect();
  const result: MigrationRunResult = { applied: [], skipped: [] };

  try {
    await client.query("SELECT pg_advisory_lock($1::bigint)", [MIGRATION_LOCK_ID]);
    await ensureLedger(client);
    const appliedVersions = verifyAppliedMigrations(
      migrations,
      await readAppliedMigrations(client),
    );

    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) {
        result.skipped.push(migration.filename);
        continue;
      }

      const startedAt = performance.now();
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
        await client.query(
          `INSERT INTO schema_migrations(version, filename, checksum, duration_ms)
           VALUES ($1::bigint, $2, $3, $4)`,
          [migration.version, migration.filename, migration.checksum, durationMs],
        );
        await client.query("COMMIT");
        result.applied.push(migration.filename);
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migration failed: ${migration.filename}`, { cause: error });
      }
    }
    return result;
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1::bigint)", [MIGRATION_LOCK_ID]);
    } finally {
      client.release();
    }
  }
}

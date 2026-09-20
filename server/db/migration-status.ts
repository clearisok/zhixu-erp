import { loadServerConfig } from "../config.js";
import { closeDatabasePool, createDatabasePool } from "./pool.js";
import { inspectMigrationStatus } from "./migration-runner.js";

const config = loadServerConfig();
const pool = createDatabasePool({
  connectionString: config.databaseUrl,
  max: config.databasePoolMax,
});

try {
  const status = await inspectMigrationStatus(pool, config.migrationsDirectory);
  process.stdout.write(`${JSON.stringify({
    event: "migration_status",
    ...status,
    current: status.ledgerExists && status.pending.length === 0,
  })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    event: "migration_status_failed",
    errorClass: error instanceof Error ? error.name : "UnknownError",
    message: "Migration status verification failed.",
  })}\n`);
  process.exitCode = 1;
} finally {
  await closeDatabasePool(pool);
}

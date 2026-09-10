import { loadServerConfig } from "../config.js";
import { closeDatabasePool, createDatabasePool } from "./pool.js";
import { runMigrations } from "./migration-runner.js";

const config = loadServerConfig();
const pool = createDatabasePool({
  connectionString: config.databaseUrl,
  max: config.databasePoolMax,
  applicationName: "zhixu-migrations",
});

try {
  const result = await runMigrations(pool, config.migrationsDirectory);
  process.stdout.write(`${JSON.stringify({ event: "migrations_complete", ...result })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    event: "migrations_failed",
    message: error instanceof Error ? error.message : "Unknown migration failure",
  })}\n`);
  process.exitCode = 1;
} finally {
  await closeDatabasePool(pool);
}

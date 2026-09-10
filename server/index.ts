import { createServer } from "node:http";
import { createApp } from "./app.js";
import { bootstrapAdmin } from "./auth/bootstrap.js";
import { synchronizePermissionCatalog } from "./auth/permissions.js";
import { loadServerConfig } from "./config.js";
import { closeDatabasePool, createDatabasePool } from "./db/pool.js";
import { runMigrations } from "./db/migration-runner.js";

const config = loadServerConfig();
const pool = createDatabasePool({
  connectionString: config.databaseUrl,
  max: config.databasePoolMax,
});

await runMigrations(pool, config.migrationsDirectory);
await synchronizePermissionCatalog(pool);
await bootstrapAdmin(pool, config.bootstrapAdmin);

const server = createServer(createApp({
  pool,
  allowedOrigins: config.allowedOrigins,
  security: {
    secureCookies: config.secureCookies,
    sessionTtlSeconds: config.sessionTtlSeconds,
  },
  staticDirectory: config.staticDirectory,
}));
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write(`${JSON.stringify({ event: "server_shutdown", signal })}\n`);
  server.close(async () => {
    await closeDatabasePool(pool);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

server.listen(config.port, config.host, () => {
  process.stdout.write(`${JSON.stringify({
    event: "server_listening",
    environment: config.environment,
    host: config.host,
    port: config.port,
  })}\n`);
});

import { createServer } from "node:http";
import { createApp } from "./app.js";
import { bootstrapAdmin } from "./auth/bootstrap.js";
import { synchronizePermissionCatalog } from "./auth/permissions.js";
import { loadServerConfig } from "./config.js";
import { closeDatabasePool, createDatabasePool } from "./db/pool.js";
import { PendingMigrationsError, verifyMigrationsCurrent } from "./db/migration-runner.js";
import { initializeServer } from "./startup.js";

const config = loadServerConfig();
const pool = createDatabasePool({
  connectionString: config.databaseUrl,
  max: config.databasePoolMax,
});

let server: ReturnType<typeof createServer> | null = null;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write(`${JSON.stringify({ event: "server_shutdown", signal })}\n`);
  if (!server) {
    await closeDatabasePool(pool);
    process.exit(0);
  }
  server.close(async () => {
    await closeDatabasePool(pool);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

try {
  await initializeServer({
    verifyMigrations: () => verifyMigrationsCurrent(pool, config.migrationsDirectory),
    synchronizePermissions: () => synchronizePermissionCatalog(pool),
    bootstrapAdmin: () => bootstrapAdmin(pool, config.bootstrapAdmin),
    listen: async () => {
      server = createServer(createApp({
        pool,
        allowedOrigins: config.allowedOrigins,
        security: {
          secureCookies: config.secureCookies,
          sessionTtlSeconds: config.sessionTtlSeconds,
        },
        staticDirectory: config.staticDirectory,
      }));
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => reject(error);
        server?.once("error", onError);
        server?.listen(config.port, config.host, () => {
          server?.off("error", onError);
          process.stdout.write(`${JSON.stringify({
            event: "server_listening",
            environment: config.environment,
            host: config.host,
            port: config.port,
          })}\n`);
          resolve();
        });
      });
    },
  });
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    event: "server_startup_failed",
    errorClass: error instanceof Error ? error.name : "UnknownError",
    code: error instanceof PendingMigrationsError ? error.code : "startup_preflight_failed",
    message: error instanceof PendingMigrationsError
      ? error.message
      : "Server startup preflight failed. Review server logs and database migration state.",
  })}\n`);
  await closeDatabasePool(pool);
  process.exitCode = 1;
}

if (server) {
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

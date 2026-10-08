import { createServer } from "node:http";
import { createApp } from "./app.js";
import { S3AttachmentStorage } from "./attachments/s3-storage.js";
import { assertRuntimeBuildIdentity } from "./build-identity.js";
import { bootstrapAdmin } from "./auth/bootstrap.js";
import { createIdentityAuthority } from "./auth/identity-authority.js";
import { synchronizePermissionCatalog } from "./auth/permissions.js";
import { loadServerConfig, type ServerConfig } from "./config.js";
import { StorageConfigLoadError } from "./attachments/storage-config-loader.js";
import { closeDatabasePool, createDatabasePool } from "./db/pool.js";
import { PendingMigrationsError, verifyMigrationsCurrent } from "./db/migration-runner.js";
import { initializeServer } from "./startup.js";

if (process.env.NODE_ENV === "production") await assertRuntimeBuildIdentity(process.env.ZHIXU_STATIC_DIR?.trim() || "dist/client");
let config: ServerConfig;
try { config = loadServerConfig(); }
catch (error) {
  process.stderr.write(`${JSON.stringify({ event: "server_config_failed",
    code: error instanceof StorageConfigLoadError ? error.code : "SERVER_CONFIG_INVALID",
    field: error instanceof StorageConfigLoadError ? error.field : "serverConfig" })}\n`);
  process.exit(1); // before S3 construction, pool, permissions/bootstrap and listen
}
const attachmentStorage = config.attachmentStorage.kind === "s3" ? new S3AttachmentStorage(config.attachmentStorage) : undefined;
const pool = createDatabasePool({
  connectionString: config.databaseUrl,
  max: config.databasePoolMax,
});
const identityAuthority = createIdentityAuthority(pool, config.identityMode);

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
    synchronizePermissions: () => config.identityMode === "session" ? synchronizePermissionCatalog(pool) : Promise.resolve(),
    bootstrapAdmin: () => config.identityMode === "session" ? bootstrapAdmin(pool, config.bootstrapAdmin) : identityAuthority.verify(),
    listen: async () => {
      server = createServer(createApp({
        pool,
        allowedOrigins: config.allowedOrigins,
        security: {
          secureCookies: config.secureCookies,
          sessionTtlSeconds: config.sessionTtlSeconds,
        },
        staticDirectory: config.staticDirectory,
        identityAuthority,
        attachmentStorage,
      }));
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => reject(error);
        server?.once("error", onError);
        server?.listen(config.port, config.host, () => {
          server?.off("error", onError);
          process.stdout.write(`${JSON.stringify({
            event: "server_listening",
            environment: config.environment,
            identityMode: config.identityMode,
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

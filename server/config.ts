import { resolve } from "node:path";
import type { IdentityMode } from "./auth/identity-authority.js";
import { parseAttachmentStorageConfig, type AttachmentStorageConfig } from "./attachments/storage-config.js";
export type { AttachmentStorageConfig } from "./attachments/storage-config.js";

export type ServerEnvironment = "development" | "test" | "production";

export type ServerConfig = {
  environment: ServerEnvironment;
  identityMode: IdentityMode;
  host: string;
  port: number;
  databaseUrl: string;
  databasePoolMax: number;
  migrationsDirectory: string;
  staticDirectory: string;
  allowedOrigins: readonly string[];
  secureCookies: boolean;
  sessionTtlSeconds: number;
  bootstrapAdmin: {
    username: string;
    displayName: string;
    password?: string;
  };
  attachmentStorage: AttachmentStorageConfig;
};

function parseInteger(value: string | undefined, fallback: number, label: string): number {
  const parsed = value === undefined ? fallback : Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function parseEnvironment(value: string | undefined): ServerEnvironment {
  if (value === undefined || value === "development") return "development";
  if (value === "test" || value === "production") return value;
  throw new Error("NODE_ENV must be development, test, or production");
}

function parseBoolean(value: string | undefined, fallback: boolean, label: string): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${label} must be true or false`);
}

function parseIdentityMode(values: NodeJS.ProcessEnv, origins: readonly string[]): IdentityMode {
  const mode = values.ZHIXU_IDENTITY_MODE?.trim() || "session";
  if (mode === "session") return mode;
  if (mode !== "local-single-user") throw new Error("ZHIXU_IDENTITY_MODE must be session or local-single-user");
  if (values.ZHIXU_LOCAL_SINGLE_USER_ACK !== "I_UNDERSTAND_NO_AUTH") {
    throw new Error("Local single-user mode requires explicit no-auth acknowledgement");
  }
  if (origins.some((origin) => !["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname))) {
    throw new Error("Local single-user mode allows only loopback Browser origins");
  }
  return mode;
}

function parseOrigins(environment: ServerEnvironment, value: string | undefined): readonly string[] {
  const origins = (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => new URL(origin).origin);
  const resolved = origins.length > 0
    ? [...new Set(origins)]
    : environment === "production"
      ? []
      : ["http://127.0.0.1:3001", "http://localhost:3001"];
  if (environment === "production" && resolved.length === 0) {
    throw new Error("ZHIXU_ALLOWED_ORIGINS is required in production");
  }
  return resolved;
}

function databaseUrlFromEnvironment(
  environment: ServerEnvironment,
  values: NodeJS.ProcessEnv,
): string {
  if (values.DATABASE_URL?.trim()) return values.DATABASE_URL.trim();

  const host = values.DB_HOST?.trim() || (environment === "production" ? "" : "127.0.0.1");
  const port = values.DB_PORT?.trim() || (environment === "production" ? "" : "5432");
  const database = values.DB_NAME?.trim() || (environment === "production" ? "" : "zhixu");
  const user = values.DB_USER?.trim() || (environment === "production" ? "" : "zhixu");
  const password = values.DB_PASSWORD;

  if (!host || !port || !database || !user || !password) {
    throw new Error(
      "Database configuration is incomplete; set DATABASE_URL or DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD",
    );
  }

  const url = new URL("postgresql://localhost");
  url.hostname = host;
  url.port = port;
  url.username = user;
  url.password = password;
  url.pathname = `/${database}`;
  return url.toString();
}

export function loadServerConfig(values: NodeJS.ProcessEnv = process.env): ServerConfig {
  const environment = parseEnvironment(values.NODE_ENV);
  const allowedOrigins = parseOrigins(environment, values.ZHIXU_ALLOWED_ORIGINS);
  const identityMode = parseIdentityMode(values, allowedOrigins);
  const secureCookies = parseBoolean(values.ZHIXU_COOKIE_SECURE, environment === "production", "ZHIXU_COOKIE_SECURE");
  if (environment === "production" && !secureCookies) {
    throw new Error("ZHIXU_COOKIE_SECURE cannot be disabled in production");
  }
  return {
    environment,
    identityMode,
    host: values.ZHIXU_SERVER_HOST?.trim() || "127.0.0.1",
    port: parseInteger(values.ZHIXU_SERVER_PORT, 3100, "ZHIXU_SERVER_PORT"),
    databaseUrl: databaseUrlFromEnvironment(environment, values),
    databasePoolMax: parseInteger(values.DB_POOL_MAX, 10, "DB_POOL_MAX"),
    migrationsDirectory: resolve(values.ZHIXU_MIGRATIONS_DIR?.trim() || "database/migrations"),
    staticDirectory: resolve(values.ZHIXU_STATIC_DIR?.trim() || "dist/client"),
    allowedOrigins,
    secureCookies,
    sessionTtlSeconds: parseInteger(values.ZHIXU_SESSION_TTL_SECONDS, 43_200, "ZHIXU_SESSION_TTL_SECONDS"),
    bootstrapAdmin: {
      username: values.ZHIXU_ADMIN_USERNAME?.trim().toLowerCase() || "admin",
      displayName: values.ZHIXU_ADMIN_DISPLAY_NAME?.trim() || "系统管理员",
      password: values.ZHIXU_ADMIN_PASSWORD || undefined,
    },
    attachmentStorage: parseAttachmentStorageConfig(environment, values),
  };
}

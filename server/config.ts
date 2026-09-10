import { resolve } from "node:path";

export type ServerEnvironment = "development" | "test" | "production";

export type ServerConfig = {
  environment: ServerEnvironment;
  host: string;
  port: number;
  databaseUrl: string;
  databasePoolMax: number;
  migrationsDirectory: string;
  staticDirectory: string;
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
  return {
    environment,
    host: values.ZHIXU_SERVER_HOST?.trim() || "127.0.0.1",
    port: parseInteger(values.ZHIXU_SERVER_PORT, 3100, "ZHIXU_SERVER_PORT"),
    databaseUrl: databaseUrlFromEnvironment(environment, values),
    databasePoolMax: parseInteger(values.DB_POOL_MAX, 10, "DB_POOL_MAX"),
    migrationsDirectory: resolve(values.ZHIXU_MIGRATIONS_DIR?.trim() || "database/migrations"),
    staticDirectory: resolve(values.ZHIXU_STATIC_DIR?.trim() || "dist/client"),
  };
}

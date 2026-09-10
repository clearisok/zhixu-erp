import pg from "pg";

const { Pool } = pg;

export type DatabasePool = pg.Pool;

export type DatabasePoolOptions = {
  connectionString: string;
  max?: number;
  applicationName?: string;
};

export function createDatabasePool(options: DatabasePoolOptions): DatabasePool {
  return new Pool({
    connectionString: options.connectionString,
    max: options.max ?? 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: options.applicationName ?? "zhixu-server",
  });
}

export async function closeDatabasePool(pool: DatabasePool): Promise<void> {
  await pool.end();
}

import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";

const execFileAsync = promisify(execFile);
const { Pool } = pg;

export type DisposablePostgres = {
  containerName: string;
  adminUrl: string;
  createDatabase(label: string): Promise<string>;
  stop(): Promise<void>;
};

async function docker(arguments_: string[]): Promise<string> {
  const { stdout } = await execFileAsync("docker", arguments_, {
    encoding: "utf8",
    timeout: 120_000,
    windowsHide: true,
  });
  return stdout.trim();
}

async function waitForReady(containerName: string, adminUrl: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const pool = new Pool({ connectionString: adminUrl, max: 1, connectionTimeoutMillis: 1_000 });
    try {
      await docker(["exec", containerName, "pg_isready", "-U", "postgres", "-d", "postgres"]);
      await pool.query("SELECT 1");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    } finally {
      await pool.end().catch(() => undefined);
    }
  }
  throw new Error("Disposable PostgreSQL container did not become ready");
}

export async function startDisposablePostgres(): Promise<DisposablePostgres> {
  const suffix = randomBytes(6).toString("hex");
  const containerName = `zhixu-pg-it-${suffix}`;
  const password = `test-${suffix}`;
  let started = false;

  try {
    await docker([
      "run", "--rm", "--detach",
      "--name", containerName,
      "--env", `POSTGRES_PASSWORD=${password}`,
      "--env", "POSTGRES_DB=postgres",
      "--tmpfs", "/var/lib/postgresql/data",
      "--publish", "127.0.0.1::5432",
      "postgres:16-alpine",
    ]);
    started = true;
    const portOutput = await docker(["port", containerName, "5432/tcp"]);
    const port = portOutput.match(/:(\d+)$/)?.[1];
    if (!port) throw new Error(`Could not determine disposable PostgreSQL port: ${portOutput}`);
    const adminUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
    await waitForReady(containerName, adminUrl);

    return {
      containerName,
      adminUrl,
      async createDatabase(label) {
        const databaseName = `zhixu_it_${label.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_${randomBytes(4).toString("hex")}`;
        const pool = new Pool({ connectionString: adminUrl, max: 1 });
        try {
          await pool.query(`CREATE DATABASE "${databaseName}"`);
        } finally {
          await pool.end();
        }
        return `${adminUrl.slice(0, adminUrl.lastIndexOf("/") + 1)}${databaseName}`;
      },
      async stop() {
        await docker(["rm", "--force", containerName]);
      },
    };
  } catch (error) {
    if (started) {
      await docker(["rm", "--force", containerName]).catch(() => undefined);
    }
    throw error;
  }
}

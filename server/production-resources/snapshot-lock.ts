import type { PoolClient } from "pg";

/** Master writes are rare; freeze readers can coexist. Acquire after fresh actor
 * and request locks, before taking any resource row lock. No schema or grant. */
export async function lockProductionResourceScope(client: PoolClient, mode: "write" | "freeze"): Promise<void> {
  const fn = mode === "write" ? "pg_advisory_xact_lock" : "pg_advisory_xact_lock_shared";
  await client.query(`SELECT ${fn}(hashtextextended('production-resource-snapshot-v1',0))`);
}

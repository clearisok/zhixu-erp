import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** Historical one-off bootstrap/RBAC runners on this branch are deliberately
 * frozen at their reviewed 0001-4 contract. Their rehearsal must not silently
 * authorize the later Q1 0005 domain migration. */
export async function frozenFoundationMigrations() {
  const directory = await mkdtemp(join(tmpdir(), "zhixu-frozen-foundation-"));
  try {
    for (const name of [
      "0001_trusted_auth_rbac_operation_logs.sql",
      "0002_sales_order_foundation.sql",
      "0003_sales_order_number_sequence.sql",
      "0004_confirmed_commercial_terms.sql",
    ]) {
      await writeFile(join(directory, name), await readFile(resolve("database/migrations", name)));
    }
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
  return { directory, dispose: () => rm(directory, { recursive: true, force: true }) };
}

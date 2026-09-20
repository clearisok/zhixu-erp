import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** Historical one-off bootstrap/RBAC runners are deliberately frozen at 0001-3.
 * Their rehearsal must not silently authorize later domain migrations. */
export async function frozenFoundationMigrations() {
  const directory = await mkdtemp(join(tmpdir(), "zhixu-frozen-foundation-"));
  try {
    for (const name of ["0001_trusted_auth_rbac_operation_logs.sql", "0002_sales_order_foundation.sql", "0003_sales_order_number_sequence.sql"]) {
      await writeFile(join(directory, name), await readFile(resolve("database/migrations", name)));
    }
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
  return { directory, dispose: () => rm(directory, { recursive: true, force: true }) };
}

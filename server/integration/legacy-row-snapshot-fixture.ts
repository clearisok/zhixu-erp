import type { Pool } from "pg";

const identifier = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/iu.test(name)) throw new Error("snapshot_identifier_invalid");
  return `"${name}"`;
};

/** Freeze the actual pre-upgrade column set, independently of migration code.
 * New columns belong to their own schema assertions; every original value,
 * duplicate row and missing/renamed original column remains observable. */
export async function freezeExistingPublicRows(pool: Pool, tables: readonly string[]) {
  const frozen = await Promise.all(tables.map(async table => {
    identifier(table);
    const columns = (await pool.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [table],
    )).rows.map(row => identifier(row.column_name));
    if (!columns.length) throw new Error("snapshot_table_missing");
    return { table, selection: columns.join(",") };
  }));
  return () => Promise.all(frozen.map(async ({ table, selection }) => ({
    table,
    rows: (await pool.query<{ payload: string }>(`SELECT to_jsonb(r)::text AS payload FROM (SELECT ${selection} FROM public.${identifier(table)}) r ORDER BY payload`)).rows,
  })));
}

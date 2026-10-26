import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { HttpError } from "../http/errors.js";
import { effectiveOrderJoins, sourceOwnerSql } from "./effective-order-sql.js";
import { supportsEffectiveAttribution } from "./effective-attribution.js";

type Queryable = Pick<Pool | PoolClient, "query">;
export const orderColorBusinessKey = (value: string) => value.normalize("NFC").trim().replace(/\s+/gu, " ").toLowerCase();
export function stableOrderColorId(orderId: string, key: string): string {
  const value = createHash("sha256").update(orderId.toLowerCase() + "\0" + key).digest("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-5${value.slice(13, 16)}-a${value.slice(17, 20)}-${value.slice(20, 32)}`;
}
/** Non-commercial identity projection. Quantity and source row hashes are evidence,
 * never identity. Current effective ownership does not rewrite historical mirrors. */
export async function readStableOrderColors(client: Queryable, orderId: string) {
  const attributed = await supportsEffectiveAttribution(client);
  const rows = (await client.query<{ sourceLineIdentity: string; colorName: string; quantity: string }>(`SELECT mirror.source_line_identity AS "sourceLineIdentity",mirror.color_name AS "colorName",mirror.quantity::text
    FROM sales_orders so ${effectiveOrderJoins(attributed)} JOIN ainuoke_sales_order_color_mirrors mirror ON mirror.sales_order_id=${sourceOwnerSql(attributed)}
    WHERE so.id=$1 ORDER BY mirror.color_name,mirror.source_line_identity`, [orderId])).rows;
  const counts = new Map<string, number>();
  for (const row of rows) { const key = orderColorBusinessKey(row.colorName); counts.set(key, (counts.get(key) ?? 0) + 1); }
  return rows.map(row => { const businessKey = orderColorBusinessKey(row.colorName); return { ...row, businessKey, id: stableOrderColorId(orderId, businessKey), ambiguous: counts.get(businessKey) !== 1 }; });
}
export async function ensureStableOrderColor(client: PoolClient, orderId: string, color: Awaited<ReturnType<typeof readStableOrderColors>>[number]) {
  if (color.ambiguous) throw new HttpError(409, "order_color_identity_ambiguous", "Order color needs confirmation");
  await client.query(`INSERT INTO sales_order_color_identities(id,sales_order_id,business_key,color_name) VALUES($1,$2,$3,$4)
    ON CONFLICT(sales_order_id,business_key) DO NOTHING`, [color.id, orderId, color.businessKey, color.colorName]);
  const row = (await client.query<{ id: string }>("SELECT id::text FROM sales_order_color_identities WHERE sales_order_id=$1 AND business_key=$2", [orderId, color.businessKey])).rows[0];
  if (row?.id !== color.id) throw new HttpError(409, "order_color_identity_conflict", "Order color identity conflicts with historical evidence");
}

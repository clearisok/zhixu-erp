import type { PoolClient } from "pg";

export const QUOTE_NUMBER_TIME_ZONE = "Asia/Shanghai";

export type ShanghaiDate = {
  year: string;
  month: string;
  day: string;
  isoDate: string;
};

export function shanghaiDate(instant: Date): ShanghaiDate {
  if (!Number.isFinite(instant.getTime())) throw new Error("Invalid Server creation instant");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: QUOTE_NUMBER_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");
  if (!year || !month || !day) throw new Error("Unable to derive Asia/Shanghai Server date");
  return { year, month, day, isoDate: `${year}-${month}-${day}` };
}

export function formatQuoteCode(instant: Date, sequenceValue: bigint): string {
  if (sequenceValue < BigInt(1)) throw new Error("Quote sequence value must be positive");
  const date = shanghaiDate(instant);
  const suffix = sequenceValue.toString().padStart(3, "0");
  return `QT-${date.year}-${date.month}${date.day}-${suffix}`;
}

/**
 * PostgreSQL nextval is the sole runtime allocation authority. It is global,
 * concurrency-safe and intentionally not rolled back. Occupied historical
 * candidates are skipped without changing the historical row.
 */
export async function allocateQuoteCode(client: PoolClient, instant: Date): Promise<string> {
  while (true) {
    const allocated = await client.query<{ value: string }>("SELECT nextval('quote_center_quote_number_seq')::text AS value");
    const candidate = formatQuoteCode(instant, BigInt(allocated.rows[0].value));
    const occupied = await client.query<{ occupied: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM quote_center_quotes WHERE quote_code=$1) AS occupied",
      [candidate],
    );
    if (!occupied.rows[0].occupied) return candidate;
  }
}

/** The existing plan digest's canonical bytes, shared without Node/PG imports. */
export function canonicalPlanJson(value: unknown): string {
  const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical)
    : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, child]) => [key, canonical(child)])) : item;
  return JSON.stringify(canonical(value));
}

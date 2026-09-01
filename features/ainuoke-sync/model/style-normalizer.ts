export type StyleMatchKeys = {
  styleNoRaw: string;
  strictStyleKey: string;
  baseStyleKey: string;
};

const separatorPattern = /[\/\\_‐‑‒–—―﹘﹣－\s]+/gu;
const trailingParentheticalPattern = /\(([^()]*)\)$/u;

function canonicalText(value: string): string {
  return value.normalize("NFKC").trim().toLocaleUpperCase("en-US");
}

function canonicalKey(value: string): string {
  return canonicalText(value)
    .replace(separatorPattern, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isFactorySuffix(value: string): boolean {
  const normalized = canonicalText(value).replace(/\s+/g, "");
  return Boolean(normalized && /^[A-Z0-9+_\/\\-]+$/u.test(normalized) && /\d/u.test(normalized));
}

export function normalizeStyleNo(styleNoRaw: string): StyleMatchKeys {
  const raw = styleNoRaw ?? "";
  const normalized = canonicalText(raw);
  const strictStyleKey = canonicalKey(normalized);
  const match = normalized.match(trailingParentheticalPattern);
  const baseSource = match && isFactorySuffix(match[1]) ? normalized.slice(0, match.index).trim() : normalized;
  return { styleNoRaw: raw, strictStyleKey, baseStyleKey: canonicalKey(baseSource) };
}

export function normalizeBrandText(value: string): string {
  return canonicalText(value).replace(/\s+/g, " ");
}

export function resolveBrandAlias(value: string, aliases: ReadonlyArray<{ alias: string; canonicalName: string; enabled?: boolean }>): string {
  const normalized = normalizeBrandText(value);
  const match = aliases.find((item) => item.enabled !== false && normalizeBrandText(item.alias) === normalized);
  return match?.canonicalName.trim() || value.trim();
}

export function styleSimilarity(left: string, right: string): number {
  const a = normalizeStyleNo(left).baseStyleKey;
  const b = normalizeStyleNo(right).baseStyleKey;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const rows = Array.from({ length: a.length + 1 }, (_, index) => index);
  for (let column = 1; column <= b.length; column += 1) {
    let previous = rows[0];
    rows[0] = column;
    for (let row = 1; row <= a.length; row += 1) {
      const current = rows[row];
      rows[row] = Math.min(rows[row] + 1, rows[row - 1] + 1, previous + (a[row - 1] === b[column - 1] ? 0 : 1));
      previous = current;
    }
  }
  return 1 - rows[a.length] / Math.max(a.length, b.length);
}

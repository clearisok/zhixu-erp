import type { MaterialProgressView } from '../../ainuoke-material-progress/projection.ts';

export const MAX_TRIM_PRIORITY_KEYWORDS = 50;
export const MAX_TRIM_PRIORITY_KEYWORD_LENGTH = 40;
export function normalizeTrimPriorityKeywords(input: unknown): string[] {
  if (!Array.isArray(input) || input.length > MAX_TRIM_PRIORITY_KEYWORDS) throw new Error('invalid_trim_priority_keywords');
  const result: string[] = [], seen = new Set<string>();
  for (const value of input) {
    if (typeof value !== 'string' || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error('invalid_trim_priority_keywords');
    const text = value.normalize('NFKC').trim(), key = text.toLowerCase();
    if (!text || Array.from(text).length > MAX_TRIM_PRIORITY_KEYWORD_LENGTH || seen.has(key)) throw new Error('invalid_trim_priority_keywords');
    seen.add(key); result.push(text);
  }
  return result;
}
export type MaterialProgressSettings = {
  schemaVersion: 'material-progress-settings.v1'; version: number; configured: boolean;
  trimPriorityKeywords: string[]; updatedAt: string | null; updatedBy: string | null; canEdit: boolean;
};

/** A temporary display ranking only. Never export/persist it as a material total. */
export function orderMaterialGroups(groups: MaterialProgressView['groups'], keywords: readonly string[]): MaterialProgressView['groups'] {
  const normalized = normalizeTrimPriorityKeywords([...keywords]).map(word => word.toLowerCase());
  const ranked = groups.map((group, index) => ({ group, index,
    demandScore: group.rows.reduce((total, row) => total + (Number.isFinite(row.demand.requiredQuantity) ? Math.max(0, row.demand.requiredQuantity) : 0), 0),
    priority: normalized.findIndex(word => group.name.normalize('NFKC').toLowerCase().includes(word)),
  }));
  ranked.sort((left, right) => {
    if (left.group.type !== right.group.type) return left.group.type === 'fabric' ? -1 : 1;
    if (left.group.type === 'fabric') {
      if (left.demandScore !== right.demandScore) return left.demandScore > right.demandScore ? -1 : 1;
    } else {
      const a = left.priority < 0 ? normalized.length : left.priority;
      const b = right.priority < 0 ? normalized.length : right.priority;
      if (a !== b) return a - b;
    }
    return left.index - right.index;
  });
  return ranked.map(item => item.group);
}

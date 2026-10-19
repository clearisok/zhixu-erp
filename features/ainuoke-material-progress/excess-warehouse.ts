import type { MaterialNormalizedSourceRow } from '../style-progress/source/material-source-row.ts';

export type ExcessWarehouseFact = {
  sourceField: 'num_dyc'; quantity: number | null; unit: string | null;
  status: 'known' | 'missing' | 'invalid' | 'conflict' | 'incomplete' | 'unit_unknown' | 'unit_conflict';
  /** Independently reported warehouse quantity; never added to rknum/readiness. */
  includedInInbound: false;
};

function sourceNumber(value: unknown): number | null | 'invalid' {
  if (value === undefined || value === null || typeof value === 'string' && value.trim() === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : 'invalid';
  if (typeof value !== 'string') return 'invalid';
  const text = value.trim();
  if (!/^(?:\+?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\+?\.\d+)$/.test(text)) return 'invalid';
  const number = Number(text.replaceAll(',', ''));
  return Number.isFinite(number) && number >= 0 ? number : 'invalid';
}

/** Trace only the existing inbound event; do not regroup, infer, sum or persist. */
export function readExcessWarehouse(
  references: readonly string[] | undefined,
  rawIndex: ReadonlyMap<string, MaterialNormalizedSourceRow>,
  unit: string | null,
  unitStatus: 'known' | 'missing' | 'conflict',
): ExcessWarehouseFact {
  const fact = (status: ExcessWarehouseFact['status'], quantity: number | null = null): ExcessWarehouseFact => ({
    sourceField: 'num_dyc', quantity, unit, status, includedInInbound: false,
  });
  if (!references?.length || references.some(reference => !rawIndex.has(reference))) return fact('incomplete');
  const values = references.map(reference => sourceNumber(rawIndex.get(reference)!.rawFields.num_dyc));
  if (values.includes('invalid')) return fact('invalid');
  const known = values.filter((value): value is number => typeof value === 'number');
  if (!known.length) return fact('missing');
  if (new Set(known).size > 1) return fact('conflict');
  if (known.length !== values.length) return fact('incomplete');
  if (unitStatus === 'conflict') return fact('unit_conflict');
  if (unitStatus !== 'known' || unit === null) return fact('unit_unknown', known[0]);
  return fact('known', known[0]);
}

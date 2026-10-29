import { closingFail } from './contract.js';

export type ClosingReadQuery = { offset: number; limit: number; version: number | null; includeVoided: boolean; year: string | null; status: string | null };
/** Pure existing query normalization shared by HTTP reads and the browser client. */
export function parseClosingReadQuery(params: URLSearchParams, kind: 'list' | 'period' | 'history'): ClosingReadQuery {
  const allowed = kind === 'list' ? ['offset', 'limit', 'year', 'status'] : kind === 'period' ? ['offset', 'limit', 'version', 'includeVoided'] : ['offset', 'limit', 'version'];
  if ([...params.keys()].some(key => !allowed.includes(key) || params.getAll(key).length !== 1)) closingFail(400, 'invalid_closing_query');
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const value = params.get(key); if (value === null) return fallback;
    if (!/^\d{1,10}$/u.test(value) || Number(value) < min || Number(value) > max) closingFail(400, 'invalid_closing_query');
    return Number(value);
  };
  const year = params.get('year'), status = params.get('status'), include = params.get('includeVoided') ?? 'false';
  if (year !== null && !/^(19|20|21)\d{2}$/u.test(year) || status !== null && !['open', 'confirmed', 'locked'].includes(status) || !['true', 'false'].includes(include)) closingFail(400, 'invalid_closing_query');
  return { offset: integer('offset', 0, 0, 100000), limit: integer('limit', 25, 1, 50), version: params.has('version') ? integer('version', 1, 1, 2147483647) : null,
    includeVoided: include === 'true', year, status };
}

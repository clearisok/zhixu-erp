import { canonicalPlanJson } from '../../../server/production-scheduling/canonical-json';
import { laborPending, type LaborPending } from './labor-adoption-client';
type Scope = { userId: string };
type ReadStorage = Pick<Storage, 'getItem'>;
const fail = (): never => { throw new Error('labor_pending_unavailable'); };
const actor = (scope: Scope) => typeof scope.userId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(scope.userId) ? scope.userId.toLowerCase() : fail();
export const laborPendingKey = (scope: Scope) => 'zhixu.server.usd-labor.pending.v1.' + actor(scope);
export function readLaborPending(storage: ReadStorage, scope: Scope): LaborPending | null {
  const raw = storage.getItem(laborPendingKey(scope)); if (raw === null) return null; if (new TextEncoder().encode(raw).byteLength > 131072) return fail();
  let parsed: unknown; try { parsed = JSON.parse(raw); } catch { return fail(); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail(); const row = parsed as Record<string, unknown>;
  if (Object.keys(row).length !== 4 || !['schemaVersion', 'userId', 'savedAt', 'pending'].every(key => Object.hasOwn(row, key))
    || row.schemaVersion !== 1 || row.userId !== actor(scope) || typeof row.savedAt !== 'string' || !Number.isFinite(Date.parse(row.savedAt))
    || new Date(row.savedAt).toISOString() !== row.savedAt) return fail();
  let pending: LaborPending; try { pending = laborPending(row.pending); } catch { return fail(); }
  if (canonicalPlanJson(pending) !== canonicalPlanJson(row.pending)) return fail(); return pending;
}
/** A single unresolved command per actor/tab; only identity, intent and digest.
 * No prices, quote/CCT response, token, Browser ledger or automatic replay. */
export function saveLaborPending(storage: ReadStorage & Pick<Storage, 'setItem'>, scope: Scope, input: LaborPending) {
  const pending = laborPending(input), prior = readLaborPending(storage, scope);
  if (prior) { if (canonicalPlanJson(prior) !== canonicalPlanJson(pending)) throw new Error('labor_pending_locked'); return prior; }
  const raw = JSON.stringify({ schemaVersion: 1, userId: actor(scope), savedAt: new Date().toISOString(), pending });
  if (new TextEncoder().encode(raw).byteLength > 131072) return fail(); storage.setItem(laborPendingKey(scope), raw);
  if (storage.getItem(laborPendingKey(scope)) !== raw) return fail(); return pending;
}
/** Only after an exact current-owner terminal receipt has been verified. */
export function acknowledgeLaborPending(storage: ReadStorage & Pick<Storage, 'removeItem'>, scope: Scope, input: LaborPending) {
  const pending = laborPending(input), prior = readLaborPending(storage, scope); if (!prior) return;
  if (canonicalPlanJson(prior) !== canonicalPlanJson(pending)) throw new Error('labor_pending_locked'); storage.removeItem(laborPendingKey(scope));
  if (storage.getItem(laborPendingKey(scope)) !== null) return fail();
}

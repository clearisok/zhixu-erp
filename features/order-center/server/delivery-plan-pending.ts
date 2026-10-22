import { UUID_PATTERN } from '../../../server/sales-orders/delivery-plan-model';
import { canonicalPlanJson } from '../../../server/production-scheduling/canonical-json';
import { deliveryPlanPending, type DeliveryPlanPending } from './delivery-plan-client';

type Scope = { userId: string };
type ReadStorage = Pick<Storage, 'getItem'>;
const fail = (): never => { throw new Error('delivery_plan_pending_unavailable'); };
const actor = (scope: Scope) => typeof scope.userId === 'string' && UUID_PATTERN.test(scope.userId) ? scope.userId.toLowerCase() : fail();
/** One unresolved Server intent per actor/tab. No local business collection or
 * fallback, and no unrelated browser namespace is read or removed. */
export const deliveryPlanPendingKey = (scope: Scope) => 'zhixu.server.delivery-plan.pending.v1.' + actor(scope);
export function readDeliveryPlanPending(storage: ReadStorage, scope: Scope): DeliveryPlanPending | null {
  const raw = storage.getItem(deliveryPlanPendingKey(scope)); if (raw === null) return null;
  if (new TextEncoder().encode(raw).byteLength > 65536) return fail();
  let value: unknown; try { value = JSON.parse(raw); } catch { return fail(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const r = value as Record<string, unknown>;
  if (Object.keys(r).length !== 4 || !['schemaVersion', 'userId', 'savedAt', 'pending'].every(key => Object.hasOwn(r, key))
    || r.schemaVersion !== 1 || r.userId !== actor(scope) || typeof r.savedAt !== 'string'
    || !Number.isFinite(Date.parse(r.savedAt)) || new Date(r.savedAt).toISOString() !== r.savedAt) return fail();
  let pending: DeliveryPlanPending; try { pending = deliveryPlanPending(r.pending); } catch { return fail(); }
  if (canonicalPlanJson(pending) !== canonicalPlanJson(r.pending)) return fail();
  return pending;
}
export function saveDeliveryPlanPending(storage: ReadStorage & Pick<Storage, 'setItem'>, scope: Scope, value: DeliveryPlanPending) {
  const pending = deliveryPlanPending(value), prior = readDeliveryPlanPending(storage, scope);
  if (prior) {
    if (canonicalPlanJson(prior) !== canonicalPlanJson(pending)) throw new Error('delivery_plan_pending_locked');
    return prior;
  }
  const raw = JSON.stringify({ schemaVersion: 1, userId: actor(scope), savedAt: new Date().toISOString(), pending });
  if (new TextEncoder().encode(raw).byteLength > 65536) return fail();
  storage.setItem(deliveryPlanPendingKey(scope), raw);
  if (storage.getItem(deliveryPlanPendingKey(scope)) !== raw) return fail();
  return pending;
}
/** The feature calls this only after an exact, current-owner terminal result. */
export function acknowledgeDeliveryPlanPending(storage: ReadStorage & Pick<Storage, 'removeItem'>, scope: Scope, value: DeliveryPlanPending) {
  const pending = deliveryPlanPending(value), prior = readDeliveryPlanPending(storage, scope); if (!prior) return;
  if (canonicalPlanJson(prior) !== canonicalPlanJson(pending)) throw new Error('delivery_plan_pending_locked');
  storage.removeItem(deliveryPlanPendingKey(scope));
  if (storage.getItem(deliveryPlanPendingKey(scope)) !== null) return fail();
}

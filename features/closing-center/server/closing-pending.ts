import { canonicalPlanJson } from '../../../server/production-scheduling/canonical-json';
import { closingUuid, type ClosingCommand } from '../../../server/closing/contract';
import { closingCommand } from './closing-client';

type Scope = { userId: string };
type ReadStorage = Pick<Storage, 'getItem'>;
const fail = (): never => { throw new Error('closing_pending_unavailable'); };
const normalized = (value: ClosingCommand) => { const command = closingCommand(value); if (canonicalPlanJson(command) !== canonicalPlanJson(value)) fail(); return command; };
export const closingPendingKey = ({ userId }: Scope) => 'zhixu.server.closing.pending.v1.' + closingUuid(userId);
export function readClosingPending(storage: ReadStorage, scope: Scope): ClosingCommand | null {
  const raw = storage.getItem(closingPendingKey(scope)); if (raw === null) return null;
  if (new TextEncoder().encode(raw).byteLength > 131072) return fail();
  let value: unknown; try { value = JSON.parse(raw); } catch { return fail(); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(); const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== 4 || !['schemaVersion', 'userId', 'savedAt', 'command'].every(key => Object.hasOwn(row, key)) || row.schemaVersion !== 1
    || row.userId !== closingUuid(scope.userId) || typeof row.savedAt !== 'string' || !Number.isFinite(Date.parse(row.savedAt)) || new Date(row.savedAt).toISOString() !== row.savedAt) return fail();
  try { return normalized(row.command as ClosingCommand); } catch { return fail(); }
}
/** Actor/tab-local request address only, not a Browser ledger or automatic replay queue. */
export function saveClosingPending(storage: ReadStorage & Pick<Storage, 'setItem'>, scope: Scope, input: ClosingCommand) {
  const command = normalized(input), prior = readClosingPending(storage, scope);
  if (prior) { if (canonicalPlanJson(prior) !== canonicalPlanJson(command)) throw new Error('closing_pending_locked'); return prior; }
  const raw = JSON.stringify({ schemaVersion: 1, userId: closingUuid(scope.userId), savedAt: new Date().toISOString(), command });
  if (new TextEncoder().encode(raw).byteLength > 131072) return fail(); storage.setItem(closingPendingKey(scope), raw); if (storage.getItem(closingPendingKey(scope)) !== raw) return fail(); return command;
}
/** Caller must first verify an exact current-owner terminal receipt. */
export function acknowledgeClosingPending(storage: ReadStorage & Pick<Storage, 'removeItem'>, scope: Scope, command: ClosingCommand) {
  const prior = readClosingPending(storage, scope); if (!prior) return;
  if (canonicalPlanJson(prior) !== canonicalPlanJson(normalized(command))) throw new Error('closing_pending_locked');
  storage.removeItem(closingPendingKey(scope)); if (storage.getItem(closingPendingKey(scope)) !== null) return fail();
}

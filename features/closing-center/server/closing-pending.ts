import { canonicalPlanJson } from '../../../server/production-scheduling/canonical-json';
import { closingUuid, type ClosingCommand } from '../../../server/closing/contract';
import { closingCommand } from './closing-client';

export type ClosingPendingScope = { userId: string };
type ReadStorage = Pick<Storage, 'getItem'>;
const fail = (): never => { throw new Error('closing_pending_unavailable'); };
/** Only an original request address, never a Browser business ledger. The
 * existing financial key/envelope are unchanged; month requests are separate. */
export function createClosingPendingStore<T>(namespace: string, parse: (value: unknown) => T) {
  const key = ({ userId }: ClosingPendingScope) => namespace + closingUuid(userId);
  const normalized = (value: unknown) => { const command = parse(value); if (canonicalPlanJson(command) !== canonicalPlanJson(value)) fail(); return command; };
  function read(storage: ReadStorage, scope: ClosingPendingScope): T | null {
    const raw = storage.getItem(key(scope)); if (raw === null) return null;
    if (new TextEncoder().encode(raw).byteLength > 131072) return fail();
    let value: unknown; try { value = JSON.parse(raw); } catch { return fail(); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(); const row = value as Record<string, unknown>;
    if (Object.keys(row).length !== 4 || !['schemaVersion', 'userId', 'savedAt', 'command'].every(key => Object.hasOwn(row, key)) || row.schemaVersion !== 1
      || row.userId !== closingUuid(scope.userId) || typeof row.savedAt !== 'string' || !Number.isFinite(Date.parse(row.savedAt)) || new Date(row.savedAt).toISOString() !== row.savedAt) return fail();
    try { return normalized(row.command); } catch { return fail(); }
  }
  function save(storage: ReadStorage & Pick<Storage, 'setItem'>, scope: ClosingPendingScope, input: T) {
    const command = normalized(input), prior = read(storage, scope);
    if (prior) { if (canonicalPlanJson(prior) !== canonicalPlanJson(command)) throw new Error('closing_pending_locked'); return prior; }
    const raw = JSON.stringify({ schemaVersion: 1, userId: closingUuid(scope.userId), savedAt: new Date().toISOString(), command });
    if (new TextEncoder().encode(raw).byteLength > 131072) return fail(); storage.setItem(key(scope), raw); if (storage.getItem(key(scope)) !== raw) return fail(); return command;
  }
  function acknowledge(storage: ReadStorage & Pick<Storage, 'removeItem'>, scope: ClosingPendingScope, command: T) {
    const prior = read(storage, scope); if (!prior) return;
    if (canonicalPlanJson(prior) !== canonicalPlanJson(normalized(command))) throw new Error('closing_pending_locked');
    storage.removeItem(key(scope)); if (storage.getItem(key(scope)) !== null) return fail();
  }
  return { key, read, save, acknowledge };
}
const financial = createClosingPendingStore<ClosingCommand>('zhixu.server.closing.pending.v1.', closingCommand);
export const closingPendingKey = financial.key;
export const readClosingPending = financial.read;
export const saveClosingPending = financial.save;
/** Caller must first verify an exact current-owner terminal receipt. */
export const acknowledgeClosingPending = financial.acknowledge;

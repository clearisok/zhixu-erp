import type { PermissionKey } from '../../permissions/model/permissions';
import { closingUuid } from '../../../server/closing/contract';
import { parseClosingMonthCommand, parseClosingMonthIntent, type ClosingMonthCommand, type ClosingMonthIntent } from '../../../server/closing/month-plan-model';
import { createClosingClient } from './closing-client';
import { createClosingPendingStore } from './closing-pending';
import { parseClosingMonthPreview, parseClosingMonthReceipt, type ClosingMonthPreview, type ClosingMonthReceipt } from './closing-month-projection';
import { createClosingCommandController, type ClosingRequestControlState, type PendingStorage } from './closing-command-controller';

const pending = createClosingPendingStore<ClosingMonthCommand>('zhixu.server.closing-month.pending.v1.', parseClosingMonthCommand);
export const closingMonthPendingKey = pending.key;
export const readClosingMonthPending = pending.read;
export const saveClosingMonthPending = pending.save;
type Recorded = Extract<ClosingMonthReceipt, { state: 'recorded' }>;
export type ClosingMonthControlState = ClosingRequestControlState<ClosingMonthPreview, ClosingMonthCommand, Recorded['result']>;
/** A whole-order preview always loads the physical SO, independently of the
 * visible annual filters. Changing that UI context creates a new owner lease. */
export function createClosingMonthController(options: {
  userId: string; orderId: string; owner: object; currentOwner: () => object | null;
  permissions: () => readonly PermissionKey[]; storage: () => PendingStorage;
  client?: Pick<ReturnType<typeof createClosingClient>, 'monthPreview' | 'monthSubmit' | 'monthReceipt'>;
  requestId?: () => string; timeoutMs?: number; onChange?: (state: ClosingMonthControlState) => void;
  onUnauthorized?: () => void; onApplied?: (result: Extract<Recorded['result'], { status: 'applied' }>) => void;
}) {
  const scope = { userId: closingUuid(options.userId) }, orderId = closingUuid(options.orderId);
  const client = options.client ?? createClosingClient({ visibility: () => ({ sale: options.permissions().includes('commercial.sale.view'), work: options.permissions().includes('commercial.labor.view') }) });
  return createClosingCommandController<ClosingMonthIntent, ClosingMonthCommand, ClosingMonthPreview, Recorded['result']>({ ...options,
    client: { preview: client.monthPreview, submit: client.monthSubmit, receipt: client.monthReceipt },
    parseIntent: parseClosingMonthIntent, parseCommand: parseClosingMonthCommand, parsePreview: parseClosingMonthPreview, parseReceipt: parseClosingMonthReceipt,
    accepts: intent => intent.orderId === orderId, canWrite: (_intent, permissions) => permissions.includes('closing.edit'),
    store: { read: storage => pending.read(storage, scope), save: (storage, command) => pending.save(storage, scope, command),
      acknowledge: (storage, command) => pending.acknowledge(storage, scope, command) },
  });
}

import type { PermissionKey } from '../../permissions/model/permissions';
import { closingActionPermission, closingChannelPermissions, closingUuid, parseClosingIntent } from '../../../server/closing/contract';
import { closingCommand, createClosingClient, parseClosingReceipt, type ClosingCommand, type ClosingIntent, type ClosingReceipt } from './closing-client';
import { parseClosingPreview, type ClosingPreview } from './closing-projection';
import { acknowledgeClosingPending, readClosingPending, saveClosingPending } from './closing-pending';
import { createClosingCommandController, type ClosingRequestControlState, type PendingStorage } from './closing-command-controller';

type Recorded = Extract<ClosingReceipt, { state: 'recorded' }>;
type Applied = Extract<Recorded['result'], { status: 'applied' }>;
export type ClosingControlState = ClosingRequestControlState<ClosingPreview, ClosingCommand, Recorded['result']>;

/** Existing public financial-controller contract; all lifecycle logic is shared. */
export function createClosingController(options: {
  userId: string; periodId: string | null; owner: object; currentOwner: () => object | null;
  permissions: () => readonly PermissionKey[]; storage: () => PendingStorage;
  client?: Pick<ReturnType<typeof createClosingClient>, 'preview' | 'submit' | 'receipt'>;
  requestId?: () => string; timeoutMs?: number;
  onChange?: (state: ClosingControlState) => void; onUnauthorized?: () => void;
  onApplied?: (result: Applied) => void;
}) {
  const scope = { userId: closingUuid(options.userId) }, periodId = options.periodId === null ? null : closingUuid(options.periodId);
  const client = options.client ?? createClosingClient({ visibility: () => ({ sale: options.permissions().includes('commercial.sale.view'), work: options.permissions().includes('commercial.labor.view') }) });
  return createClosingCommandController<ClosingIntent, ClosingCommand, ClosingPreview, Recorded['result']>({ ...options, client,
    parseIntent: parseClosingIntent, parseCommand: closingCommand, parsePreview: parseClosingPreview, parseReceipt: parseClosingReceipt,
    accepts: intent => intent.action === 'create_period' ? periodId === null : intent.periodId === periodId,
    canWrite: (intent, permissions) => [closingActionPermission(intent), ...('data' in intent ? closingChannelPermissions(intent.data.channels)
      : intent.action === 'sync_month_outputs' ? closingChannelPermissions(intent.channels) : [])].every(key => permissions.includes(key)),
    store: { read: storage => readClosingPending(storage, scope), save: (storage, command) => saveClosingPending(storage, scope, command),
      acknowledge: (storage, command) => acknowledgeClosingPending(storage, scope, command) },
  });
}

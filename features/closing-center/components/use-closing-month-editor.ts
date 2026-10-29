"use client";
import { useEffect, useRef, useState } from 'react';
import { createClosingMonthController, type ClosingMonthControlState } from '../server/closing-month-controller';
import type { ClosingMonthDisplayState } from '../server/closing-month-display-projection';
import { closingUiError, useClosingOwner } from './closing-ui-owner';

export function useClosingMonthEditor(orderId: string, context: string, onChanged: () => void) {
  const ownerState = useClosingOwner(context), { session, owner, owns, currentOwner, client } = ownerState;
  const controller = useRef<ReturnType<typeof createClosingMonthController> | null>(null), changed = useRef(onChanged);
  const [owned, setOwned] = useState<{ owner: object; data: ClosingMonthDisplayState }>();
  const [control, setControl] = useState<{ owner: object; value: ClosingMonthControlState }>();
  const [failure, setFailure] = useState<{ owner: object; text: string }>();
  useEffect(() => { changed.current = onChanged; }, [onChanged]);
  useEffect(() => {
    let active = true;
    const abort = new AbortController(), lease = () => active && owns();
    void Promise.resolve().then(() => {
      if (!lease() || !session.user) return;
      const c = createClosingMonthController({ userId: session.user.id, orderId, owner, currentOwner,
        permissions: () => session.permissions, storage: () => window.sessionStorage, client,
        onChange: value => { if (lease()) setControl({ owner, value }); },
        onUnauthorized: () => { if (lease()) session.invalidate(); },
        onApplied: () => { if (lease()) changed.current(); } });
      controller.current = c; setControl({ owner, value: c.snapshot() });
      void client.monthDisplay(orderId, lease, abort.signal).then(data => { if (lease()) { setOwned({ owner, data }); setFailure(undefined); } })
        .catch(error => { if (lease()) { setFailure({ owner, text: closingUiError(error) }); if ((error as { status?: number }).status === 401) session.invalidate(); } });
    });
    return () => { active = false; abort.abort(); controller.current?.dispose(); controller.current = null; };
  }, [client, currentOwner, orderId, owner, owns, session]);
  const state = control?.owner === owner ? control.value : null;
  return { ...ownerState, controller, data: owned?.owner === owner ? owned.data : null, state,
    readError: failure?.owner === owner ? failure.text : '',
    blocked: Boolean(state?.busy || state?.pending || state?.pendingUnavailable), done: state?.stage === 'saved' };
}

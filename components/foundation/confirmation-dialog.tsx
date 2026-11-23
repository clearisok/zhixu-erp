"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./button";
import { Modal } from "./modal";
import { UnsavedDraftDialog } from "./guarded-draft";

type Confirmation = { kind: "discard"; entityLabel: string; description: string; confirmLabel?: string }
  | { kind: "danger" | "confirm"; title: string; description: string; confirmLabel: string; cancelLabel?: string };

/** Presentation only: the feature retains its guards, request and command callback. */
export function useConfirmationDialog() {
  const [request, setRequest] = useState<Confirmation | null>(null);
  const resolve = useRef<((accepted: boolean) => void) | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; resolve.current?.(false); resolve.current = null; }; }, []);
  const confirmAction = useCallback((next: Confirmation): Promise<boolean> => {
    if (!mounted.current) return Promise.resolve(false);
    resolve.current?.(false);
    setRequest(next);
    return new Promise<boolean>(done => { resolve.current = done; });
  }, []);
  const respond = (accepted: boolean) => {
    const done = resolve.current;
    resolve.current = null;
    setRequest(null);
    done?.(accepted);
  };
  const confirmationDialog = request?.kind === "discard"
    ? <UnsavedDraftDialog open entityLabel={request.entityLabel} description={request.description} discardLabel={request.confirmLabel} onKeepEditing={() => respond(false)} onDiscard={() => respond(true)} />
    : <Modal open={Boolean(request)} title={request?.title ?? "确认操作"} description={request?.description} onClose={() => respond(false)} footer={<><Button variant="secondary" onClick={() => respond(false)}>{request?.cancelLabel ?? "取消"}</Button><Button variant={request?.kind === "danger" ? "danger" : "primary"} onClick={() => respond(true)}>{request?.confirmLabel ?? "确认"}</Button></>}><></></Modal>;
  return { confirmAction, confirmationDialog };
}

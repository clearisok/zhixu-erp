"use client";

import { useMemo, useState } from "react";
import { Button } from "./button";
import { Modal } from "./modal";
import { isDraftChanged } from "./draft-state";

function cloneDraft<T>(value: T): T {
  return structuredClone(value);
}

export function useGuardedDraft<T>() {
  const [draft, setDraft] = useState<T | null>(null);
  const [initialDraft, setInitialDraft] = useState<T | null>(null);
  const [closeConfirmationOpen, setCloseConfirmationOpen] = useState(false);
  const dirty = useMemo(() => isDraftChanged(initialDraft, draft), [draft, initialDraft]);

  const openDraft = (value: T) => {
    setDraft(cloneDraft(value));
    setInitialDraft(cloneDraft(value));
    setCloseConfirmationOpen(false);
  };
  const closeDraft = () => {
    setDraft(null);
    setInitialDraft(null);
    setCloseConfirmationOpen(false);
  };
  const requestClose = () => {
    if (dirty) setCloseConfirmationOpen(true);
    else closeDraft();
  };

  return {
    draft,
    setDraft,
    dirty,
    openDraft,
    closeDraft,
    requestClose,
    closeConfirmationOpen,
    keepEditing: () => setCloseConfirmationOpen(false),
  };
}

export function UnsavedDraftDialog({ open, entityLabel, description = "关闭后，本次尚未保存的输入会丢失。", discardLabel = "放弃修改", onKeepEditing, onDiscard }: {
  open: boolean;
  entityLabel: string;
  description?: string;
  discardLabel?: string;
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  return <Modal
    open={open}
    title={`${entityLabel}有未保存修改`}
    description={description}
    onClose={onKeepEditing}
    footer={<><Button variant="secondary" onClick={onKeepEditing}>继续编辑</Button><Button variant="danger" onClick={onDiscard}>{discardLabel}</Button></>}
  >{null}</Modal>;
}

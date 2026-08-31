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

export function UnsavedDraftDialog({ open, entityLabel, onKeepEditing, onDiscard }: {
  open: boolean;
  entityLabel: string;
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  return <Modal
    open={open}
    title={`${entityLabel}有未保存修改`}
    description="关闭后，本次尚未保存的输入会丢失。"
    onClose={onKeepEditing}
    footer={<><Button variant="secondary" onClick={onKeepEditing}>继续编辑</Button><Button variant="danger" onClick={onDiscard}>放弃修改</Button></>}
  ><p className="qc-unsaved-message">只有真实修改才会出现此提示；打开记录或加载默认值不会自动产生 dirty 状态。</p></Modal>;
}

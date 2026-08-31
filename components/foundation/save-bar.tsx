import type { ReactNode } from "react";
import { Button } from "./button";

export type SaveState = "clean" | "dirty" | "saving" | "saved" | "error";

export function SaveBar({ state, onSave, onDiscard, saveLabel = "保存", message, secondaryActions }: { state: SaveState; onSave: () => void; onDiscard?: () => void; saveLabel?: string; message?: string; secondaryActions?: ReactNode }) {
  const labels: Record<SaveState, string> = { clean: "没有未保存的修改", dirty: "有未保存的修改", saving: "正在保存…", saved: "已保存", error: "保存失败" };
  return <div className="qc-save-bar" data-state={state} role="status"><div><i aria-hidden="true" /><span>{message ?? labels[state]}</span></div><aside>{secondaryActions}{onDiscard && state === "dirty" && <Button variant="text" onClick={onDiscard}>放弃修改</Button>}<Button onClick={onSave} disabled={state === "clean" || state === "saving"}>{state === "saving" ? "保存中…" : saveLabel}</Button></aside></div>;
}

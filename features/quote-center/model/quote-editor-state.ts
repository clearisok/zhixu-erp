import type { CostLine, NullableNumber } from "./quote-view-model";

export type CostCategory = "fabrics" | "trims" | "otherCosts";

export function parseNumberDraft(draft: string): NullableNumber {
  if (draft.trim() === "") return null;
  const parsed = Number(draft);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createEmptyCostLine(id: string): CostLine {
  return { id, name: "", specification: "", usage: null, unit: "", lossRate: null, unitPrice: null };
}

export function patchCostLine(lines: CostLine[], lineId: string, patch: Partial<CostLine>): CostLine[] {
  return lines.map((line) => line.id === lineId ? { ...line, ...patch, id: line.id } : line);
}

export type NavigationIntent = { navigateTo: string | null; pendingTarget: string | null };

export function createNavigationIntent(isDirty: boolean, target: string): NavigationIntent {
  return isDirty ? { navigateTo: null, pendingTarget: target } : { navigateTo: target, pendingTarget: null };
}

export type DirtyChoice = "save" | "discard" | "continue";

export function resolveDirtyChoice(choice: DirtyChoice, target: string): { shouldSave: boolean; navigateTo: string | null } {
  if (choice === "continue") return { shouldSave: false, navigateTo: null };
  return { shouldSave: choice === "save", navigateTo: target };
}

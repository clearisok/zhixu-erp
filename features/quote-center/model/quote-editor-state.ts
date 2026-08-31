import { createCostLineGroupId, type CostLine, type FabricCostLine, type NullableNumber, type OtherCostLine, type TrimCostLine } from "./quote-view-model.ts";

export type CostCategory = "fabrics" | "trims" | "otherCosts";

export function parseNumberDraft(draft: string): NullableNumber {
  if (draft.trim() === "") return null;
  const parsed = Number(draft);
  return Number.isFinite(parsed) ? parsed : null;
}

export function createEmptyCostLine(id: string): CostLine {
  return { id, lineGroupId: createCostLineGroupId(), name: "", specification: "", usage: null, unit: "", lossRate: null, unitPrice: null };
}

export function createEmptyOtherCostLine(id: string): OtherCostLine {
  return { ...createEmptyCostLine(id), amount: null, source: "manual" };
}

export function createEmptyFabricCostLine(id: string): FabricCostLine {
  return {
    id,
    lineGroupId: createCostLineGroupId(),
    sourceLibraryItemId: null,
    name: "",
    composition: "",
    segmentLengthCm: null,
    netWidthCm: null,
    gsm: null,
    lossRate: null,
    supplier: "",
    unitPrice: null,
    purchaseUnit: "kg",
  };
}

export function createEmptyTrimCostLine(id: string): TrimCostLine {
  return {
    ...createEmptyCostLine(id),
    sourceLibraryItemId: null,
    supplier: "",
  };
}

export function patchCostLine(lines: CostLine[], lineId: string, patch: Partial<CostLine>): CostLine[] {
  return lines.map((line) => line.id === lineId ? { ...line, ...patch, id: line.id } : line);
}

export function patchStableRow<T extends { id: string }>(lines: T[], lineId: string, patch: Partial<T>): T[] {
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

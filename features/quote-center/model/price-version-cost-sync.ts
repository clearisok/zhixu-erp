import {
  createCostLineGroupId,
  type FabricCostLine,
  type OtherCostLine,
  type PriceVersion,
  type QuoteRevision,
  type TrimCostLine,
} from "./quote-view-model.ts";
import { costLineAmount } from "./quote-calculations.ts";

export type CostSyncCategory = "fabrics" | "trims" | "otherCosts";
export type CostSyncScope = "all" | "matching" | "current" | "selected";
export type CostSyncBatchScope = "smart" | "all" | "current";
export type CostSyncValue = string | number | null;

type SyncableLine = FabricCostLine | TrimCostLine | OtherCostLine;

export type CostSyncFieldDefinition = {
  key: string;
  label: string;
};

export type CostSyncVersionValue = {
  priceVersionId: string;
  priceVersionName: string;
  rowId: string;
  value: CostSyncValue;
  independent: boolean;
};

export type CostSyncCandidate = {
  id: string;
  category: CostSyncCategory;
  categoryLabel: string;
  lineGroupId: string;
  rowName: string;
  sourcePriceVersionId: string;
  field: string;
  fieldLabel: string;
  beforeValue: CostSyncValue;
  afterValue: CostSyncValue;
  versions: CostSyncVersionValue[];
  matchingVersionIds: string[];
  recommendedScope: Exclude<CostSyncScope, "selected">;
  hasExistingDifferences: boolean;
};

export type CostSyncDecision = {
  scope: CostSyncScope;
  selectedVersionIds: string[];
};

export type UnconfirmedCostDifference = {
  id: string;
  category: CostSyncCategory;
  categoryLabel: string;
  lineGroupId: string;
  rowName: string;
  field: string;
  fieldLabel: string;
  versions: CostSyncVersionValue[];
};

const definitions: Record<CostSyncCategory, { label: string; fields: CostSyncFieldDefinition[] }> = {
  fabrics: {
    label: "面料成本",
    fields: [
      ["name", "面料名称"], ["composition", "成分"], ["segmentLengthCm", "段长"], ["netWidthCm", "净门幅"],
      ["gsm", "克重"], ["lossRate", "损耗率"], ["supplier", "供应商"], ["unitPrice", "单价"], ["purchaseUnit", "采购单位"],
    ].map(([key, label]) => ({ key, label })),
  },
  trims: {
    label: "辅料成本",
    fields: [
      ["name", "辅料名称"], ["specification", "规格"], ["supplier", "供应商"], ["usage", "数量/用量"],
      ["unit", "单位"], ["lossRate", "损耗率"], ["unitPrice", "单价"],
    ].map(([key, label]) => ({ key, label })),
  },
  otherCosts: {
    label: "其他费用",
    fields: [
      ["name", "费用名称"], ["specification", "规格"], ["usage", "数量/用量"], ["unit", "单位"],
      ["lossRate", "损耗率"], ["unitPrice", "单价"],
    ].map(([key, label]) => ({ key, label })),
  },
};

export const costSyncFieldDefinitions = definitions;

const valueKey = (value: CostSyncValue) => `${value === null ? "null" : typeof value}:${value ?? ""}`;
export const costSyncValuesEqual = (left: CostSyncValue, right: CostSyncValue) => Object.is(left, right);

function lineValue(line: SyncableLine, field: string): CostSyncValue {
  const value = (line as unknown as Record<string, unknown>)[field];
  return value === null || typeof value === "string" || typeof value === "number" ? value : null;
}

function updateIndependentFields(line: SyncableLine, field: string, independent: boolean): SyncableLine {
  const next = new Set(line.independentFields ?? []);
  if (independent) next.add(field);
  else next.delete(field);
  return { ...line, independentFields: next.size ? [...next] : undefined };
}

function patchLine(line: SyncableLine, field: string, value: CostSyncValue): SyncableLine {
  return { ...line, [field]: value } as SyncableLine;
}

export function ensurePriceVersionLineGroups(
  version: PriceVersion,
  createId: () => string = createCostLineGroupId,
): PriceVersion {
  const ensure = <T extends SyncableLine>(rows: T[]) => rows.map((row) => row.lineGroupId ? row : ({ ...row, lineGroupId: createId() }));
  return {
    ...version,
    fabrics: ensure(version.fabrics),
    trims: ensure(version.trims),
    otherCosts: ensure(version.otherCosts),
  };
}

function rows(version: PriceVersion, category: CostSyncCategory): SyncableLine[] {
  return version[category];
}

function linkedVersionValues(revision: QuoteRevision, category: CostSyncCategory, lineGroupId: string, field: string): CostSyncVersionValue[] {
  return revision.priceVersions.flatMap((version) => {
    const line = rows(version, category).find((item) => item.lineGroupId === lineGroupId);
    return line ? [{
      priceVersionId: version.id,
      priceVersionName: version.name,
      rowId: line.id,
      value: lineValue(line, field),
      independent: line.independentFields?.includes(field) ?? false,
    }] : [];
  });
}

export function createCostSyncCandidates(
  savedRevision: QuoteRevision | null | undefined,
  currentRevision: QuoteRevision,
  sourcePriceVersionId: string,
): CostSyncCandidate[] {
  if (!savedRevision || currentRevision.readOnly || currentRevision.priceVersions.length < 2) return [];
  const savedSource = savedRevision.priceVersions.find((version) => version.id === sourcePriceVersionId);
  const currentSource = currentRevision.priceVersions.find((version) => version.id === sourcePriceVersionId);
  if (!savedSource || !currentSource) return [];

  const candidates: CostSyncCandidate[] = [];
  for (const category of Object.keys(definitions) as CostSyncCategory[]) {
    const currentById = new Map(rows(currentSource, category).map((line) => [line.id, line]));
    for (const beforeLine of rows(savedSource, category)) {
      const afterLine = currentById.get(beforeLine.id);
      if (!afterLine?.lineGroupId || beforeLine.lineGroupId !== afterLine.lineGroupId) continue;
      for (const field of definitions[category].fields) {
        const beforeValue = lineValue(beforeLine, field.key);
        const afterValue = lineValue(afterLine, field.key);
        if (costSyncValuesEqual(beforeValue, afterValue)) continue;
        const versions = linkedVersionValues(savedRevision, category, afterLine.lineGroupId, field.key);
        if (versions.length < 2) continue;
        const sourceValue = versions.find((item) => item.priceVersionId === sourcePriceVersionId)?.value;
        if (sourceValue === undefined && beforeValue !== null) continue;
        const matchingVersionIds = versions.filter((item) => costSyncValuesEqual(item.value, beforeValue)).map((item) => item.priceVersionId);
        const allEqual = versions.every((item) => costSyncValuesEqual(item.value, beforeValue));
        const matchingOthers = matchingVersionIds.filter((id) => id !== sourcePriceVersionId);
        const recommendedScope = allEqual ? "all" : matchingOthers.length ? "matching" : "current";
        candidates.push({
          id: `${category}:${sourcePriceVersionId}:${afterLine.lineGroupId}:${field.key}`,
          category,
          categoryLabel: definitions[category].label,
          lineGroupId: afterLine.lineGroupId,
          rowName: afterLine.name.trim() || "未命名行",
          sourcePriceVersionId,
          field: field.key,
          fieldLabel: field.label,
          beforeValue,
          afterValue,
          versions,
          matchingVersionIds,
          recommendedScope,
          hasExistingDifferences: !allEqual,
        });
      }
    }
  }
  return candidates;
}

function decisionTargetIds(candidate: CostSyncCandidate, decision: CostSyncDecision): Set<string> {
  if (decision.scope === "all") return new Set(candidate.versions.map((item) => item.priceVersionId));
  if (decision.scope === "matching") return new Set([...candidate.matchingVersionIds, candidate.sourcePriceVersionId]);
  if (decision.scope === "selected") return new Set([...decision.selectedVersionIds, candidate.sourcePriceVersionId]);
  return new Set([candidate.sourcePriceVersionId]);
}

export function applyCostSyncDecisions(
  revision: QuoteRevision,
  candidates: CostSyncCandidate[],
  decisions: Record<string, CostSyncDecision>,
): { revision: QuoteRevision; affectedPriceVersionIds: string[] } {
  let next = structuredClone(revision);
  const affected = new Set<string>();

  for (const candidate of candidates) {
    const decision = decisions[candidate.id] ?? { scope: candidate.recommendedScope, selectedVersionIds: candidate.matchingVersionIds };
    const targetIds = decisionTargetIds(candidate, decision);
    next = {
      ...next,
      priceVersions: next.priceVersions.map((version) => {
        const linked = rows(version, candidate.category).find((line) => line.lineGroupId === candidate.lineGroupId);
        if (!linked) return version;
        const included = targetIds.has(version.id);
        let replacement: SyncableLine = linked;
        if (included) {
          replacement = patchLine(replacement, candidate.field, candidate.afterValue);
          if (candidate.category === "otherCosts") replacement = { ...replacement, amount: costLineAmount(replacement as OtherCostLine) } as OtherCostLine;
          replacement = updateIndependentFields(replacement, candidate.field, decision.scope === "current" && version.id === candidate.sourcePriceVersionId);
          affected.add(version.id);
        } else if (decision.scope === "selected" && !costSyncValuesEqual(lineValue(replacement, candidate.field), candidate.afterValue)) {
          replacement = updateIndependentFields(replacement, candidate.field, true);
        }
        return {
          ...version,
          [candidate.category]: rows(version, candidate.category).map((line) => line.id === linked.id ? replacement : line),
        } as PriceVersion;
      }),
    };
  }
  return { revision: next, affectedPriceVersionIds: [...affected] };
}

export function detectUnconfirmedCostDifferences(revision: QuoteRevision): UnconfirmedCostDifference[] {
  if (revision.priceVersions.length < 2) return [];
  const differences: UnconfirmedCostDifference[] = [];

  for (const category of Object.keys(definitions) as CostSyncCategory[]) {
    const groupIds = new Set(revision.priceVersions.flatMap((version) => rows(version, category).map((line) => line.lineGroupId).filter((id): id is string => Boolean(id))));
    for (const lineGroupId of groupIds) {
      for (const field of definitions[category].fields) {
        const versions = linkedVersionValues(revision, category, lineGroupId, field.key);
        if (versions.length < 2 || new Set(versions.map((item) => valueKey(item.value))).size < 2) continue;
        const unmarkedClusters = new Set(versions.filter((item) => !item.independent).map((item) => valueKey(item.value)));
        if (unmarkedClusters.size <= 1) continue;
        const rowName = revision.priceVersions.flatMap((version) => rows(version, category)).find((line) => line.lineGroupId === lineGroupId)?.name.trim() || "未命名行";
        differences.push({
          id: `${category}:${lineGroupId}:${field.key}`,
          category,
          categoryLabel: definitions[category].label,
          lineGroupId,
          rowName,
          field: field.key,
          fieldLabel: field.label,
          versions,
        });
      }
    }
  }
  return differences;
}

export function defaultCostSyncDecisions(candidates: CostSyncCandidate[]): Record<string, CostSyncDecision> {
  return Object.fromEntries(candidates.map((candidate) => [candidate.id, {
    scope: candidate.recommendedScope,
    selectedVersionIds: candidate.recommendedScope === "matching" ? candidate.matchingVersionIds : [candidate.sourcePriceVersionId],
  }]));
}

export function costSyncScopeLabel(scope: CostSyncScope): string {
  return scope === "all" ? "全部价格版本" : scope === "matching" ? "同步同值版本" : scope === "selected" ? "选择价格版本" : "仅当前价格版本";
}

export function formatCostSyncValue(field: string, value: CostSyncValue): string {
  if (value === null || value === "") return "空";
  if (typeof value !== "number") return String(value);
  if (/lossRate/i.test(field)) return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 }).format(value)}%`;
  if (/unitPrice/i.test(field)) return `¥${value.toFixed(2)}`;
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 }).format(value);
}

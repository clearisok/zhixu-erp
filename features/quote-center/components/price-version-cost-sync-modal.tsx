"use client";

import { useState } from "react";
import { Button, Modal } from "@/components/foundation";
import {
  costSyncScopeLabel,
  defaultCostSyncDecisions,
  formatCostSyncValue,
  type CostSyncBatchScope,
  type CostSyncCandidate,
  type CostSyncDecision,
  type CostSyncScope,
  type UnconfirmedCostDifference,
} from "../model/price-version-cost-sync";

const scopeOptions: CostSyncScope[] = ["all", "matching", "current", "selected"];

export function PriceVersionCostSyncModal({
  open,
  candidates,
  onClose,
  onConfirm,
  onCurrentOnly,
}: {
  open: boolean;
  candidates: CostSyncCandidate[];
  onClose: () => void;
  onConfirm: (decisions: Record<string, CostSyncDecision>) => void | Promise<void>;
  onCurrentOnly: () => void | Promise<void>;
}) {
  const [batchScope, setBatchScope] = useState<CostSyncBatchScope>("smart");
  const [decisions, setDecisions] = useState<Record<string, CostSyncDecision>>(() => defaultCostSyncDecisions(candidates));

  const applyBatchScope = (scope: CostSyncBatchScope) => {
    setBatchScope(scope);
    if (scope === "smart") setDecisions(defaultCostSyncDecisions(candidates));
    else setDecisions(Object.fromEntries(candidates.map((candidate) => [candidate.id, {
      scope: scope === "all" ? "all" : "current",
      selectedVersionIds: [candidate.sourcePriceVersionId],
    }])));
  };

  const updateDecision = (candidate: CostSyncCandidate, scope: CostSyncScope) => setDecisions((current) => ({
    ...current,
    [candidate.id]: {
      scope,
      selectedVersionIds: scope === "matching" ? candidate.matchingVersionIds : current[candidate.id]?.selectedVersionIds ?? [candidate.sourcePriceVersionId],
    },
  }));

  const toggleSelectedVersion = (candidate: CostSyncCandidate, priceVersionId: string, checked: boolean) => setDecisions((current) => {
    const existing = current[candidate.id] ?? { scope: "selected" as const, selectedVersionIds: [candidate.sourcePriceVersionId] };
    const selected = new Set(existing.selectedVersionIds);
    if (checked) selected.add(priceVersionId);
    else selected.delete(priceVersionId);
    selected.add(candidate.sourcePriceVersionId);
    return { ...current, [candidate.id]: { scope: "selected", selectedVersionIds: [...selected] } };
  });

  return <Modal
    open={open}
    title="价格版本同步"
    description="本次修改包含可应用到其他价格版本的数据，请确认应用范围。"
    onClose={onClose}
    onSubmit={() => onConfirm(decisions)}
    className="qc-price-sync-modal"
    footer={<div className="qc-modal-footer-split"><Button variant="secondary" onClick={onCurrentOnly}>仅保存当前版本</Button><div><Button variant="secondary" onClick={onClose}>取消</Button><Button type="submit">同步并保存</Button></div></div>}
  >
    <div className="qc-price-sync-toolbar">
      <label><span>全部应用范围</span><select className="qc-control" value={batchScope} onChange={(event) => applyBatchScope(event.target.value as CostSyncBatchScope)}><option value="smart">智能推荐</option><option value="all">全部价格版本</option><option value="current">仅当前价格版本</option></select></label>
      <small>{candidates.length} 项字段修改</small>
    </div>
    <div className="qc-price-sync-list">
      {candidates.map((candidate) => {
        const decision = decisions[candidate.id] ?? defaultCostSyncDecisions([candidate])[candidate.id];
        return <article className="qc-price-sync-item" key={candidate.id}>
          <div className="qc-price-sync-change"><span>{candidate.categoryLabel}</span><strong>{candidate.rowName} · {candidate.fieldLabel}</strong><p><i>{formatCostSyncValue(candidate.field, candidate.beforeValue)}</i><b>→</b><em>{formatCostSyncValue(candidate.field, candidate.afterValue)}</em></p></div>
          <div className="qc-price-sync-versions"><span>当前各版本</span>{candidate.versions.map((version) => <small key={version.priceVersionId}>{version.priceVersionName}：{formatCostSyncValue(candidate.field, version.value)}{version.independent ? " · 独立" : ""}</small>)}</div>
          <div className="qc-price-sync-scope"><label><span>应用范围</span><select className="qc-control" value={decision.scope} onChange={(event) => updateDecision(candidate, event.target.value as CostSyncScope)}>{scopeOptions.filter((scope) => scope !== "matching" || candidate.matchingVersionIds.some((id) => id !== candidate.sourcePriceVersionId)).map((scope) => <option key={scope} value={scope}>{costSyncScopeLabel(scope)}{scope === candidate.recommendedScope ? "（推荐）" : ""}</option>)}</select></label>{candidate.hasExistingDifferences && <small>{candidate.recommendedScope === "current" ? "其他价格版本已存在不同值" : "仅同步修改前同值的版本，保留已有差异"}</small>}</div>
          {decision.scope === "selected" && <div className="qc-price-sync-selection"><span>选择价格版本</span>{candidate.versions.map((version) => <label key={version.priceVersionId}><input type="checkbox" checked={version.priceVersionId === candidate.sourcePriceVersionId || decision.selectedVersionIds.includes(version.priceVersionId)} disabled={version.priceVersionId === candidate.sourcePriceVersionId} onChange={(event) => toggleSelectedVersion(candidate, version.priceVersionId, event.target.checked)} /><span>{version.priceVersionName}</span></label>)}</div>}
        </article>;
      })}
    </div>
  </Modal>;
}

export function PriceVersionDifferencesModal({
  open,
  differences,
  onClose,
}: {
  open: boolean;
  differences: UnconfirmedCostDifference[];
  onClose: () => void;
}) {
  return <Modal open={open} title="价格版本差异" description="以下字段在关联价格版本中存在尚未确认的不同值。" onClose={onClose} className="qc-price-differences-modal" footer={<Button variant="secondary" onClick={onClose}>关闭</Button>}>
    <div className="qc-price-difference-list">{differences.map((difference) => <article key={difference.id}><header><span>{difference.categoryLabel}</span><strong>{difference.rowName} · {difference.fieldLabel}</strong></header><div>{difference.versions.map((version) => <p key={version.priceVersionId}><span>{version.priceVersionName}</span><b>{formatCostSyncValue(difference.field, version.value)}</b>{version.independent && <small>独立</small>}</p>)}</div></article>)}</div>
  </Modal>;
}

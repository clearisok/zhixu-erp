"use client";

import { useMemo, useState } from "react";
import { Button, FormItem, Modal, SearchableSelect, StatusTag } from "@/components/foundation";
import { summarizeRevisionMetric } from "../model/quote-presentation";
import { formatFinalGarmentPrice } from "../model/final-quote-format";
import { getNextRevisionLabel, revisionLabelParts } from "../model/quote-revision-naming";
import { confirmationSummaryLabel } from "../model/quote-workflows";
import { BASE_PRICE_VERSION_NAME, type QuoteRevision, type QuoteRevisionReason, type SelectOption } from "../model/quote-view-model";
import type { EstimateCost } from "../model/quote-view-model";
import { readableEstimateQuote, type QuoteEditorData as Quote } from "../model/quote-editor-data";
import { EstimateCostPanel } from "./estimate-cost-panel";
import { PermissionButton } from "@/features/permissions";

const reasonOptions: SelectOption[] = ["客户调价", "面料价格变化", "辅料价格变化", "工价调整", "交期变化", "基础信息调整", "其他"].map((label) => ({ value: label, label }));

export function RevisionLabel({ revision, className = "" }: { revision: QuoteRevision; className?: string }) {
  const parts = revisionLabelParts(revision);
  return <span className={`qc-revision-label ${className}`.trim()}>{parts.main}{parts.branch && <sup>{parts.branch}</sup>}</span>;
}

function formatCreatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function confirmationText(revision: QuoteRevision) {
  const { confirmedCount, totalCount } = revision.confirmationSummary;
  return confirmedCount === 0 ? `0 / ${totalCount} 未确认` : `${confirmedCount} / ${totalCount} 已确认`;
}

type RevisionManagerModalProps = {
  serverError?: string;
  serverMode?: boolean;
  canViewSale?: boolean;
  open: boolean;
  quote: Quote;
  viewedRevisionId: string;
  canUpdate: boolean;
  canViewEstimate: boolean;
  canEditEstimate: boolean;
  onClose: () => void;
  onView: (revision: QuoteRevision) => void;
  onCanUpdate: (revision: QuoteRevision) => boolean;
  onCreate: (source: QuoteRevision, reason: QuoteRevisionReason, note: string) => Promise<void>;
  onEstimateChange: (estimate: EstimateCost) => void;
  onEstimateGenerate: (source: QuoteRevision, regenerate: boolean, sourcePriceVersionId?: string) => void;
  onEstimateSave?: () => Promise<void>;
  onEstimateIgnoreStale: () => void;
  onEstimateRestore: (historyId: string) => void;
};

export function RevisionManagerModal(props: RevisionManagerModalProps) {
  if (!props.open) return null;
  return <RevisionManagerDialog key={`${props.viewedRevisionId}-${props.quote.defaultRevisionId}`} {...props} />;
}

function RevisionManagerDialog({ serverMode = false, canViewSale = true, serverError, quote, viewedRevisionId, canUpdate, canViewEstimate, canEditEstimate, onClose, onView, onCanUpdate, onCreate, onEstimateChange, onEstimateGenerate, onEstimateIgnoreStale, onEstimateRestore, onEstimateSave }: RevisionManagerModalProps) {
  const [selectedId, setSelectedId] = useState<string>(viewedRevisionId || quote.defaultRevisionId);
  const [mode, setMode] = useState<"overview" | "update">("overview");
  const [reason, setReason] = useState<QuoteRevisionReason | "">("");
  const [note, setNote] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [copyDecisionOpen, setCopyDecisionOpen] = useState(false);
  const [copyBeforeUpdate, setCopyBeforeUpdate] = useState(true);
  const [sourcePriceId, setSourcePriceId] = useState("");

  const revisions = useMemo(() => [...quote.revisions].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [quote.revisions]);
  const estimateSelected = selectedId === "estimate-cost";
  const selected = revisions.find((revision) => revision.revisionId === selectedId) ?? revisions.find((revision) => revision.revisionId === quote.defaultRevisionId) ?? revisions[0];
  if (!selected) return null;
  const selectedSource = selected.priceVersions.find(p => p.id === sourcePriceId) ?? selected.priceVersions.find(p => p.name === BASE_PRICE_VERSION_NAME) ?? selected.priceVersions[0];
  const nextIdentity = getNextRevisionLabel({ selectedRevision: selected, allRevisions: revisions });
  const sourceRevision = selected.parentRevisionId ? revisions.find((revision) => revision.revisionId === selected.parentRevisionId) : null;

  const beginUpdate = () => {
    if (!serverMode) setSelectedId(quote.defaultRevisionId);
    setCopyDecisionOpen(true);
    if (!canUpdate) setCopyDecisionOpen(false);
  };

  const continueUpdate = (shouldCopy: boolean) => {
    setCopyDecisionOpen(false);
    if (!onCanUpdate(selected)) { onClose(); return; }
    setCopyBeforeUpdate(shouldCopy);
    setMode("update");
    setReason("");
    setNote("");
    setReasonError("");
  };

  const submitUpdate = () => {
    if (!reason) { setReasonError("请选择更新原因"); return; }
    return onCreate(selected, reason, note);
  };

  const footer = estimateSelected ? <Button variant="secondary" onClick={onClose}>关闭</Button> : mode === "overview" ? <>
    <Button variant="secondary" onClick={onClose}>关闭</Button>
    <PermissionButton permission="estimate.edit" disabled={!canEditEstimate} variant="secondary" onClick={() => onEstimateGenerate(selected, Boolean(quote.activeEstimateCost), serverMode ? selectedSource.id : undefined)}>生成估算成本</PermissionButton>
    <Button variant="secondary" onClick={() => { onView(selected); onClose(); }}>查看</Button>
    <PermissionButton permission="quote.revision.update" onClick={beginUpdate}>更新</PermissionButton>
  </> : <>
    <Button variant="secondary" onClick={() => setMode("overview")}>取消</Button>
    <Button type="submit" disabled={!reason}>确认创建新报价版本</Button>
  </>;

  return <><Modal open className="qc-revision-manager-modal" title="报价版本" description="集中查看、追溯并基于任意历史快照创建新的报价版本。" onClose={onClose} onSubmit={mode === "update" ? submitUpdate : undefined} footer={footer}>
    <div className="qc-revision-manager">
      {serverError && <div role="alert">{serverError}<Button variant="secondary" onClick={onClose}>关闭并核对</Button></div>}
      <div className="qc-revision-picker" aria-label="选择报价版本"><button type="button" disabled={!canViewEstimate} title={!canViewEstimate ? "暂无权限，请联系管理员" : undefined} className={`qc-revision-pill qc-estimate-pill ${estimateSelected ? "selected" : ""}`} onClick={() => { setSelectedId("estimate-cost"); setMode("overview"); }}><span>成本</span><span className="qc-revision-pill-badges">{!canViewEstimate ? <StatusTag tone="neutral">无查看权限</StatusTag> : quote.activeEstimateCost ? <StatusTag tone="active">已生成</StatusTag> : <StatusTag tone="neutral">未生成</StatusTag>}</span><small>内部估算口径</small></button>{revisions.map((revision) => {
        const isDefault = revision.revisionId === quote.defaultRevisionId;
        const confirmed = revision.confirmationSummary.confirmedCount > 0;
        const parent = revision.parentRevisionId ? revisions.find((item) => item.revisionId === revision.parentRevisionId) : null;
        return <button type="button" key={revision.revisionId} className={`qc-revision-pill ${revision.revisionId === selected.revisionId ? "selected" : ""}`} onClick={() => { setSelectedId(revision.revisionId); setMode("overview"); }}>
          <RevisionLabel revision={revision} />
          <span className="qc-revision-pill-badges">{isDefault && <StatusTag tone="success">当前默认</StatusTag>}{confirmed && <StatusTag tone="active">{revision.confirmationSummary.confirmedCount}/{revision.confirmationSummary.totalCount} 已确认</StatusTag>}{!isDefault && <StatusTag tone="neutral">历史</StatusTag>}</span>
          {parent && revision.branchSequence !== null && <small>源自 <RevisionLabel revision={parent} /></small>}
        </button>;
      })}<button type="button" disabled={!canUpdate} title={!canUpdate ? "暂无权限，请联系管理员" : undefined} className="qc-revision-pill qc-revision-add" onClick={beginUpdate}>＋ 更新报价版本</button></div>

      {estimateSelected && canViewEstimate ? <EstimateCostPanel key={quote.activeEstimateCost?.id ?? "empty"} quote={readableEstimateQuote(quote)} readOnly={!canEditEstimate} onSave={onEstimateSave} onChange={onEstimateChange} onGenerate={(regenerate) => onEstimateGenerate(revisions.find((item) => item.revisionId === quote.defaultRevisionId) ?? selected, regenerate)} onIgnoreStale={onEstimateIgnoreStale} onRestore={onEstimateRestore} /> : mode === "overview" ? <div className="qc-revision-overview">
        {serverMode && canViewEstimate && <FormItem label="估算来源价格版本"><select aria-label="估算来源价格版本" value={selectedSource.id} onChange={e => setSourcePriceId(e.target.value)}>{selected.priceVersions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></FormItem>}
        <header><div><small>报价版本</small><RevisionLabel revision={selected} className="large" /></div><span>{confirmationSummaryLabel(selected.confirmationSummary)}</span></header>
        <dl>
          <div><dt>更新原因</dt><dd>{selected.reason}</dd></div>
          <div><dt>补充说明</dt><dd>{selected.note || "—"}</dd></div>
          <div><dt>创建人</dt><dd>{selected.createdBy}</dd></div>
          <div><dt>创建时间</dt><dd>{formatCreatedAt(selected.createdAt)}</dd></div>
          <div><dt>价格版本</dt><dd>{selected.priceVersions.length} 个 · {selected.priceVersions.map((version) => version.name).join(" / ")}</dd></div>
          <div><dt>面料成本</dt><dd>{summarizeRevisionMetric(selected, (metrics) => metrics.fabricCost)} / 件</dd></div>
          <div><dt>辅料成本</dt><dd>{summarizeRevisionMetric(selected, (metrics) => metrics.trimCost)} / 件</dd></div>
          <div><dt>工价（折合 RMB）</dt><dd>{summarizeRevisionMetric(selected, (metrics) => metrics.laborRmb)} / 件</dd></div>
          <div><dt>其他费用</dt><dd>{summarizeRevisionMetric(selected, (metrics) => metrics.otherCost)} / 件</dd></div>
          <div><dt>成衣销售价</dt><dd>{canViewSale ? summarizeRevisionMetric(selected, (metrics) => metrics.garmentSellingPrice, formatFinalGarmentPrice) : "无权查看"} / 件</dd></div>
          <div><dt>客户确认</dt><dd>{confirmationText(selected)}</dd></div>
          <div><dt>来源关系</dt><dd>{sourceRevision ? <>基于 <RevisionLabel revision={sourceRevision} /></> : "初始报价版本"}</dd></div>
        </dl>
      </div> : <div className="qc-revision-update-form">
        <div className="qc-revision-route"><RevisionLabel revision={selected} /><span>→</span><span className="qc-revision-label">V{nextIdentity.mainlineVersion}{nextIdentity.branchSequence !== null && <sup>{nextIdentity.branchSequence}</sup>}</span></div>
        <p>{copyBeforeUpdate ? "将基于当前所选报价版本生成完整独立快照；来源报价版本永久保留只读。" : "将按现有更新流程创建最终报价快照，不预先生成中间副本；历史报价版本仍保持只读。"}</p>
        {selected.confirmationSummary.confirmedCount > 0 && <div className="qc-revision-confirmation-note">该来源含客户确认。新报价版本会保留来源关系，但有效客户确认将重置为未确认。</div>}
        <div className="qc-modal-form"><FormItem label="更新原因" required><SearchableSelect value={reason} options={reasonOptions} placeholder="请选择更新原因" onChange={(value) => { setReason(value as QuoteRevisionReason); setReasonError(""); }} /></FormItem>{reasonError && <p className="qc-form-alert">{reasonError}</p>}<FormItem label="补充说明"><textarea className="qc-control" value={note} onChange={(event) => setNote(event.target.value)} placeholder="可选，例如：客户要求调整面料供应商" /></FormItem></div>
      </div>}
    </div>
  </Modal>
  <Modal open={copyDecisionOpen} className="qc-revision-copy-confirm-modal" title="更新报价版本" description="此确认是进入报价版本更新流程的第一步。" onClose={() => setCopyDecisionOpen(false)} onSubmit={() => continueUpdate(true)} footer={<div className="qc-modal-footer-split"><Button variant="secondary" onClick={() => continueUpdate(false)}>否</Button><Button type="submit">是</Button></div>}>
    <p className="qc-unsaved-message">是否复制当前报价版本后再进行更新？复制后将基于当前报价版本生成新的版本快照，历史版本保留只读。</p>
  </Modal></>;
}

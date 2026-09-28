"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, FormItem, Modal, SearchableSelect } from "@/components/foundation";
import { customerSalespeopleForBrand, defaultBasicSettings, type BasicSettingsState } from "@/features/basic-settings/model/basic-settings";
import { loadBasicSettings } from "@/features/basic-settings/repository/basic-settings-repository";
import { masterSettingsAuthority } from "@/features/basic-settings/authority/master-settings-authority";
import { createServerQuoteMasterDependencies } from "@/features/basic-settings/server/quote-master-dependencies";
import { useServerSession } from "@/features/server-auth";
import { validateCopyQuoteStyleNo } from "../model/quote-copy";
import type { Quote, QuoteType } from "../model/quote-view-model";
import { mockQuoteRepository } from "../repository/mock-quote-repository";

type Draft = {
  brandId: string;
  salespersonId: string;
  quoteType: QuoteType;
  quoteStyleNo: string;
  styleName: string;
};

type CopyQuoteModalProps = {
  open: boolean;
  source: Quote | null;
  quotes: Quote[];
  createdBy: string;
  onClose: () => void;
  onCreated: (quote: Quote) => void;
};

export function CopyQuoteModal(props: CopyQuoteModalProps) {
  if (!props.open || !props.source) return null;
  return <CopyQuoteModalSession key={`${props.source.id}:${props.source.defaultRevisionId}`} {...props} source={props.source} />;
}

function CopyQuoteModalSession({ source, quotes, createdBy, onClose, onCreated }: Omit<CopyQuoteModalProps, "source"> & { source: Quote }) {
  const authority = masterSettingsAuthority();
  const session = useServerSession();
  const sourceRevision = source.revisions.find((item) => item.revisionId === source.defaultRevisionId) ?? null;
  const [masterData, setMasterData] = useState<BasicSettingsState>(defaultBasicSettings);
  const [mastersReady, setMastersReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (authority === "server" && (session.status !== "authenticated" || !session.hasPermission("quote.view"))) return;
    let active = true;
    void Promise.resolve().then(async () => authority === "server"
      ? (await createServerQuoteMasterDependencies(session.permissions).load()).state
      : loadBasicSettings()).then((state) => {
      if (active) { setMasterData(state); setMastersReady(true); }
    }).catch(() => { if (active) setError("基础资料读取失败；未回退 Browser。") });
    return () => { active = false; };
  }, [authority, session]);
  const [draft, setDraft] = useState<Draft>(() => ({
    brandId: sourceRevision?.baseInfo.brandId ?? "",
    salespersonId: sourceRevision?.baseInfo.salespersonId ?? "",
    quoteType: sourceRevision?.baseInfo.quoteType ?? "distribution",
    quoteStyleNo: "",
    styleName: sourceRevision?.baseInfo.styleName ?? "",
  }));
  const effectiveError = error || (authority === "server" && session.status === "anonymous" ? "需要先登录可信 Server 才能读取品牌和业务员。" : "");
  const brandOptions = useMemo(() => masterData.brands
    .filter((brand) => brand.status === "active" || brand.id === draft.brandId)
    .map((brand) => ({ value: brand.id, label: brand.name })), [draft.brandId, masterData.brands]);
  const salespersonOptions = useMemo(() => customerSalespeopleForBrand(masterData, draft.brandId)
    .filter((person) => person.status === "active" || person.id === draft.salespersonId)
    .map((person) => ({ value: person.id, label: person.name })), [draft.brandId, draft.salespersonId, masterData]);

  const submit = async () => {
    if (!mastersReady) { setError("基础资料尚未就绪"); return; }
    if (!sourceRevision) return;
    if (!draft.brandId) { setError("请选择品牌"); return; }
    if (!draft.salespersonId) { setError("请选择客户业务员"); return; }
    if (!draft.styleName.trim()) { setError("请填写款式名称"); return; }
    const styleNoIssue = validateCopyQuoteStyleNo(source, quotes, draft.quoteStyleNo);
    if (styleNoIssue === "required") { setError("请填写新款号"); return; }
    if (styleNoIssue) { setError("该款号已存在，请输入新的款号"); return; }
    const brand = masterData.brands.find((item) => item.id === draft.brandId);
    const salesperson = masterData.customerSalespeople.find((item) => item.id === draft.salespersonId && item.brandId === draft.brandId);
    if (!brand || !salesperson) { setError("品牌或客户业务员资料已变化，请重新选择"); return; }
    try {
      const copied = await mockQuoteRepository.copyFromDefaultRevision(source.id, {
        brandId: brand.id,
        brandName: brand.name,
        salespersonId: salesperson.id,
        salespersonName: salesperson.name,
        quoteType: draft.quoteType,
        quoteStyleNo: draft.quoteStyleNo,
        styleName: draft.styleName,
        today: new Date().toISOString().slice(0, 10),
        createdBy,
      });
      onCreated(copied);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "复制报价失败，请重试");
    }
  };

  return <Modal open className="qc-copy-quote-modal" title="复制报价" description={sourceRevision ? `来源：${sourceRevision.baseInfo.quoteStyleNo} · ${sourceRevision.baseInfo.styleName} · ${sourceRevision.revisionLabel}` : undefined} onClose={onClose} onSubmit={submit} footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button type="submit" disabled={!mastersReady}>确认复制</Button></>}>
    <div className="qc-modal-form qc-copy-quote-form">
      <FormItem label="新款号" required><input className={`qc-control ${error ? "qc-control-error" : ""}`} autoFocus value={draft.quoteStyleNo} onChange={(event) => { setDraft((current) => ({ ...current, quoteStyleNo: event.target.value })); setError(""); }} placeholder="必须输入新的款号" /></FormItem>
      <FormItem label="款式名称" required><input className="qc-control" value={draft.styleName} onChange={(event) => { setDraft((current) => ({ ...current, styleName: event.target.value })); setError(""); }} /></FormItem>
      <FormItem label="品牌" required><SearchableSelect value={draft.brandId} options={brandOptions} onChange={(brandId) => { setDraft((current) => ({ ...current, brandId, salespersonId: "" })); setError(""); }} /></FormItem>
      <FormItem label="客户业务员" required><SearchableSelect value={draft.salespersonId} options={salespersonOptions} onChange={(salespersonId) => { setDraft((current) => ({ ...current, salespersonId })); setError(""); }} disabled={!draft.brandId} /></FormItem>
      <FormItem label="报价类型" required><div className="qc-segmented"><button type="button" className={draft.quoteType === "distribution" ? "selected" : ""} onClick={() => setDraft((current) => ({ ...current, quoteType: "distribution" }))}>经销</button><button type="button" className={draft.quoteType === "processing" ? "selected" : ""} onClick={() => setDraft((current) => ({ ...current, quoteType: "processing" }))}>加工</button></div></FormItem>
      {effectiveError && <p className="qc-form-alert">{effectiveError}</p>}
    </div>
  </Modal>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell, Button, Card, FormItem, Modal, NullableNumberInput, PageContainer, PageHeader, Toast } from "@/components/foundation";
import { calculatePriceVersionMetrics, copyPriceVersion, numberOrZero } from "../model/quote-calculations";
import { createEmptyCostLine, createNavigationIntent, parseNumberDraft, patchCostLine, type CostCategory } from "../model/quote-editor-state";
import { applyCustomerConfirmation, createRevisionSnapshot, validateCustomerConfirmation } from "../model/quote-workflows";
import { getCurrentRevision, type CostLine, type PriceVersion, type Quote, type QuoteRevision } from "../model/quote-view-model";
import { mockQuoteRepository } from "../repository/mock-quote-repository";
import { applyDefaultsToEmptyQuoteFields, customerSalespeopleForBrand, defaultBasicSettings, type BasicSettingsState } from "../../basic-settings/model/basic-settings";
import { loadBasicSettings } from "../../basic-settings/repository/basic-settings-repository";
import { CostTable } from "./cost-table";
import { PriceVersionSelector } from "./price-version-selector";
import { QuoteBaseInfo } from "./quote-base-info";
import { QuoteMetrics } from "./quote-metrics";
import { QuotePricingSettings } from "./quote-pricing-settings";

type VersionModalState = { mode: "copy" | "edit"; sourceId: string } | null;

const statusLabel = { draft: "草稿", quoting: "报价中", partially_confirmed: "部分确认", confirmed: "全部确认" } as const;

function versionId() {
  return `price-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function costLineId(priceVersionId: string, category: CostCategory) {
  return `${priceVersionId}-${category}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function QuoteEditor({ initialQuote, isNew = false }: { initialQuote: Quote; isNew?: boolean }) {
  const router = useRouter();
  const [quote, setQuote] = useState<Quote>(initialQuote);
  const initialRevision = getCurrentRevision(initialQuote);
  const [activePriceId, setActivePriceId] = useState(initialRevision.priceVersions[0]?.id || "");
  const [versionModal, setVersionModal] = useState<VersionModalState>(null);
  const [versionDraft, setVersionDraft] = useState({ name: "", quantity: "", description: "" });
  const [versionError, setVersionError] = useState("");
  const [toast, setToast] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [masterData, setMasterData] = useState<BasicSettingsState>(defaultBasicSettings);
  const [stickyVisible, setStickyVisible] = useState(false);
  const titleSentinelRef = useRef<HTMLDivElement>(null);
  const defaultsStateRef = useRef({ rateTouched: false, trimsTouched: false, otherTouched: false, rateAuto: isNew && initialRevision.pricingParameters.usdCnyRate !== null, trimsAuto: false, otherAuto: false });
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [confirmationDraft, setConfirmationDraft] = useState({ labor: "", garment: "", note: "" });
  const [confirmationError, setConfirmationError] = useState("");
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionNoteDraft, setRevisionNoteDraft] = useState("");
  const revision = getCurrentRevision(quote);
  const activeVersion = revision.priceVersions.find((version) => version.id === activePriceId) ?? revision.priceVersions[0];
  const metrics = activeVersion ? calculatePriceVersionMetrics(activeVersion, revision.pricingParameters.laborCurrency, revision.pricingParameters.usdCnyRate, revision.pricingParameters.markupRate) : null;
  const brandOptions = masterData.brands.filter((brand) => brand.status === "active").map((brand) => ({ value: brand.id, label: brand.name, keywords: brand.code }));
  const salespersonOptions = customerSalespeopleForBrand(masterData, revision.baseInfo.brandId).map((person) => ({ value: person.id, label: person.name, keywords: person.code }));

  const updateRevision = (next: QuoteRevision) => {
    setQuote((current) => ({ ...current, revisions: current.revisions.map((item) => item.revisionId === next.revisionId ? next : item) }));
    setIsDirty(true);
  };
  const updateActiveVersion = (updater: (version: PriceVersion) => PriceVersion) => updateRevision({ ...revision, priceVersions: revision.priceVersions.map((version) => version.id === activeVersion.id ? updater(version) : version) });
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };

  useEffect(() => {
    if (!isDirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = true; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [isDirty]);

  useEffect(() => { Promise.resolve().then(() => setMasterData(loadBasicSettings())); }, []);

  useEffect(() => {
    const target = titleSentinelRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setStickyVisible(!entry.isIntersecting), { rootMargin: "-8px 0px 0px", threshold: 0 });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const requestNavigation = (target: string) => {
    const intent = createNavigationIntent(isDirty, target);
    if (intent.pendingTarget) setPendingNavigation(intent.pendingTarget);
    if (intent.navigateTo) router.push(intent.navigateTo);
  };

  const openVersionModal = (mode: "copy" | "edit", source: PriceVersion) => {
    setVersionError("");
    setVersionDraft({ name: mode === "copy" ? "" : source.name, quantity: source.quantity === null ? "" : String(source.quantity), description: source.description });
    setVersionModal({ mode, sourceId: source.id });
  };

  const submitVersionModal = () => {
    if (!versionModal) return;
    if (!versionDraft.name.trim()) { setVersionError("请填写价格版本名称"); return; }
    const quantity = parseNumberDraft(versionDraft.quantity);
    const source = revision.priceVersions.find((version) => version.id === versionModal.sourceId);
    if (!source) return;
    if (versionModal.mode === "edit") {
      updateRevision({ ...revision, priceVersions: revision.priceVersions.map((version) => version.id === source.id ? { ...version, name: versionDraft.name.trim(), quantity, description: versionDraft.description } : version) });
      notify("价格版本信息已更新");
    } else {
      const id = versionId();
      const copied = copyPriceVersion(source, { id, name: versionDraft.name.trim(), quantity, description: versionDraft.description });
      updateRevision({ ...revision, priceVersions: [...revision.priceVersions, copied], confirmationSummary: { confirmedCount: revision.confirmationSummary.confirmedCount, totalCount: revision.priceVersions.length + 1 } });
      setActivePriceId(id);
      notify("已复制当前价格版本，客户确认结果未复制");
    }
    setVersionModal(null);
  };

  const markCostGroupTouched = (category: CostCategory) => {
    if (category === "trims") { defaultsStateRef.current.trimsTouched = true; defaultsStateRef.current.trimsAuto = false; }
    if (category === "otherCosts") { defaultsStateRef.current.otherTouched = true; defaultsStateRef.current.otherAuto = false; }
  };
  const updateCostLine = (category: CostCategory, lineId: string, patch: Partial<CostLine>) => { markCostGroupTouched(category); updateActiveVersion((version) => ({ ...version, [category]: patchCostLine(version[category], lineId, patch) })); };
  const addCostLine = (category: CostCategory) => {
    markCostGroupTouched(category);
    const line = createEmptyCostLine(costLineId(activeVersion.id, category));
    updateActiveVersion((version) => ({ ...version, [category]: [...version[category], line] }));
  };
  const deleteCostLine = (category: CostCategory, lineId: string) => { markCostGroupTouched(category); updateActiveVersion((version) => ({ ...version, [category]: version[category].filter((line) => line.id !== lineId) })); };

  const persist = async () => {
    await mockQuoteRepository.save(quote);
    setIsDirty(false);
    notify("报价草稿已保存到 mock repository");
  };

  const save = async () => {
    await persist();
    if (isNew) window.setTimeout(() => router.replace(`/quote-center/detail?id=${encodeURIComponent(quote.id)}`), 350);
  };

  const saveAndNavigate = async () => {
    const target = pendingNavigation;
    await persist();
    setPendingNavigation(null);
    if (target) router.push(target);
  };

  const discardAndNavigate = () => {
    const target = pendingNavigation;
    setIsDirty(false);
    setPendingNavigation(null);
    if (target) router.push(target);
  };

  const openConfirmation = () => {
    const confirmation = activeVersion.confirmation;
    setConfirmationDraft({
      labor: confirmation?.confirmedLaborPrice === null || confirmation?.confirmedLaborPrice === undefined ? "" : String(confirmation.confirmedLaborPrice),
      garment: confirmation?.confirmedGarmentPrice === null || confirmation?.confirmedGarmentPrice === undefined ? "" : String(confirmation.confirmedGarmentPrice),
      note: confirmation?.note ?? "",
    });
    setConfirmationError("");
    setConfirmationOpen(true);
  };

  const saveConfirmation = async () => {
    const labor = parseNumberDraft(confirmationDraft.labor);
    const garment = parseNumberDraft(confirmationDraft.garment);
    const validationError = validateCustomerConfirmation(revision.baseInfo.quoteType, labor, garment);
    if (validationError) { setConfirmationError(validationError); return; }
    if (labor === null) return;
    const next = applyCustomerConfirmation(quote, activeVersion.id, labor, revision.baseInfo.quoteType === "distribution" ? garment : null, confirmationDraft.note);
    await mockQuoteRepository.save(next);
    setQuote(next);
    setIsDirty(false);
    setConfirmationOpen(false);
    notify(`已保存 ${activeVersion.name} 的客户确认`);
  };

  const createRevision = async () => {
    const next = createRevisionSnapshot(quote, revisionNoteDraft, "当前用户", new Date().toISOString(), `${quote.id}-revision-${Date.now()}`);
    await mockQuoteRepository.save(next);
    setQuote(next);
    setActivePriceId(getCurrentRevision(next).priceVersions[0]?.id ?? "");
    setIsDirty(false);
    setRevisionOpen(false);
    setRevisionNoteDraft("");
    notify(`已创建 ${getCurrentRevision(next).revisionLabel} 完整报价快照`);
  };

  const changeBrand = (value: string, option: { label: string }) => {
    const state = defaultsStateRef.current;
    const currentTrims = activeVersion?.trims ?? [];
    const currentOther = activeVersion?.otherCosts ?? [];
    let next: QuoteRevision = {
      ...revision,
      baseInfo: { ...revision.baseInfo, brandId: value, brandName: option.label, salespersonId: "", salespersonName: "" },
      pricingParameters: { ...revision.pricingParameters, usdCnyRate: state.rateAuto ? null : revision.pricingParameters.usdCnyRate },
      priceVersions: revision.priceVersions.map((version) => version.id === activeVersion?.id ? { ...version, trims: state.trimsAuto ? [] : version.trims, otherCosts: state.otherAuto ? [] : version.otherCosts } : version),
    };
    if (activeVersion) next = applyDefaultsToEmptyQuoteFields(next, activeVersion.id, masterData, value, "");
    const filledVersion = next.priceVersions.find((version) => version.id === activeVersion?.id);
    if (state.rateTouched) next = { ...next, pricingParameters: { ...next.pricingParameters, usdCnyRate: revision.pricingParameters.usdCnyRate } };
    if (state.trimsTouched || state.otherTouched) next = { ...next, priceVersions: next.priceVersions.map((version) => version.id !== activeVersion?.id ? version : ({ ...version, trims: state.trimsTouched ? currentTrims : version.trims, otherCosts: state.otherTouched ? currentOther : version.otherCosts })) };
    state.rateAuto = !state.rateTouched && next.pricingParameters.usdCnyRate !== null;
    state.trimsAuto = !state.trimsTouched && Boolean(filledVersion?.trims.length);
    state.otherAuto = !state.otherTouched && Boolean(filledVersion?.otherCosts.length);
    updateRevision(next);
  };

  const changeSalesperson = (value: string, option: { label: string }) => {
    const state = defaultsStateRef.current;
    const currentTrims = activeVersion?.trims ?? [];
    const currentOther = activeVersion?.otherCosts ?? [];
    let next: QuoteRevision = {
      ...revision,
      baseInfo: { ...revision.baseInfo, salespersonId: value, salespersonName: option.label },
      pricingParameters: { ...revision.pricingParameters, usdCnyRate: state.rateAuto ? null : revision.pricingParameters.usdCnyRate },
      priceVersions: revision.priceVersions.map((version) => version.id === activeVersion?.id ? { ...version, trims: state.trimsAuto ? [] : version.trims, otherCosts: state.otherAuto ? [] : version.otherCosts } : version),
    };
    if (activeVersion) next = applyDefaultsToEmptyQuoteFields(next, activeVersion.id, masterData, revision.baseInfo.brandId, value);
    const filledVersion = next.priceVersions.find((version) => version.id === activeVersion?.id);
    if (state.rateTouched) next = { ...next, pricingParameters: { ...next.pricingParameters, usdCnyRate: revision.pricingParameters.usdCnyRate } };
    if (state.trimsTouched || state.otherTouched) next = { ...next, priceVersions: next.priceVersions.map((version) => version.id !== activeVersion?.id ? version : ({ ...version, trims: state.trimsTouched ? currentTrims : version.trims, otherCosts: state.otherTouched ? currentOther : version.otherCosts })) };
    state.rateAuto = !state.rateTouched && next.pricingParameters.usdCnyRate !== null;
    state.trimsAuto = !state.trimsTouched && Boolean(filledVersion?.trims.length);
    state.otherAuto = !state.otherTouched && Boolean(filledVersion?.otherCosts.length);
    updateRevision(next);
  };

  const changeRate = (usdCnyRate: number | null) => {
    defaultsStateRef.current.rateTouched = true;
    defaultsStateRef.current.rateAuto = false;
    updateRevision({ ...revision, pricingParameters: { ...revision.pricingParameters, usdCnyRate } });
  };

  if (!activeVersion) return null;

  return <AppShell title={isNew ? "新建报价" : "款式报价明细"} onRequestNavigation={requestNavigation}><PageContainer>
    <div ref={titleSentinelRef} className="qc-title-sentinel"><PageHeader eyebrow="QUOTE WORKSPACE" title={isNew ? "新建报价" : `${quote.quoteCode} · ${revision.baseInfo.styleName}`} actions={<><Button variant="secondary" onClick={() => requestNavigation("/quote-center")}>返回列表</Button>{!isNew && <Button variant="secondary" onClick={openConfirmation}>客户确认</Button>}{!isNew && <Button variant="secondary" onClick={() => setRevisionOpen(true)}>版本更新</Button>}<Button onClick={save}>保存草稿</Button></>} /></div>
    <div className={`qc-sticky-header ${stickyVisible ? "is-visible" : ""}`} aria-hidden={!stickyVisible}><div><span>{quote.quoteCode}</span><strong>{isNew ? "新建报价" : revision.baseInfo.styleName || "款式报价明细"}</strong></div><nav><Button variant="secondary" onClick={() => requestNavigation("/quote-center")}>返回列表</Button>{!isNew && <Button variant="secondary" onClick={openConfirmation}>客户确认</Button>}{!isNew && <Button variant="secondary" onClick={() => setRevisionOpen(true)}>版本更新</Button>}<Button onClick={save}>保存草稿</Button></nav></div>
    <div className="qc-quote-meta"><span>当前 Revision <strong>{revision.revisionLabel}</strong></span><i /><span>汇总状态 <strong>{statusLabel[quote.aggregateStatus]}</strong></span><i /><span>创建人 <strong>{revision.createdBy}</strong></span></div>
    <QuoteBaseInfo revision={revision} brandOptions={brandOptions} salespersonOptions={salespersonOptions} onBrandChange={changeBrand} onSalespersonChange={changeSalesperson} onChange={updateRevision} />
    <QuotePricingSettings revision={revision} onChange={updateRevision} onRateChange={changeRate} />
    <QuoteMetrics version={activeVersion} laborCurrency={revision.pricingParameters.laborCurrency} usdCnyRate={revision.pricingParameters.usdCnyRate} markupRate={revision.pricingParameters.markupRate} />
    <section className="qc-cost-heading"><div><span className="qc-section-index">03</span><div><h2>{activeVersion.name} · 成本明细</h2><p>正在编辑当前价格版本；切换 Card 后将进入对应的独立成本对象。</p></div></div></section>
    <div className="qc-cost-stack">
      <CostTable title="面料成本" description="单件用量 × 单价 × (1 + 损耗率)" namePlaceholder="请输入面料名称" subtotalLabel="面料小计" lines={activeVersion.fabrics} onChange={(id, patch) => updateCostLine("fabrics", id, patch)} onAdd={() => addCostLine("fabrics")} onDelete={(id) => deleteCostLine("fabrics", id)} />
      <CostTable title="辅料成本" description="唛、扣、拉链、包装等单件成本" namePlaceholder="请输入辅料名称" subtotalLabel="辅料小计" lines={activeVersion.trims} onChange={(id, patch) => updateCostLine("trims", id, patch)} onAdd={() => addCostLine("trims")} onDelete={(id) => deleteCostLine("trims", id)} />
      <Card className="qc-labor-card"><header><div><h3>工价</h3><p>加工币种仅决定输入数字的货币口径，切换币种不会改写数值。</p></div><span>{revision.pricingParameters.laborCurrency} / 件</span></header><div><FormItem label={`原始工价（${revision.pricingParameters.laborCurrency} / 件）`}><NullableNumberInput className="qc-control" min="0" placeholder="请输入工价" value={activeVersion.labor.value} onValueChange={(value) => updateActiveVersion((version) => ({ ...version, labor: { ...version.labor, value } }))} /></FormItem><FormItem label="工价说明"><input className="qc-control" value={activeVersion.labor.description} onChange={(event) => updateActiveVersion((version) => ({ ...version, labor: { ...version.labor, description: event.target.value } }))} /></FormItem>{revision.pricingParameters.laborCurrency === "USD" && <div className="qc-labor-conversion"><span>USD/CNY 汇率 {numberOrZero(revision.pricingParameters.usdCnyRate).toFixed(2)}</span><strong>折合 ¥{(numberOrZero(activeVersion.labor.value) * numberOrZero(revision.pricingParameters.usdCnyRate)).toFixed(2)} RMB / 件</strong></div>}</div></Card>
      <CostTable title="其他费用" description="包装、运输、管理分摊等费用" namePlaceholder="请输入费用名称" lines={activeVersion.otherCosts} onChange={(id, patch) => updateCostLine("otherCosts", id, patch)} onAdd={() => addCostLine("otherCosts")} onDelete={(id) => deleteCostLine("otherCosts", id)} />
    </div>
    <PriceVersionSelector versions={revision.priceVersions} activeId={activeVersion.id} onSelect={setActivePriceId} onEdit={(version) => openVersionModal("edit", version)} onCopy={() => openVersionModal("copy", activeVersion)} />

    <Modal open={Boolean(versionModal)} title={versionModal?.mode === "copy" ? "复制当前价格版本" : "编辑价格版本"} description={versionModal?.mode === "copy" ? "复制面料、辅料、工价和其他费用；不会复制客户确认结果。" : "修改名称、数量和说明，不改变该版本成本。"} onClose={() => setVersionModal(null)} footer={<><Button variant="secondary" onClick={() => setVersionModal(null)}>取消</Button><Button onClick={submitVersionModal}>{versionModal?.mode === "copy" ? "确认复制" : "保存修改"}</Button></>}><div className="qc-modal-form"><FormItem label="价格版本名称" required><input className={`qc-control ${versionError ? "qc-control-error" : ""}`} autoFocus value={versionDraft.name} placeholder="请填写价格版本名称" onChange={(event) => { setVersionDraft({ ...versionDraft, name: event.target.value }); if (versionError) setVersionError(""); }} /></FormItem>{versionError && <p className="qc-form-alert">{versionError}</p>}<FormItem label="数量" required><input className="qc-control" inputMode="decimal" placeholder="请输入数量" value={versionDraft.quantity} onChange={(event) => { if (/^\d*(?:\.\d*)?$/.test(event.target.value)) setVersionDraft({ ...versionDraft, quantity: event.target.value }); }} /></FormItem><FormItem label="说明"><textarea className="qc-control" value={versionDraft.description} onChange={(event) => setVersionDraft({ ...versionDraft, description: event.target.value })} /></FormItem></div></Modal>
    <Modal open={Boolean(pendingNavigation)} title="有未保存的修改" description="当前报价还有尚未保存的修改。离开后这些修改将丢失。" onClose={() => setPendingNavigation(null)} footer={<><Button variant="danger" onClick={discardAndNavigate}>放弃修改</Button><Button variant="secondary" onClick={() => setPendingNavigation(null)}>继续编辑</Button><Button onClick={saveAndNavigate}>保存并返回</Button></>}><p className="qc-unsaved-message">你可以保存当前报价后返回，也可以放弃本次修改。</p></Modal>
    <Modal open={confirmationOpen} title={`客户确认 · ${activeVersion.name}`} description={`确认结果归属于当前 ${revision.revisionLabel} 下的当前价格版本，不会覆盖报价测算值。`} onClose={() => setConfirmationOpen(false)} footer={<><Button variant="secondary" onClick={() => setConfirmationOpen(false)}>取消</Button><Button onClick={saveConfirmation}>保存确认</Button></>}>
      <div className="qc-confirmation-quoted"><span><small>报价工价</small><strong>{numberOrZero(activeVersion.labor.value).toFixed(2)} {revision.pricingParameters.laborCurrency} / 件</strong></span>{revision.baseInfo.quoteType === "distribution" && <span><small>报价成衣销售单价</small><strong>¥{numberOrZero(metrics?.garmentSellingPrice ?? null).toFixed(2)} RMB / 件</strong></span>}</div>
      <div className="qc-modal-form"><FormItem label={`确认工价（${revision.pricingParameters.laborCurrency} / 件）`} required><input className="qc-control" inputMode="decimal" value={confirmationDraft.labor} onChange={(event) => { if (/^\d*(?:\.\d*)?$/.test(event.target.value)) setConfirmationDraft({ ...confirmationDraft, labor: event.target.value }); }} placeholder="请输入确认工价" /></FormItem>{revision.baseInfo.quoteType === "distribution" && <FormItem label="确认成衣价格（RMB / 件）" required><input className="qc-control" inputMode="decimal" value={confirmationDraft.garment} onChange={(event) => { if (/^\d*(?:\.\d*)?$/.test(event.target.value)) setConfirmationDraft({ ...confirmationDraft, garment: event.target.value }); }} placeholder="请输入确认成衣价格" /></FormItem>}<FormItem label="确认备注"><textarea className="qc-control" value={confirmationDraft.note} onChange={(event) => setConfirmationDraft({ ...confirmationDraft, note: event.target.value })} placeholder="可选" /></FormItem>{confirmationError && <p className="qc-form-alert">{confirmationError}</p>}</div>
    </Modal>
    <Modal open={revisionOpen} title="版本更新" description={`基于当前 ${revision.revisionLabel} 的完整内容创建新 Revision；旧版本会保留并转为只读。`} onClose={() => setRevisionOpen(false)} footer={<><Button variant="secondary" onClick={() => setRevisionOpen(false)}>取消</Button><Button onClick={createRevision}>确认创建新版本</Button></>}><div className="qc-revision-preview"><span>{revision.revisionLabel}</span><i>→</i><strong>V{Math.max(0, ...quote.revisions.map((item) => Number(item.revisionLabel.replace(/^V/i, "")) || 0)) + 1}</strong></div><div className="qc-modal-form"><FormItem label="新版本说明"><textarea className="qc-control" value={revisionNoteDraft} onChange={(event) => setRevisionNoteDraft(event.target.value)} placeholder="例如：客户调整数量与辅料价格" /></FormItem></div></Modal>
    <Toast message={toast} />
  </PageContainer></AppShell>;
}

export function QuoteDetailLoader() {
  const [quote, setQuote] = useState<Quote | null | undefined>(undefined);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id") || "quote-001";
    mockQuoteRepository.getById(id).then(setQuote);
  }, []);
  if (quote === undefined) return <AppShell title="载入报价"><PageContainer><div className="loading-screen qc-inline-loading"><div className="loading-mark">纫</div><strong>正在载入报价</strong><span /></div></PageContainer></AppShell>;
  if (!quote) return <AppShell title="报价不存在"><PageContainer><Card className="qc-not-found"><strong>没有找到这张报价</strong><p>该 mock 报价可能已随浏览器会话结束而清除。</p><Button onClick={() => window.location.assign("/quote-center")}>返回报价中心</Button></Card></PageContainer></AppShell>;
  return <QuoteEditor initialQuote={quote} />;
}

export function QuoteNewLoader() {
  const [quote, setQuote] = useState<Quote | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    mockQuoteRepository.createDraft(today).then(setQuote);
  }, []);
  if (!quote) return <AppShell title="新建报价"><PageContainer><div className="loading-screen qc-inline-loading"><div className="loading-mark">纫</div><strong>正在准备报价草稿</strong><span /></div></PageContainer></AppShell>;
  return <QuoteEditor initialQuote={quote} isNew />;
}

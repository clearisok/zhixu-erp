"use client";

import type { KeyboardEvent } from "react";
import { StatusTag } from "@/components/foundation";
import { formatMoney, nullablePriceVersionMetrics } from "../model/quote-presentation";
import { formatFinalGarmentPrice } from "../model/final-quote-format";
import type { PriceVersion, QuoteRevision } from "../model/quote-view-model";
import { PermissionButton } from "@/features/permissions";

export function PriceVersionSelector({ revision, activeId, readOnly = false, canEdit = true, sectionId, activeConfirmation, snapshotLabels = false, onSelect, onEdit }: {
  revision: QuoteRevision;
  activeId: string;
  readOnly?: boolean;
  canEdit?: boolean;
  sectionId?: string;
  activeConfirmation?: { label: string; detail?: string };
  snapshotLabels?: boolean;
  onSelect: (id: string) => void;
  onEdit: (version: PriceVersion) => void;
}) {
  const keySelect = (event: KeyboardEvent<HTMLElement>, id: string) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(id); }
  };
  return <section id={sectionId} className={`qc-version-section ${sectionId ? "qc-page-section-anchor" : ""}`.trim()} data-validation-anchor="price-versions"><header><div><span className="eyebrow">PRICE VERSION</span><h2>价格版本</h2><p>素色、彩条等并列价格口径；整张卡片用于切换当前查看内容。</p></div></header><div className="qc-version-scroll">{revision.priceVersions.map((version) => {
    const active = version.id === activeId;
    const metrics = nullablePriceVersionMetrics(version);
    const confirmation = version.confirmation;
    const productionLabel = version.pricingParameters.manufacturingPresetName || version.pricingParameters.manufacturingCountry || "未设置制作国家";
    return <article key={version.id} className={`qc-version-card ${active ? "active" : ""}`} role="button" tabIndex={0} aria-pressed={active} onClick={() => onSelect(version.id)} onKeyDown={(event) => keySelect(event, version.id)}>
      <div className="qc-version-actions">{!readOnly ? canEdit ? <button type="button" onClick={(event) => { event.stopPropagation(); onEdit(version); }}>编辑</button> : <PermissionButton permission="quote.edit" variant="text" onClick={(event) => event.stopPropagation()}>编辑</PermissionButton> : <span>只读快照</span>}<StatusTag tone={active ? "success" : "neutral"}>{active ? "当前查看" : "可切换"}</StatusTag></div>
      <h3>{version.name}<span>· {productionLabel}</span></h3>
      <div className="qc-version-facts"><span><small>数量</small><strong>{version.quantity === null ? "—" : `${version.quantity.toLocaleString()} 件`}</strong></span><span><small>测算销售单价</small><strong>{formatFinalGarmentPrice(metrics.garmentSellingPrice)}</strong></span></div>
      {active && activeConfirmation ? <div className="qc-version-confirmation"><span>{activeConfirmation.label}</span>{activeConfirmation.detail && <small>{activeConfirmation.detail}</small>}</div> : <div className={`qc-version-confirmation ${confirmation ? "confirmed" : ""}`}><span>{confirmation ? "已客户确认" : "未客户确认"}{snapshotLabels ? "（快照）" : ""}</span>{confirmation && <small>工价 {(confirmation.confirmedLaborPrice === undefined ? "无权查看" : formatMoney(confirmation.confirmedLaborPrice))}{revision.baseInfo.quoteType === "distribution" ? ` · 成衣 ${(confirmation.confirmedGarmentPrice === undefined ? "无权查看" : formatMoney(confirmation.confirmedGarmentPrice))}` : ""}</small>}</div>}
      <p>{version.description || "暂无说明"}</p>
    </article>;
  })}</div></section>;
}

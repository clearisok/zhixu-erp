"use client";

import type { KeyboardEvent } from "react";
import { Button, StatusTag } from "@/components/foundation";
import type { PriceVersion } from "../model/quote-view-model";

export function PriceVersionSelector({ versions, activeId, onSelect, onEdit, onCopy }: { versions: PriceVersion[]; activeId: string; onSelect: (id: string) => void; onEdit: (version: PriceVersion) => void; onCopy: () => void }) {
  const keySelect = (event: KeyboardEvent<HTMLElement>, id: string) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(id); } };
  return <section className="qc-version-section"><header><div><span className="eyebrow">PRICE VERSION</span><h2>价格版本</h2><p>每个价格版本拥有独立成本；点击整张卡片切换当前查看内容。</p></div><Button variant="secondary" onClick={onCopy}>复制当前价格版本</Button></header><div className="qc-version-scroll">{versions.map((version) => { const active = version.id === activeId; return <article key={version.id} className={`qc-version-card ${active ? "active" : ""}`} role="button" tabIndex={0} aria-pressed={active} onClick={() => onSelect(version.id)} onKeyDown={(event) => keySelect(event, version.id)}><div className="qc-version-actions"><button type="button" onClick={(event) => { event.stopPropagation(); onEdit(version); }}>编辑</button><StatusTag tone={active ? "success" : "neutral"}>{active ? "当前查看" : "可切换"}</StatusTag></div><h3>{version.name}</h3><strong>{(version.quantity ?? 0).toLocaleString()} 件</strong><p>{version.description || "暂无说明"}</p></article>; })}</div></section>;
}

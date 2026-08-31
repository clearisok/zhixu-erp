"use client";

import type { ReactNode } from "react";

export function Workspace({ header, navigation, children, context, saveBar, className = "" }: { header?: ReactNode; navigation?: ReactNode; children: ReactNode; context?: ReactNode; saveBar?: ReactNode; className?: string }) {
  return <section className={`qc-workspace ${className}`.trim()}>{header}{navigation}<div className="qc-workspace-layout"><main className="qc-workspace-main">{children}</main>{context && <aside className="qc-workspace-context">{context}</aside>}</div>{saveBar}</section>;
}

export function SectionNavigation({ sections, activeId, onNavigate, label = "页面章节" }: { sections: Array<{ id: string; label: ReactNode; meta?: ReactNode }>; activeId?: string; onNavigate?: (id: string) => void; label?: string }) {
  return <nav className="qc-section-navigation" aria-label={label}>{sections.map((section) => <button key={section.id} type="button" className={section.id === activeId ? "active" : ""} aria-current={section.id === activeId ? "location" : undefined} onClick={() => { onNavigate?.(section.id); if (!onNavigate) document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}><span>{section.label}</span>{section.meta && <small>{section.meta}</small>}</button>)}</nav>;
}

export function ContextSummary({ items, title, actions, collapsible = false }: { items: Array<{ key: string; label: ReactNode; value: ReactNode; tone?: "default" | "positive" | "warning" | "danger" }>; title?: ReactNode; actions?: ReactNode; collapsible?: boolean }) {
  const content = <div className="qc-context-summary-grid">{items.map((item) => <div key={item.key} data-tone={item.tone ?? "default"}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>;
  if (collapsible) return <details className="qc-context-summary" open><summary>{title ?? "当前摘要"}</summary>{content}{actions && <aside>{actions}</aside>}</details>;
  return <section className="qc-context-summary">{(title || actions) && <header>{title && <strong>{title}</strong>}{actions}</header>}{content}</section>;
}

export function MasterDetail({ master, detail, selected = false, masterLabel = "列表", detailLabel = "详情", className = "" }: { master: ReactNode; detail: ReactNode; selected?: boolean; masterLabel?: string; detailLabel?: string; className?: string }) {
  return <div className={`qc-master-detail ${className}`.trim()} data-selected={selected || undefined}><aside aria-label={masterLabel}>{master}</aside><section aria-label={detailLabel}>{detail}</section></div>;
}

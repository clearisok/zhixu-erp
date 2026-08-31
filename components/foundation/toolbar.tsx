"use client";

import { useState, type ReactNode } from "react";
import { Button } from "./button";
import { Card } from "./card";
import { MobileSheet } from "./mobile-sheet";

export function Toolbar({ search, filters, moreFilters, resultSummary, actions, viewActions, className = "", mobileFilterTitle = "筛选" }: { search?: ReactNode; filters?: ReactNode; moreFilters?: ReactNode; resultSummary?: ReactNode; actions?: ReactNode; viewActions?: ReactNode; className?: string; mobileFilterTitle?: string }) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  return <>
    <Card className={`qc-toolbar ${className}`.trim()}>
      <div className="qc-toolbar-query">
        {search}
        {filters && <div className="qc-toolbar-filters">{filters}</div>}
        {moreFilters && <div className="qc-toolbar-desktop-more">{moreFilters}</div>}
        {moreFilters && <Button className="qc-toolbar-more-filters" variant="secondary" onClick={() => setFiltersOpen(true)}>筛选</Button>}
      </div>
      {resultSummary && <div className="qc-toolbar-summary">{resultSummary}</div>}
      {(viewActions || actions) && <div className="qc-toolbar-actions">{viewActions}{actions}</div>}
    </Card>
    {moreFilters && <MobileSheet open={filtersOpen} title={mobileFilterTitle} onClose={() => setFiltersOpen(false)} footer={<Button onClick={() => setFiltersOpen(false)}>查看结果</Button>}><div className="qc-toolbar-sheet-fields">{moreFilters}</div></MobileSheet>}
  </>;
}

export function SearchField({ value, onChange, placeholder = "搜索", label = "搜索" }: { value: string; onChange: (value: string) => void; placeholder?: string; label?: string }) {
  return <label className="qc-search-field"><span aria-hidden="true">⌕</span><span className="sr-only">{label}</span><input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={label} /></label>;
}

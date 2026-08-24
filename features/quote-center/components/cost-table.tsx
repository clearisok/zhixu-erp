"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, Card, CreatableCombobox, NullableNumberInput } from "@/components/foundation";
import type { FabricLibraryItem, TrimLibraryItem } from "../../basic-settings/model/basic-settings";
import {
  costLineAmount,
  fabricConsumption,
  fabricCostAmount,
  sumCostLines,
  sumFabricCosts,
} from "../model/quote-calculations";
import type { CostLine, FabricCostLine, OtherCostLine, TrimCostLine } from "../model/quote-view-model";

type MaterialComboboxProps<T extends { id: string }> = {
  ariaLabel: string;
  value: string;
  options: T[];
  placeholder: string;
  status: MaterialSourceStatus | null;
  getSearchText: (option: T) => string;
  renderOption: (option: T) => ReactNode;
  onInputChange: (value: string) => void;
  onSelect: (option: T) => void;
};

type MaterialSourceStatus = "fabric-library" | "trim-library" | "modified" | "manual";

const sourceLabels: Record<MaterialSourceStatus, string> = {
  "fabric-library": "库",
  "trim-library": "库",
  modified: "已修改",
  manual: "手工",
};

const sourceTitles: Record<MaterialSourceStatus, string> = {
  "fabric-library": "来自面料库",
  "trim-library": "来自辅料库",
  modified: "本报价已修改",
  manual: "手工输入",
};

type PortalPosition = { top: number; left: number; placement: "above" | "below" };

function MaterialCombobox<T extends { id: string }>({
  ariaLabel,
  value,
  options,
  placeholder,
  status,
  getSearchText,
  renderOption,
  onInputChange,
  onSelect,
}: MaterialComboboxProps<T>) {
  const root = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<PortalPosition | null>(null);
  const normalizedQuery = value.normalize("NFKC").trim().toLocaleLowerCase("zh-CN");
  const filtered = useMemo(
    () => options.filter((option) => getSearchText(option).normalize("NFKC").toLocaleLowerCase("zh-CN").includes(normalizedQuery)),
    [getSearchText, normalizedQuery, options],
  );

  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !popover.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const updatePosition = useCallback(() => {
    const anchor = root.current?.getBoundingClientRect();
    if (!anchor) return;
    const width = Math.min(400, window.innerWidth - 24);
    const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
    const placement = window.innerHeight - anchor.bottom < 320 && anchor.top > 320 ? "above" : "below";
    setPosition({ top: placement === "above" ? anchor.top - 6 : anchor.bottom + 6, left, placement });
  }, []);

  useEffect(() => {
    if (!open) return;
    const reposition = (event: Event) => {
      if (event.target instanceof Node && popover.current?.contains(event.target)) return;
      updatePosition();
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, updatePosition]);

  const choose = (option: T) => {
    onSelect(option);
    setActiveIndex(0);
    setOpen(false);
  };

  const openDropdown = () => {
    updatePosition();
    setActiveIndex(0);
    setOpen(true);
  };

  const portalStyle: CSSProperties | undefined = position ? {
    top: position.top,
    left: position.left,
    transform: position.placement === "above" ? "translateY(-100%)" : undefined,
  } : undefined;

  return <div className="qc-material-field" ref={root}>
    {status && <span className={`qc-source-badge is-${status}`} title={sourceTitles[status]}>{sourceLabels[status]}</span>}
    <input
      className={status ? "has-source-badge" : ""}
      aria-label={ariaLabel}
      aria-autocomplete="list"
      aria-controls={listboxId}
      aria-expanded={open}
      aria-activedescendant={open && filtered[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined}
      role="combobox"
      value={value}
      placeholder={placeholder}
      onFocus={openDropdown}
      onChange={(event) => { setActiveIndex(0); onInputChange(event.target.value); updatePosition(); setOpen(true); }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActiveIndex((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0))); }
        if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((current) => Math.max(current - 1, 0)); }
        if (event.key === "Enter" && open && filtered[activeIndex]) { event.preventDefault(); choose(filtered[activeIndex]); }
        if (event.key === "Escape") setOpen(false);
      }}
    />
    {open && position && typeof document !== "undefined" && createPortal(<div className="qc-material-popover qc-material-popover-portal" ref={popover} id={listboxId} role="listbox" style={portalStyle}>
      {filtered.map((option, index) => <button
        id={`${listboxId}-option-${index}`}
        type="button"
        role="option"
        aria-selected={index === activeIndex}
        className={index === activeIndex ? "active" : ""}
        key={option.id}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => choose(option)}
      >{renderOption(option)}</button>)}
      {!filtered.length && <p>库中无匹配项，可继续自由输入</p>}
    </div>, document.body)}
  </div>;
}

const nullable = (value: number | null, suffix = "") => value === null ? "—" : `${value}${suffix}`;
const same = (left: unknown, right: unknown) => (left ?? null) === (right ?? null);

function fabricStatus(line: FabricCostLine, library: FabricLibraryItem[]): MaterialSourceStatus | null {
  const hasManualValue = Boolean(line.name.trim() || line.composition.trim() || line.supplier.trim() || line.segmentLengthCm !== null || line.netWidthCm !== null || line.gsm !== null || line.lossRate !== null || line.unitPrice !== null);
  if (!line.sourceLibraryItemId) return hasManualValue ? "manual" : null;
  const source = library.find((item) => item.id === line.sourceLibraryItemId);
  if (!source) return "modified";
  const unchanged = line.name === source.name
    && line.composition === source.composition
    && same(line.netWidthCm, source.netWidthCm)
    && same(line.gsm, source.gsm)
    && same(line.lossRate, source.defaultLossRate)
    && line.supplier === source.supplier
    && same(line.unitPrice, source.unitPrice)
    && line.purchaseUnit === source.purchaseUnit;
  return unchanged ? "fabric-library" : "modified";
}

function trimStatus(line: TrimCostLine, library: TrimLibraryItem[]): MaterialSourceStatus | null {
  const hasManualValue = Boolean(line.name.trim() || line.specification.trim() || line.supplier.trim() || line.usage !== null || line.unit.trim() || line.lossRate !== null || line.unitPrice !== null);
  if (!line.sourceLibraryItemId) return hasManualValue ? "manual" : null;
  const source = library.find((item) => item.id === line.sourceLibraryItemId);
  if (!source) return "modified";
  const unchanged = line.name === source.name
    && line.specification === source.specification
    && line.supplier === source.supplier
    && line.unit === source.unit
    && same(line.lossRate, source.defaultLossRate)
    && same(line.unitPrice, source.unitPrice);
  return unchanged ? "trim-library" : "modified";
}

function fabricConsumptionValue(line: FabricCostLine): number | null {
  if (line.segmentLengthCm === null) return null;
  if (line.purchaseUnit === "kg" && (line.netWidthCm === null || line.gsm === null)) return null;
  return fabricConsumption(line);
}

function fabricCostValue(line: FabricCostLine): number | null {
  return fabricConsumptionValue(line) === null || line.unitPrice === null ? null : fabricCostAmount(line);
}

function costLineValue(line: CostLine): number | null {
  return line.usage === null || line.unitPrice === null ? null : costLineAmount(line);
}

function ReadOnlyMetric({ value, prefix = "", suffix }: { value: number | null; prefix?: string; suffix?: string }) {
  return <div className={`qc-readonly-metric ${value === null ? "is-empty" : ""}`}>
    <strong>{value === null ? "—" : `${prefix}${value.toFixed(prefix ? 2 : 4)}`}</strong>
    {value !== null && suffix && <small>{suffix}</small>}
  </div>;
}

function RowActions({ type, name, onSave, onDelete }: { type: "面料" | "辅料"; name: string; onSave: () => void; onDelete: () => void }) {
  return <div className="qc-compact-actions">
    <button type="button" className="save" title={`保存到${type}库`} aria-label={`保存${name || type}到${type}库`} onClick={onSave}><span aria-hidden>↧</span></button>
    <button type="button" className="delete" title="删除本行" aria-label={`删除${name || type}`} onClick={onDelete}><span aria-hidden>×</span></button>
  </div>;
}

function CompactCostField({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return <label className={`qc-compact-cost-field ${className}`}><span>{label}</span>{children}</label>;
}

function CompactResult({ label, value, prefix = "", suffix }: { label: string; value: number | null; prefix?: string; suffix?: string }) {
  return <span className="qc-compact-cost-result"><small>{label}</small><ReadOnlyMetric value={value} prefix={prefix} suffix={suffix} /></span>;
}

function useCostRendererFocusBridge() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = root.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    let lastFocused: HTMLInputElement | null = null;
    let lastDraft = "";
    let lastSelectionStart: number | null = null;
    let lastSelectionEnd: number | null = null;
    let frame = 0;

    const rememberFocus = (event: FocusEvent) => {
      if (event.target instanceof HTMLInputElement && event.target.getAttribute("aria-label")) {
        lastFocused = event.target;
        lastDraft = event.target.value;
        lastSelectionStart = event.target.selectionStart;
        lastSelectionEnd = event.target.selectionEnd;
      }
    };
    const rememberDraft = (event: Event) => {
      if (event.target instanceof HTMLInputElement && event.target === lastFocused) {
        lastDraft = event.target.value;
        lastSelectionStart = event.target.selectionStart;
        lastSelectionEnd = event.target.selectionEnd;
      }
    };
    const transferFocus = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!lastFocused || !container.contains(lastFocused)) return;
        const active = document.activeElement;
        if (active !== document.body && active !== lastFocused && !container.contains(active)) return;
        if (lastFocused.getClientRects().length > 0) return;
        const label = lastFocused.getAttribute("aria-label");
        if (!label) return;
        const replacement = Array.from(container.querySelectorAll<HTMLInputElement>("input[aria-label]"))
          .find((input) => input !== lastFocused && input.getAttribute("aria-label") === label && input.getClientRects().length > 0);
        if (!replacement) return;

        const draft = lastDraft;
        const selectionStart = lastSelectionStart;
        const selectionEnd = lastSelectionEnd;
        replacement.focus({ preventScroll: true });
        if (replacement.value !== draft) {
          frame = requestAnimationFrame(() => {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
            setter?.call(replacement, draft);
            if (selectionStart !== null && selectionEnd !== null) replacement.setSelectionRange(selectionStart, selectionEnd);
          });
        } else if (selectionStart !== null && selectionEnd !== null) {
          replacement.setSelectionRange(selectionStart, selectionEnd);
        }
        lastFocused = replacement;
      });
    };

    container.addEventListener("focusin", rememberFocus);
    container.addEventListener("input", rememberDraft);
    const observer = new ResizeObserver(transferFocus);
    observer.observe(container);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      container.removeEventListener("focusin", rememberFocus);
      container.removeEventListener("input", rememberDraft);
    };
  }, []);

  return root;
}

function FabricRow({ line, library, supplierOptions, onChange, onPurchaseUnitChange, onSelectLibrary, onSaveToLibrary, onDelete }: {
  line: FabricCostLine;
  library: FabricLibraryItem[];
  supplierOptions: string[];
  onChange: (lineId: string, patch: Partial<FabricCostLine>) => void;
  onPurchaseUnitChange: (lineId: string, purchaseUnit: FabricCostLine["purchaseUnit"]) => void;
  onSelectLibrary: (lineId: string, item: FabricLibraryItem) => void;
  onSaveToLibrary?: (line: FabricCostLine) => void;
  onDelete?: (lineId: string) => void;
}) {
  const label = `面料-${line.id}`;
  const consumption = fabricConsumptionValue(line);
  const cost = fabricCostValue(line);
  return <tr data-row-id={line.id}>
    <td><MaterialCombobox ariaLabel={`${label}-名称`} value={line.name} options={library} status={fabricStatus(line, library)} placeholder="搜索面料库或自由输入" getSearchText={(item) => `${item.name} ${item.composition} ${item.supplier}`} onInputChange={(name) => onChange(line.id, { name })} onSelect={(item) => onSelectLibrary(line.id, item)} renderOption={(item) => <div className="qc-material-option qc-fabric-option"><strong>{item.name}</strong><div className="qc-material-option-details"><span><b>供应商：</b>{item.supplier || "未填写"}</span><span><b>成分：</b>{item.composition || "未填写"}</span><span><b>门幅：</b>{nullable(item.netWidthCm, "cm")}</span><span><b>克重：</b>{nullable(item.gsm, "gsm")}</span><span><b>采购单位：</b>{item.purchaseUnit === "kg" ? "千克" : "米"}</span><span><b>价格：</b><em>{item.unitPrice === null ? "—" : `¥${item.unitPrice.toFixed(2)}/${item.purchaseUnit === "kg" ? "kg" : "m"}`}</em></span></div></div>} /></td>
    <td><input aria-label={`${label}-成分`} value={line.composition} onChange={(event) => onChange(line.id, { composition: event.target.value })} placeholder="如 100% Cotton" /></td>
    <td><NullableNumberInput aria-label={`${label}-段长`} min="0" value={line.segmentLengthCm} onValueChange={(segmentLengthCm) => onChange(line.id, { segmentLengthCm })} placeholder="cm" /></td>
    <td><NullableNumberInput aria-label={`${label}-净门幅`} min="0" value={line.netWidthCm} onValueChange={(netWidthCm) => onChange(line.id, { netWidthCm })} placeholder="cm" /></td>
    <td><NullableNumberInput aria-label={`${label}-克重`} min="0" value={line.gsm} onValueChange={(gsm) => onChange(line.id, { gsm })} placeholder="gsm" /></td>
    <td><div className="qc-number-suffix"><NullableNumberInput aria-label={`${label}-损耗率`} min="0" value={line.lossRate} onValueChange={(lossRate) => onChange(line.id, { lossRate })} placeholder="损耗" /><span>%</span></div></td>
    <td><CreatableCombobox ariaLabel={`${label}-供应商`} value={line.supplier} suggestions={supplierOptions} onChange={(supplier) => onChange(line.id, { supplier })} placeholder="选择或输入供应商" /></td>
    <td><div className="qc-number-prefix"><span>¥</span><NullableNumberInput aria-label={`${label}-单价`} min="0" value={line.unitPrice} onValueChange={(unitPrice) => onChange(line.id, { unitPrice })} placeholder="单价" /></div></td>
    <td><div className="qc-unit-segment" role="group" aria-label={`${label}-采购单位`}><button type="button" className={line.purchaseUnit === "kg" ? "selected" : ""} aria-pressed={line.purchaseUnit === "kg"} onClick={() => onPurchaseUnitChange(line.id, "kg")}>千克</button><button type="button" className={line.purchaseUnit === "meter" ? "selected" : ""} aria-pressed={line.purchaseUnit === "meter"} onClick={() => onPurchaseUnitChange(line.id, "meter")}>米</button></div></td>
    <td><ReadOnlyMetric value={consumption} suffix={line.purchaseUnit === "kg" ? "kg/件" : "m/件"} /></td>
    <td><ReadOnlyMetric value={cost} prefix="¥" suffix="RMB/件" /></td>
    {(onSaveToLibrary || onDelete) && <td><RowActions type="面料" name={line.name} onSave={() => onSaveToLibrary?.(line)} onDelete={() => onDelete?.(line.id)} /></td>}
  </tr>;
}

function FabricCompactCard({ line, library, supplierOptions, onChange, onPurchaseUnitChange, onSelectLibrary, onSaveToLibrary, onDelete }: {
  line: FabricCostLine;
  library: FabricLibraryItem[];
  supplierOptions: string[];
  onChange: (lineId: string, patch: Partial<FabricCostLine>) => void;
  onPurchaseUnitChange: (lineId: string, purchaseUnit: FabricCostLine["purchaseUnit"]) => void;
  onSelectLibrary: (lineId: string, item: FabricLibraryItem) => void;
  onSaveToLibrary?: (line: FabricCostLine) => void;
  onDelete?: (lineId: string) => void;
}) {
  const label = `面料-${line.id}`;
  const consumption = fabricConsumptionValue(line);
  const amount = fabricCostValue(line);
  return <article className="qc-compact-cost-card qc-fabric-compact-card" data-row-id={line.id}>
    <header>
      <div><small>面料明细</small><strong>{line.name || "未填写面料名称"}</strong></div>
      <div className="qc-compact-cost-card-tools">
        <CompactResult label="单耗" value={consumption} suffix={line.purchaseUnit === "kg" ? "kg/件" : "m/件"} />
        <CompactResult label="面料成本" value={amount} prefix="¥" suffix="RMB/件" />
        {(onSaveToLibrary || onDelete) && <RowActions type="面料" name={line.name} onSave={() => onSaveToLibrary?.(line)} onDelete={() => onDelete?.(line.id)} />}
      </div>
    </header>
    <div className="qc-compact-cost-grid qc-fabric-compact-grid">
      <CompactCostField label="面料名称" className="is-name"><MaterialCombobox ariaLabel={`${label}-名称`} value={line.name} options={library} status={fabricStatus(line, library)} placeholder="搜索面料库或自由输入" getSearchText={(item) => `${item.name} ${item.composition} ${item.supplier}`} onInputChange={(name) => onChange(line.id, { name })} onSelect={(item) => onSelectLibrary(line.id, item)} renderOption={(item) => <div className="qc-material-option qc-fabric-option"><strong>{item.name}</strong><div className="qc-material-option-details"><span><b>供应商：</b>{item.supplier || "未填写"}</span><span><b>成分：</b>{item.composition || "未填写"}</span><span><b>门幅：</b>{nullable(item.netWidthCm, "cm")}</span><span><b>克重：</b>{nullable(item.gsm, "gsm")}</span><span><b>采购单位：</b>{item.purchaseUnit === "kg" ? "千克" : "米"}</span><span><b>价格：</b><em>{item.unitPrice === null ? "—" : `¥${item.unitPrice.toFixed(2)}/${item.purchaseUnit === "kg" ? "kg" : "m"}`}</em></span></div></div>} /></CompactCostField>
      <CompactCostField label="成分" className="is-composition"><input aria-label={`${label}-成分`} value={line.composition} onChange={(event) => onChange(line.id, { composition: event.target.value })} placeholder="如 100% Cotton" /></CompactCostField>
      <CompactCostField label="供应商" className="is-supplier"><CreatableCombobox ariaLabel={`${label}-供应商`} value={line.supplier} suggestions={supplierOptions} onChange={(supplier) => onChange(line.id, { supplier })} placeholder="选择或输入供应商" /></CompactCostField>
      <CompactCostField label="段长 cm" className="is-segment"><NullableNumberInput aria-label={`${label}-段长`} min="0" value={line.segmentLengthCm} onValueChange={(segmentLengthCm) => onChange(line.id, { segmentLengthCm })} placeholder="cm" /></CompactCostField>
      <CompactCostField label="净门幅 cm" className="is-width"><NullableNumberInput aria-label={`${label}-净门幅`} min="0" value={line.netWidthCm} onValueChange={(netWidthCm) => onChange(line.id, { netWidthCm })} placeholder="cm" /></CompactCostField>
      <CompactCostField label="克重 gsm" className="is-gsm"><NullableNumberInput aria-label={`${label}-克重`} min="0" value={line.gsm} onValueChange={(gsm) => onChange(line.id, { gsm })} placeholder="gsm" /></CompactCostField>
      <CompactCostField label="损耗率 %" className="is-loss"><div className="qc-number-suffix"><NullableNumberInput aria-label={`${label}-损耗率`} min="0" value={line.lossRate} onValueChange={(lossRate) => onChange(line.id, { lossRate })} placeholder="损耗" /><span>%</span></div></CompactCostField>
      <CompactCostField label="单价" className="is-price"><div className="qc-number-prefix"><span>¥</span><NullableNumberInput aria-label={`${label}-单价`} min="0" value={line.unitPrice} onValueChange={(unitPrice) => onChange(line.id, { unitPrice })} placeholder="单价" /></div></CompactCostField>
      <CompactCostField label="采购单位" className="is-purchase-unit"><div className="qc-unit-segment" role="group" aria-label={`${label}-采购单位`}><button type="button" className={line.purchaseUnit === "kg" ? "selected" : ""} aria-pressed={line.purchaseUnit === "kg"} onClick={() => onPurchaseUnitChange(line.id, "kg")}>千克</button><button type="button" className={line.purchaseUnit === "meter" ? "selected" : ""} aria-pressed={line.purchaseUnit === "meter"} onClick={() => onPurchaseUnitChange(line.id, "meter")}>米</button></div></CompactCostField>
    </div>
  </article>;
}

export function FabricCostTable({ lines, library, supplierOptions, onChange, onPurchaseUnitChange, onSelectLibrary, onSaveToLibrary, onAdd, onDelete, fixedStructure = false }: {
  lines: FabricCostLine[];
  library: FabricLibraryItem[];
  supplierOptions: string[];
  onChange: (lineId: string, patch: Partial<FabricCostLine>) => void;
  onPurchaseUnitChange: (lineId: string, purchaseUnit: FabricCostLine["purchaseUnit"]) => void;
  onSelectLibrary: (lineId: string, item: FabricLibraryItem) => void;
  onSaveToLibrary?: (line: FabricCostLine) => void;
  onAdd?: () => void;
  onDelete?: (lineId: string) => void;
  fixedStructure?: boolean;
}) {
  const rendererFocusRef = useCostRendererFocusBridge();
  const subtotal = lines.some((line) => fabricCostValue(line) !== null) ? sumFabricCosts(lines) : null;
  const actions = !fixedStructure && Boolean(onSaveToLibrary || onDelete);
  return <Card className={`qc-cost-card qc-cost-section qc-fabric-cost-card ${fixedStructure ? "is-fixed-structure" : ""}`}>
    <header><div><h3>面料成本</h3><p>ERP 宽表录入 · 毛门幅按净门幅 + 5cm，单耗与成本实时计算</p></div>{!fixedStructure && onAdd && <Button className="qc-cost-edit-action" variant="secondary" onClick={onAdd}>＋ 增加面料</Button>}</header>
    <div className="qc-cost-renderer-shell" ref={rendererFocusRef}><div className="qc-cost-table-wrap qc-cost-wide-renderer qc-desktop-cost-table"><table className="qc-cost-table qc-erp-cost-table qc-fabric-cost-table"><colgroup><col /><col /><col /><col /><col /><col /><col /><col /><col /><col /><col />{actions && <col />}</colgroup><thead><tr><th>面料名称</th><th>成分</th><th>段长 cm</th><th>净门幅 cm</th><th>克重 gsm</th><th>损耗率 %</th><th>供应商</th><th title="根据采购单位显示 RMB/kg 或 RMB/m"><span className="qc-unit-heading"><b>单价</b><small>RMB/kg · RMB/m</small></span></th><th>采购单位</th><th><span className="qc-unit-heading"><b>单耗</b><small>kg/件 · m/件</small></span></th><th><span className="qc-unit-heading"><b>面料成本</b><small>RMB/件</small></span></th>{actions && <th>操作</th>}</tr></thead><tbody>{lines.map((line) => <FabricRow key={line.id} line={line} library={library} supplierOptions={supplierOptions} onChange={onChange} onPurchaseUnitChange={onPurchaseUnitChange} onSelectLibrary={onSelectLibrary} onSaveToLibrary={actions ? onSaveToLibrary : undefined} onDelete={actions ? onDelete : undefined} />)}{!lines.length && <tr><td colSpan={actions ? 12 : 11}><div className="qc-inline-empty">暂无面料</div></td></tr>}</tbody></table></div>
    <div className="qc-cost-compact-renderer" aria-label="面料成本紧凑编辑">{lines.map((line) => <FabricCompactCard key={line.id} line={line} library={library} supplierOptions={supplierOptions} onChange={onChange} onPurchaseUnitChange={onPurchaseUnitChange} onSelectLibrary={onSelectLibrary} onSaveToLibrary={actions ? onSaveToLibrary : undefined} onDelete={actions ? onDelete : undefined} />)}{!lines.length && <div className="qc-inline-empty">暂无面料</div>}</div>
    <div className="qc-cost-mobile-renderer qc-mobile-cost-list" aria-label="面料成本摘要">{lines.map((line) => { const consumption = fabricConsumptionValue(line); const amount = fabricCostValue(line); return <article key={line.id} className="qc-mobile-cost-card"><header><div><small>面料</small><strong>{line.name || "未填写面料名称"}</strong></div><span className={`qc-source-badge is-${fabricStatus(line, library) || "manual"}`}>{sourceLabels[fabricStatus(line, library) || "manual"]}</span></header><dl><div><dt>成分</dt><dd>{line.composition || "—"}</dd></div><div><dt>供应商</dt><dd>{line.supplier || "—"}</dd></div><div><dt>段长</dt><dd>{nullable(line.segmentLengthCm, " cm")}</dd></div><div><dt>净门幅 / 克重</dt><dd>{nullable(line.netWidthCm, " cm")} · {nullable(line.gsm, " gsm")}</dd></div><div><dt>损耗率</dt><dd>{nullable(line.lossRate, "%")}</dd></div><div><dt>采购价</dt><dd>{line.unitPrice === null ? "—" : `¥${line.unitPrice.toFixed(2)}/${line.purchaseUnit === "kg" ? "kg" : "m"}`}</dd></div></dl><footer><span><small>单耗</small><strong>{consumption === null ? "—" : `${consumption.toFixed(4)} ${line.purchaseUnit === "kg" ? "kg/件" : "m/件"}`}</strong></span><span><small>面料成本</small><strong>{amount === null ? "—" : `¥${amount.toFixed(2)}`}</strong></span></footer></article>; })}{!lines.length && <div className="qc-inline-empty">暂无面料</div>}<p className="qc-mobile-edit-hint">手机端展示完整成本摘要；面料结构调整请使用桌面端。</p></div></div>
    <footer className="qc-cost-subtotal"><span>面料小计</span><strong>{subtotal === null ? "—" : `¥${subtotal.toFixed(2)}`} {subtotal !== null && <small>/ 件</small>}</strong></footer>
  </Card>;
}

function TrimRow({ line, library, supplierOptions, onChange, onSelectLibrary, onSaveToLibrary, onDelete }: {
  line: TrimCostLine;
  library: TrimLibraryItem[];
  supplierOptions: string[];
  onChange: (lineId: string, patch: Partial<TrimCostLine>) => void;
  onSelectLibrary: (lineId: string, item: TrimLibraryItem) => void;
  onSaveToLibrary?: (line: TrimCostLine) => void;
  onDelete?: (lineId: string) => void;
}) {
  const label = `辅料-${line.id}`;
  const amount = costLineValue(line);
  return <tr data-row-id={line.id}>
    <td><MaterialCombobox ariaLabel={`${label}-名称`} value={line.name} options={library} status={trimStatus(line, library)} placeholder="搜索辅料库或自由输入" getSearchText={(item) => `${item.name} ${item.specification} ${item.supplier}`} onInputChange={(name) => onChange(line.id, { name })} onSelect={(item) => onSelectLibrary(line.id, item)} renderOption={(item) => <div className="qc-material-option qc-trim-option"><strong>{item.name}</strong><div className="qc-material-option-details"><span><b>供应商：</b>{item.supplier || "未填写"}</span><span><b>规格：</b>{item.specification || "未填写"}</span><span><b>单位：</b>{item.unit || "未填写"}</span><span><b>默认损耗：</b>{nullable(item.defaultLossRate, "%")}</span><span><b>价格：</b><em>{item.unitPrice === null ? "—" : `¥${item.unitPrice.toFixed(2)}/${item.unit || "件"}`}</em></span></div></div>} /></td>
    <td><input aria-label={`${label}-规格`} value={line.specification} onChange={(event) => onChange(line.id, { specification: event.target.value })} placeholder="规格" /></td>
    <td><CreatableCombobox ariaLabel={`${label}-供应商`} value={line.supplier} suggestions={supplierOptions} onChange={(supplier) => onChange(line.id, { supplier })} placeholder="选择或输入供应商" /></td>
    <td><NullableNumberInput aria-label={`${label}-用量`} min="0" value={line.usage} onValueChange={(usage) => onChange(line.id, { usage })} placeholder="保持空或录入" /></td>
    <td><input aria-label={`${label}-单位`} value={line.unit} onChange={(event) => onChange(line.id, { unit: event.target.value })} placeholder="单位" /></td>
    <td><div className="qc-number-suffix"><NullableNumberInput aria-label={`${label}-损耗率`} min="0" value={line.lossRate} onValueChange={(lossRate) => onChange(line.id, { lossRate })} placeholder="损耗" /><span>%</span></div></td>
    <td><div className="qc-number-prefix"><span>¥</span><NullableNumberInput aria-label={`${label}-单价`} min="0" value={line.unitPrice} onValueChange={(unitPrice) => onChange(line.id, { unitPrice })} placeholder="单价" /></div></td>
    <td><ReadOnlyMetric value={amount} prefix="¥" suffix="RMB/件" /></td>
    {(onSaveToLibrary || onDelete) && <td><RowActions type="辅料" name={line.name} onSave={() => onSaveToLibrary?.(line)} onDelete={() => onDelete?.(line.id)} /></td>}
  </tr>;
}

function TrimCompactCard({ line, library, supplierOptions, onChange, onSelectLibrary, onSaveToLibrary, onDelete }: {
  line: TrimCostLine;
  library: TrimLibraryItem[];
  supplierOptions: string[];
  onChange: (lineId: string, patch: Partial<TrimCostLine>) => void;
  onSelectLibrary: (lineId: string, item: TrimLibraryItem) => void;
  onSaveToLibrary?: (line: TrimCostLine) => void;
  onDelete?: (lineId: string) => void;
}) {
  const label = `辅料-${line.id}`;
  const amount = costLineValue(line);
  return <article className="qc-compact-cost-card qc-trim-compact-card" data-row-id={line.id}>
    <header>
      <div><small>辅料明细</small><strong>{line.name || "未填写辅料名称"}</strong></div>
      <div className="qc-compact-cost-card-tools">
        <CompactResult label="单件金额" value={amount} prefix="¥" suffix="RMB/件" />
        {(onSaveToLibrary || onDelete) && <RowActions type="辅料" name={line.name} onSave={() => onSaveToLibrary?.(line)} onDelete={() => onDelete?.(line.id)} />}
      </div>
    </header>
    <div className="qc-compact-cost-grid qc-trim-compact-grid">
      <CompactCostField label="辅料名称" className="is-name"><MaterialCombobox ariaLabel={`${label}-名称`} value={line.name} options={library} status={trimStatus(line, library)} placeholder="搜索辅料库或自由输入" getSearchText={(item) => `${item.name} ${item.specification} ${item.supplier}`} onInputChange={(name) => onChange(line.id, { name })} onSelect={(item) => onSelectLibrary(line.id, item)} renderOption={(item) => <div className="qc-material-option qc-trim-option"><strong>{item.name}</strong><div className="qc-material-option-details"><span><b>供应商：</b>{item.supplier || "未填写"}</span><span><b>规格：</b>{item.specification || "未填写"}</span><span><b>单位：</b>{item.unit || "未填写"}</span><span><b>默认损耗：</b>{nullable(item.defaultLossRate, "%")}</span><span><b>价格：</b><em>{item.unitPrice === null ? "—" : `¥${item.unitPrice.toFixed(2)}/${item.unit || "件"}`}</em></span></div></div>} /></CompactCostField>
      <CompactCostField label="规格" className="is-specification"><input aria-label={`${label}-规格`} value={line.specification} onChange={(event) => onChange(line.id, { specification: event.target.value })} placeholder="规格" /></CompactCostField>
      <CompactCostField label="供应商" className="is-supplier"><CreatableCombobox ariaLabel={`${label}-供应商`} value={line.supplier} suggestions={supplierOptions} onChange={(supplier) => onChange(line.id, { supplier })} placeholder="选择或输入供应商" /></CompactCostField>
      <CompactCostField label="数量 / 用量" className="is-usage"><NullableNumberInput aria-label={`${label}-用量`} min="0" value={line.usage} onValueChange={(usage) => onChange(line.id, { usage })} placeholder="保持空或录入" /></CompactCostField>
      <CompactCostField label="单位" className="is-unit"><input aria-label={`${label}-单位`} value={line.unit} onChange={(event) => onChange(line.id, { unit: event.target.value })} placeholder="单位" /></CompactCostField>
      <CompactCostField label="损耗率 %" className="is-loss"><div className="qc-number-suffix"><NullableNumberInput aria-label={`${label}-损耗率`} min="0" value={line.lossRate} onValueChange={(lossRate) => onChange(line.id, { lossRate })} placeholder="损耗" /><span>%</span></div></CompactCostField>
      <CompactCostField label="单价" className="is-price"><div className="qc-number-prefix"><span>¥</span><NullableNumberInput aria-label={`${label}-单价`} min="0" value={line.unitPrice} onValueChange={(unitPrice) => onChange(line.id, { unitPrice })} placeholder="单价" /></div></CompactCostField>
    </div>
  </article>;
}

export function TrimCostTable({ lines, library, supplierOptions, onChange, onSelectLibrary, onSaveToLibrary, onAdd, onDelete, fixedStructure = false }: {
  lines: TrimCostLine[];
  library: TrimLibraryItem[];
  supplierOptions: string[];
  onChange: (lineId: string, patch: Partial<TrimCostLine>) => void;
  onSelectLibrary: (lineId: string, item: TrimLibraryItem) => void;
  onSaveToLibrary?: (line: TrimCostLine) => void;
  onAdd?: () => void;
  onDelete?: (lineId: string) => void;
  fixedStructure?: boolean;
}) {
  const rendererFocusRef = useCostRendererFocusBridge();
  const subtotal = lines.some((line) => costLineValue(line) !== null) ? sumCostLines(lines) : null;
  const actions = !fixedStructure && Boolean(onSaveToLibrary || onDelete);
  return <Card className={`qc-cost-card qc-cost-section qc-trim-cost-card ${fixedStructure ? "is-fixed-structure" : ""}`}>
    <header><div><h3>辅料成本</h3><p>从辅料库选择后形成报价快照；报价内修改不会改变基础库</p></div>{!fixedStructure && onAdd && <Button className="qc-cost-edit-action" variant="secondary" onClick={onAdd}>＋ 增加辅料</Button>}</header>
    <div className="qc-cost-renderer-shell" ref={rendererFocusRef}><div className="qc-cost-table-wrap qc-cost-wide-renderer qc-desktop-cost-table"><table className="qc-cost-table qc-erp-cost-table qc-trim-cost-table"><colgroup><col /><col /><col /><col /><col /><col /><col /><col />{actions && <col />}</colgroup><thead><tr><th>辅料名称</th><th>规格</th><th>供应商</th><th>数量 / 用量</th><th>单位</th><th>损耗率 %</th><th title="按当前辅料单位录入人民币单价"><span className="qc-unit-heading"><b>单价</b><small>RMB/单位</small></span></th><th><span className="qc-unit-heading"><b>单件金额</b><small>RMB/件</small></span></th>{actions && <th>操作</th>}</tr></thead><tbody>{lines.map((line) => <TrimRow key={line.id} line={line} library={library} supplierOptions={supplierOptions} onChange={onChange} onSelectLibrary={onSelectLibrary} onSaveToLibrary={actions ? onSaveToLibrary : undefined} onDelete={actions ? onDelete : undefined} />)}{!lines.length && <tr><td colSpan={actions ? 9 : 8}><div className="qc-inline-empty">暂无辅料</div></td></tr>}</tbody></table></div>
    <div className="qc-cost-compact-renderer" aria-label="辅料成本紧凑编辑">{lines.map((line) => <TrimCompactCard key={line.id} line={line} library={library} supplierOptions={supplierOptions} onChange={onChange} onSelectLibrary={onSelectLibrary} onSaveToLibrary={actions ? onSaveToLibrary : undefined} onDelete={actions ? onDelete : undefined} />)}{!lines.length && <div className="qc-inline-empty">暂无辅料</div>}</div>
    <div className="qc-cost-mobile-renderer qc-mobile-cost-list" aria-label="辅料成本摘要">{lines.map((line) => { const amount = costLineValue(line); return <article key={line.id} className="qc-mobile-cost-card"><header><div><small>辅料</small><strong>{line.name || "未填写辅料名称"}</strong></div><span className={`qc-source-badge is-${trimStatus(line, library) || "manual"}`}>{sourceLabels[trimStatus(line, library) || "manual"]}</span></header><dl><div><dt>规格</dt><dd>{line.specification || "—"}</dd></div><div><dt>供应商</dt><dd>{line.supplier || "—"}</dd></div><div><dt>数量 / 用量</dt><dd>{nullable(line.usage, line.unit ? ` ${line.unit}` : "")}</dd></div><div><dt>损耗率</dt><dd>{nullable(line.lossRate, "%")}</dd></div><div><dt>单价</dt><dd>{line.unitPrice === null ? "—" : `¥${line.unitPrice.toFixed(2)}/${line.unit || "单位"}`}</dd></div></dl><footer><span><small>单件金额</small><strong>{amount === null ? "—" : `¥${amount.toFixed(2)}`}</strong></span></footer></article>; })}{!lines.length && <div className="qc-inline-empty">暂无辅料</div>}<p className="qc-mobile-edit-hint">手机端展示完整成本摘要；辅料结构调整请使用桌面端。</p></div></div>
    <footer className="qc-cost-subtotal"><span>辅料小计</span><strong>{subtotal === null ? "—" : `¥${subtotal.toFixed(2)}`} {subtotal !== null && <small>/ 件</small>}</strong></footer>
  </Card>;
}

function GenericCostRow({ title, line, namePlaceholder, onChange, onDelete }: {
  title: string;
  line: OtherCostLine;
  namePlaceholder: string;
  onChange: (lineId: string, patch: Partial<OtherCostLine>) => void;
  onDelete?: (lineId: string) => void;
}) {
  const label = `${title}-${line.id}`;
  const sourceLabel = line.source === "global" ? line.overridden ? "全局 · 已调整" : "全局" : "本报价";
  return <tr data-row-id={line.id}><td><div className="qc-other-cost-name"><input aria-label={`${label}-名称`} placeholder={namePlaceholder} value={line.name} onChange={(event) => onChange(line.id, { name: event.target.value })} /><span className={`qc-cost-origin-badge ${line.source === "global" ? line.overridden ? "is-overridden" : "is-global" : "is-manual"}`}>{sourceLabel}</span></div></td><td><input aria-label={`${label}-规格`} placeholder="请输入规格" value={line.specification} onChange={(event) => onChange(line.id, { specification: event.target.value })} /></td><td><NullableNumberInput aria-label={`${label}-用量`} placeholder="请输入" min="0" value={line.usage} onValueChange={(usage) => onChange(line.id, { usage })} /></td><td><input aria-label={`${label}-单位`} placeholder="单位" value={line.unit} onChange={(event) => onChange(line.id, { unit: event.target.value })} /></td><td><div className="qc-number-suffix"><NullableNumberInput aria-label={`${label}-损耗率`} min="0" value={line.lossRate} onValueChange={(lossRate) => onChange(line.id, { lossRate })} /><span>%</span></div></td><td><div className="qc-number-prefix"><span>¥</span><NullableNumberInput aria-label={`${label}-单价`} min="0" value={line.unitPrice} onValueChange={(unitPrice) => onChange(line.id, { unitPrice })} /></div></td><td><ReadOnlyMetric value={costLineValue(line)} prefix="¥" /></td>{onDelete && <td><button className="qc-delete-line" type="button" aria-label={`删除${line.name || title}成本行`} onClick={() => onDelete(line.id)}>×</button></td>}</tr>;
}

function OtherCostCompactCard({ title, line, namePlaceholder, onChange, onDelete }: {
  title: string;
  line: OtherCostLine;
  namePlaceholder: string;
  onChange: (lineId: string, patch: Partial<OtherCostLine>) => void;
  onDelete?: (lineId: string) => void;
}) {
  const label = `${title}-${line.id}`;
  const sourceLabel = line.source === "global" ? line.overridden ? "全局 · 已调整" : "全局" : "本报价";
  return <article className="qc-compact-cost-card qc-other-compact-card" data-row-id={line.id}>
    <header>
      <div><small>费用明细</small><strong>{line.name || "未填写费用名称"}</strong></div>
      <div className="qc-compact-cost-card-tools">
        <span className={`qc-cost-origin-badge ${line.source === "global" ? line.overridden ? "is-overridden" : "is-global" : "is-manual"}`}>{sourceLabel}</span>
        <CompactResult label="单件金额" value={costLineValue(line)} prefix="¥" suffix="RMB/件" />
        {onDelete && <button className="qc-delete-line" type="button" aria-label={`删除${line.name || title}成本行`} onClick={() => onDelete(line.id)}>×</button>}
      </div>
    </header>
    <div className="qc-compact-cost-grid qc-other-compact-grid">
      <CompactCostField label="项目" className="is-name"><input aria-label={`${label}-名称`} placeholder={namePlaceholder} value={line.name} onChange={(event) => onChange(line.id, { name: event.target.value })} /></CompactCostField>
      <CompactCostField label="规格" className="is-specification"><input aria-label={`${label}-规格`} placeholder="请输入规格" value={line.specification} onChange={(event) => onChange(line.id, { specification: event.target.value })} /></CompactCostField>
      <CompactCostField label="数量 / 用量" className="is-usage"><NullableNumberInput aria-label={`${label}-用量`} placeholder="请输入" min="0" value={line.usage} onValueChange={(usage) => onChange(line.id, { usage })} /></CompactCostField>
      <CompactCostField label="单位" className="is-unit"><input aria-label={`${label}-单位`} placeholder="单位" value={line.unit} onChange={(event) => onChange(line.id, { unit: event.target.value })} /></CompactCostField>
      <CompactCostField label="损耗率 %" className="is-loss"><div className="qc-number-suffix"><NullableNumberInput aria-label={`${label}-损耗率`} min="0" value={line.lossRate} onValueChange={(lossRate) => onChange(line.id, { lossRate })} /><span>%</span></div></CompactCostField>
      <CompactCostField label="单价 RMB" className="is-price"><div className="qc-number-prefix"><span>¥</span><NullableNumberInput aria-label={`${label}-单价`} min="0" value={line.unitPrice} onValueChange={(unitPrice) => onChange(line.id, { unitPrice })} /></div></CompactCostField>
    </div>
  </article>;
}

export function CostTable({ title, description, lines, namePlaceholder, onChange, onAdd, onDelete, fixedStructure = false }: {
  title: string;
  description: string;
  lines: OtherCostLine[];
  namePlaceholder: string;
  onChange: (lineId: string, patch: Partial<OtherCostLine>) => void;
  onAdd?: () => void;
  onDelete?: (lineId: string) => void;
  fixedStructure?: boolean;
}) {
  const rendererFocusRef = useCostRendererFocusBridge();
  const subtotal = lines.some((line) => costLineValue(line) !== null) ? sumCostLines(lines) : null;
  return <Card className={`qc-cost-card qc-cost-section qc-other-cost-card ${fixedStructure ? "is-fixed-structure" : ""}`}>
    <header><div><h3>{title}</h3><p>{description}</p></div>{!fixedStructure && onAdd && <Button className="qc-cost-edit-action" variant="secondary" onClick={onAdd}>＋ 增加行</Button>}</header>
    <div className="qc-cost-renderer-shell" ref={rendererFocusRef}><div className="qc-cost-table-wrap qc-cost-wide-renderer"><table className="qc-cost-table"><thead><tr><th>项目</th><th>规格</th><th>数量 / 用量</th><th>单位</th><th>损耗率</th><th>单价 RMB</th><th>单件金额</th>{!fixedStructure && onDelete && <th />}</tr></thead><tbody>{lines.map((line) => <GenericCostRow key={line.id} title={title} line={line} namePlaceholder={namePlaceholder} onChange={onChange} onDelete={fixedStructure ? undefined : onDelete} />)}{!lines.length && <tr><td colSpan={!fixedStructure && onDelete ? 8 : 7}><div className="qc-inline-empty">暂无成本行</div></td></tr>}</tbody></table></div>
    <div className="qc-cost-compact-renderer" aria-label={`${title}紧凑编辑`}>{lines.map((line) => <OtherCostCompactCard key={line.id} title={title} line={line} namePlaceholder={namePlaceholder} onChange={onChange} onDelete={fixedStructure ? undefined : onDelete} />)}{!lines.length && <div className="qc-inline-empty">暂无成本行</div>}</div></div>
    <footer className="qc-cost-subtotal"><span>{title}小计</span><strong>{subtotal === null ? "—" : `¥${subtotal.toFixed(2)}`} {subtotal !== null && <small>/ 件</small>}</strong></footer>
  </Card>;
}

"use client";

import type { KeyboardEvent } from "react";
import type { ManufacturingPreset } from "../model/quote-settings";

/** A view of existing presets, not a second settings authority. IDs remain explicit. */
export function ManufacturingSchemeSelector({ presets, value, disabled = false, allowNone = false, label, onChange }: {
  presets: ManufacturingPreset[]; value: string | null; disabled?: boolean;
  allowNone?: boolean; label: string; onChange: (id: string | null) => void;
}) {
  const active = presets.filter(preset => preset.status !== "inactive");
  const options = [...(allowNone ? [null] : []), ...active];
  const selected = options.findIndex(preset => (preset?.id ?? null) === value);
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!direction && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + direction + options.length) % options.length;
    const button = event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined;
    onChange(options[next]?.id ?? null);
    button?.focus(); button?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  return <div className="qc-scheme-selector-block">
    {!active.length && <p className="qc-scheme-empty" role="status">尚无有效制作方案，请先新增制作方案。未选择时，制作参数保持待完善。</p>}
    <div className="qc-scheme-selector" role="radiogroup" aria-label={label}>
      {options.map((preset, index) => <button key={preset?.id ?? "none"} type="button" role="radio"
        aria-checked={(preset?.id ?? null) === value} disabled={disabled}
        tabIndex={index === (selected < 0 ? 0 : selected) ? 0 : -1}
        data-scheme-id={preset?.id ?? ""} onKeyDown={event => keyboard(event, index)}
        onClick={() => onChange(preset?.id ?? null)}>
        <strong>{preset?.name ?? "暂不选择方案"}</strong>
        <span>{preset ? `${preset.country || "国家待设置"} · ${preset.laborCurrency} · 加成 ${preset.markupRate === null ? "待完善" : `${preset.markupRate}%`}` : "国家、制作参数待完善"}</span>
        <small>{preset ? preset.includeFreight ? `${preset.freightName || "运费"} · ${preset.freightAmount === null ? "金额待完善" : `¥${preset.freightAmount}`}` : "不计入方案运费" : "不自动选择或创建业务方案"}</small>
      </button>)}
    </div>
  </div>;
}

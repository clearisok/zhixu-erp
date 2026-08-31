"use client";

import {
  Button,
  CreatableCombobox,
  Drawer,
  FormItem,
  NullableNumberInput,
  SearchableSelect,
  useFormSubmitting,
} from "@/components/foundation";
import { createMasterDataId } from "../repository/basic-settings-repository";
import type {
  BrandRecord,
  DefaultQuoteConfiguration,
  DefaultTrimConfig,
  TrimLibraryItem,
} from "../model/basic-settings";

export type DefaultConfigurationDraft = {
  rate: number | null;
  trims: DefaultTrimConfig[];
  otherCostName: string;
  otherCostAmount: number | null;
};

export type BrandDraft = {
  id: string;
  name: string;
  status: "active" | "inactive";
  defaults: DefaultConfigurationDraft;
};

export type SalespersonDraft = BrandDraft & { brandId: string };

export const emptyDefaultConfigurationDraft = (): DefaultConfigurationDraft => ({ rate: null, trims: [], otherCostName: "", otherCostAmount: null });

export const defaultConfigurationToDraft = (defaults: DefaultQuoteConfiguration): DefaultConfigurationDraft => ({
  rate: defaults.defaultUsdCnyRate,
  trims: structuredClone(defaults.defaultTrims),
  otherCostName: defaults.defaultOtherCost?.name ?? "",
  otherCostAmount: defaults.defaultOtherCost?.amount ?? null,
});

export const draftToDefaultConfiguration = (draft: DefaultConfigurationDraft, prefix: string): DefaultQuoteConfiguration => ({
  defaultUsdCnyRate: draft.rate,
  defaultTrims: draft.trims.map((item, index): DefaultTrimConfig => ({ ...item, id: item.id || `${prefix}-default-trim-${index + 1}` })),
  defaultOtherCost: draft.otherCostName.trim() || draft.otherCostAmount !== null
    ? { name: draft.otherCostName.trim() || "默认其他费用", amount: draft.otherCostAmount }
    : null,
});

export const createBrandDraft = (name = ""): BrandDraft => ({
  id: createMasterDataId("brand"),
  name,
  status: "active",
  defaults: emptyDefaultConfigurationDraft(),
});

export const createSalespersonDraft = (brandId: string, name = ""): SalespersonDraft => ({
  id: createMasterDataId("sales"),
  name,
  brandId,
  status: "active",
  defaults: emptyDefaultConfigurationDraft(),
});

export const createTrimLibraryDraft = (name = ""): TrimLibraryItem => {
  const now = new Date().toISOString();
  return { id: createMasterDataId("trim"), name, specification: "", supplier: "", unit: "", defaultLossRate: null, unitPrice: null, createdAt: now, updatedAt: now };
};

export function appendDefaultTrim(draft: DefaultConfigurationDraft, trimLibraryItemId: string): DefaultConfigurationDraft {
  if (!trimLibraryItemId || draft.trims.some((item) => item.trimLibraryItemId === trimLibraryItemId)) return draft;
  return {
    ...draft,
    trims: [...draft.trims, { id: createMasterDataId("default-trim"), trimLibraryItemId, quantity: null, overrideLossRate: null, overrideUnitPrice: null }],
  };
}

export function DefaultConfigurationFields({
  value,
  trimLibrary,
  onChange,
  collapsible = false,
  canCreateTrim = false,
  onCreateTrim,
}: {
  value: DefaultConfigurationDraft;
  trimLibrary: TrimLibraryItem[];
  onChange: (value: DefaultConfigurationDraft) => void;
  collapsible?: boolean;
  canCreateTrim?: boolean;
  onCreateTrim?: (query: string) => void;
}) {
  const patch = (next: Partial<DefaultConfigurationDraft>) => onChange({ ...value, ...next });
  const selected = value.trims.flatMap((config) => {
    const item = trimLibrary.find((candidate) => candidate.id === config.trimLibraryItemId);
    return item ? [{ config, item }] : [];
  });
  const available = trimLibrary
    .filter((item) => !value.trims.some((config) => config.trimLibraryItemId === item.id))
    .map((item) => ({ value: item.id, label: `${item.name} · ${item.supplier || "未填供应商"} · ${item.specification || "无规格"}`, keywords: `${item.name} ${item.specification} ${item.supplier} ${item.unit}` }));

  const fields = <div className="qc-default-fields">
    <FormItem label="默认 USD/CNY 汇率"><NullableNumberInput className="qc-control" min="0" value={value.rate} onValueChange={(rate) => patch({ rate })} placeholder="留空则使用上级默认值" /></FormItem>
    <FormItem label="默认其他费用名称"><input className="qc-control" value={value.otherCostName} onChange={(event) => patch({ otherCostName: event.target.value })} placeholder="例如：测试费" /></FormItem>
    <FormItem label="默认其他费用金额"><div className="qc-number-prefix"><span>¥</span><NullableNumberInput className="qc-control" min="0" value={value.otherCostAmount} onValueChange={(otherCostAmount) => patch({ otherCostAmount })} placeholder="RMB / 件" /></div></FormItem>
    <div className="qc-default-trims-editor">
      <div><strong>固定辅料</strong><small>必须引用辅料库；数量 / 用量允许为空，带入报价时形成独立快照。</small></div>
      <SearchableSelect
        value=""
        options={available}
        placeholder="＋ 从辅料库搜索并添加"
        onChange={(id) => onChange(appendDefaultTrim(value, id))}
        createAction={onCreateTrim ? {
          label: (query) => `＋ 新建辅料「${query}」`,
          onCreate: onCreateTrim,
          disabled: !canCreateTrim,
          disabledLabel: "暂无创建辅料权限",
        } : undefined}
      />
      <div className="qc-default-trim-list">
        {selected.map(({ config, item }) => <article key={config.id} className="qc-default-trim-item"><div><strong>{item.name}</strong><small>{item.specification || "无规格"} · {item.supplier || "未填供应商"} · 库价 ¥{item.unitPrice ?? "—"}/{item.unit}</small></div><label><span>数量 / 用量</span><NullableNumberInput className="qc-control" min="0" value={config.quantity} onValueChange={(quantity) => patch({ trims: value.trims.map((entry) => entry.id === config.id ? { ...entry, quantity } : entry) })} placeholder="允许为空" /></label><label><span>覆盖损耗 %</span><NullableNumberInput className="qc-control" min="0" value={config.overrideLossRate} onValueChange={(overrideLossRate) => patch({ trims: value.trims.map((entry) => entry.id === config.id ? { ...entry, overrideLossRate } : entry) })} placeholder="使用库值" /></label><label><span>覆盖单价</span><NullableNumberInput className="qc-control" min="0" value={config.overrideUnitPrice} onValueChange={(overrideUnitPrice) => patch({ trims: value.trims.map((entry) => entry.id === config.id ? { ...entry, overrideUnitPrice } : entry) })} placeholder="使用库值" /></label><button type="button" aria-label={`移除${item.name}`} onClick={() => patch({ trims: value.trims.filter((entry) => entry.id !== config.id) })}>×</button></article>)}
        {!selected.length && <p>暂未配置，报价时将回退上级默认辅料。</p>}
      </div>
    </div>
  </div>;

  return collapsible
    ? <details className="qc-default-details"><summary><span>报价默认资料（可选）</span><small>{value.trims.length ? `${value.trims.length} 项固定辅料` : "可设置固定辅料、汇率和其他费用"}</small></summary>{fields}</details>
    : fields;
}

export function BrandFormFields({ draft, trimLibrary, onChange, error, compact = false, canCreateTrim = false, onCreateTrim }: {
  draft: BrandDraft;
  trimLibrary: TrimLibraryItem[];
  onChange: (draft: BrandDraft) => void;
  error?: string;
  compact?: boolean;
  canCreateTrim?: boolean;
  onCreateTrim?: (query: string) => void;
}) {
  return <div className="qc-modal-form"><div className="qc-modal-grid"><FormItem label="品牌名称" required><input className="qc-control" value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} placeholder="请输入品牌名称" /></FormItem>{!compact && <FormItem label="状态"><select className="qc-control" value={draft.status} onChange={(event) => onChange({ ...draft, status: event.target.value === "inactive" ? "inactive" : "active" })}><option value="active">启用</option><option value="inactive">停用</option></select></FormItem>}</div><DefaultConfigurationFields value={draft.defaults} trimLibrary={trimLibrary} onChange={(defaults) => onChange({ ...draft, defaults })} collapsible={compact} canCreateTrim={canCreateTrim} onCreateTrim={onCreateTrim} />{error && <p className="qc-form-alert">{error}</p>}</div>;
}

export function SalespersonFormFields({ draft, brands, trimLibrary, onChange, error, compact = false, fixedBrand, canCreateTrim = false, onCreateTrim }: {
  draft: SalespersonDraft;
  brands: BrandRecord[];
  trimLibrary: TrimLibraryItem[];
  onChange: (draft: SalespersonDraft) => void;
  error?: string;
  compact?: boolean;
  fixedBrand?: BrandRecord;
  canCreateTrim?: boolean;
  onCreateTrim?: (query: string) => void;
}) {
  return <div className="qc-modal-form"><div className="qc-modal-grid"><FormItem label="客户业务员姓名" required><input className="qc-control" value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} placeholder="请输入姓名" /></FormItem><FormItem label="归属品牌" required>{fixedBrand ? <div className="qc-control qc-readonly-value"><strong>{fixedBrand.name}</strong></div> : <select className="qc-control" value={draft.brandId} onChange={(event) => onChange({ ...draft, brandId: event.target.value })}>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select>}</FormItem>{!compact && <FormItem label="状态"><select className="qc-control" value={draft.status} onChange={(event) => onChange({ ...draft, status: event.target.value === "inactive" ? "inactive" : "active" })}><option value="active">启用</option><option value="inactive">停用</option></select></FormItem>}</div><DefaultConfigurationFields value={draft.defaults} trimLibrary={trimLibrary} onChange={(defaults) => onChange({ ...draft, defaults })} collapsible={compact} canCreateTrim={canCreateTrim} onCreateTrim={onCreateTrim} />{error && <p className="qc-form-alert">{error}</p>}</div>;
}

export function TrimLibraryFormFields({ draft, supplierOptions, onChange, error }: {
  draft: TrimLibraryItem;
  supplierOptions: string[];
  onChange: (draft: TrimLibraryItem) => void;
  error?: string;
}) {
  return <div className="qc-modal-form qc-material-form"><FormItem label="辅料名称" required><input className="qc-control" value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></FormItem><FormItem label="规格"><input className="qc-control" value={draft.specification} onChange={(event) => onChange({ ...draft, specification: event.target.value })} /></FormItem><FormItem label="供应商"><CreatableCombobox ariaLabel="辅料供应商" value={draft.supplier} suggestions={supplierOptions} onChange={(supplier) => onChange({ ...draft, supplier })} /></FormItem><FormItem label="单位" required><input className="qc-control" value={draft.unit} onChange={(event) => onChange({ ...draft, unit: event.target.value })} placeholder="例如：粒、枚、套" /></FormItem><FormItem label="默认损耗率 %"><NullableNumberInput className="qc-control" min="0" value={draft.defaultLossRate} onValueChange={(defaultLossRate) => onChange({ ...draft, defaultLossRate })} /></FormItem><FormItem label="默认单价"><NullableNumberInput className="qc-control" min="0" value={draft.unitPrice} onValueChange={(unitPrice) => onChange({ ...draft, unitPrice })} /></FormItem>{error && <p className="qc-form-alert">{error}</p>}</div>;
}

function QuickSaveButton({ children }: { children: string }) {
  const submitting = useFormSubmitting();
  return <Button type="submit" disabled={submitting}>{submitting ? "保存中…" : children}</Button>;
}

export function QuickTrimDrawer({ open, draft, supplierOptions, error, onChange, onClose, onSubmit }: {
  open: boolean;
  draft: TrimLibraryItem | null;
  supplierOptions: string[];
  error?: string;
  onChange: (draft: TrimLibraryItem) => void;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
}) {
  return <Drawer open={open} title="新建辅料" description="保存为正式辅料库资料，并自动选入当前固定辅料配置。" onClose={onClose} onSubmit={onSubmit} footer={<><Button variant="secondary" onClick={onClose}>取消</Button><QuickSaveButton>保存并选用</QuickSaveButton></>}>
    {draft && <TrimLibraryFormFields draft={draft} supplierOptions={supplierOptions} onChange={onChange} error={error} />}
  </Drawer>;
}

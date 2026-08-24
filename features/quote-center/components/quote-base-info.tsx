"use client";

import { Card, FormItem, NullableDateField, NullableNumberInput, SearchableSelect } from "@/components/foundation";
import Image from "next/image";
import { nullableTotalPriceVersionQuantity } from "../model/quote-calculations";
import type { QuoteRevision, SelectOption } from "../model/quote-view-model";

type QuoteBaseInfoProps = {
  revision: QuoteRevision;
  brandOptions: SelectOption[];
  salespersonOptions: SelectOption[];
  onBrandChange: (value: string, option: SelectOption) => void;
  onSalespersonChange: (value: string, option: SelectOption) => void;
  onChange: (revision: QuoteRevision) => void;
  styleImage: { url: string; name: string } | null;
  onStyleImagePreview: () => void;
  readOnly?: boolean;
  readOnlyLabel?: string;
};

export function QuoteBaseInfo({ revision, brandOptions, salespersonOptions, onBrandChange, onSalespersonChange, onChange, styleImage, onStyleImagePreview, readOnly = false, readOnlyLabel = "历史只读" }: QuoteBaseInfoProps) {
  const base = revision.baseInfo;
  const setBase = (patch: Partial<typeof base>) => onChange({ ...revision, baseInfo: { ...base, ...patch } });
  const singlePriceVersion = revision.priceVersions.length === 1 ? revision.priceVersions[0] : null;
  const totalQuantity = nullableTotalPriceVersionQuantity(revision.priceVersions);
  const setSingleQuantity = (quantity: number | null) => {
    if (!singlePriceVersion) return;
    onChange({ ...revision, priceVersions: [{ ...singlePriceVersion, quantity }] });
  };

  return <Card className="qc-base-card"><header><div><span className="qc-section-index">01</span><div><h2>报价基础信息</h2><p>报价版本保存整张报价快照；数量在各价格版本中独立维护。</p></div></div><span className="qc-revision-chip">{revision.revisionLabel} · {readOnly ? readOnlyLabel : "当前编辑"}</span></header><div className="qc-base-layout"><fieldset disabled={readOnly} className="qc-base-fields qc-readonly-fieldset"><div className="qc-form-grid">
    <FormItem label="品牌" required><SearchableSelect value={base.brandId} options={brandOptions} onChange={onBrandChange} /></FormItem>
    <FormItem label="客户业务员" required><SearchableSelect value={base.salespersonId} options={salespersonOptions} onChange={onSalespersonChange} /></FormItem>
    <FormItem label="报价款号" required><input className="qc-control" value={base.quoteStyleNo} onChange={(event) => setBase({ quoteStyleNo: event.target.value })} placeholder="例如 ZRM-26AW-0418" /></FormItem>
    <FormItem label="款式名称" required><input className="qc-control" value={base.styleName} onChange={(event) => setBase({ styleName: event.target.value })} placeholder="请输入款式名称" /></FormItem>
    {singlePriceVersion ? <FormItem label="数量"><NullableNumberInput className="qc-control" min="0" aria-label="数量" placeholder="请输入数量" value={singlePriceVersion.quantity} onValueChange={setSingleQuantity} /></FormItem> : <FormItem label="总数量" hint="由各价格版本数量自动汇总"><div className="qc-control qc-readonly-value qc-quantity-summary" aria-label="总数量"><strong>{totalQuantity === null ? "—" : totalQuantity.toLocaleString()}</strong><span>件</span></div></FormItem>}
    <FormItem label="报价日期"><NullableDateField value={base.quoteDate} onChange={(value) => setBase({ quoteDate: value })} /></FormItem>
    <FormItem label="面料交期"><NullableDateField value={base.fabricLeadDate} onChange={(value) => setBase({ fabricLeadDate: value })} placeholder="默认为空" /></FormItem>
    <FormItem label="成衣交期"><NullableDateField value={base.garmentLeadDate} onChange={(value) => setBase({ garmentLeadDate: value })} placeholder="默认为空" /></FormItem>
    <FormItem label="备注" className="qc-note-field"><input className="qc-control" value={base.note} onChange={(event) => setBase({ note: event.target.value })} placeholder="请输入简短报价说明" /></FormItem>
  </div></fieldset><div className="qc-style-image-field"><span>款式图</span><button type="button" className="qc-style-image" onClick={onStyleImagePreview} disabled={!styleImage} aria-label={styleImage ? `预览款式图 ${styleImage.name}` : "暂无款式图"}>{styleImage ? <Image src={styleImage.url} alt={styleImage.name || "款式图"} width={440} height={550} unoptimized /> : <div><b>◇</b><strong>暂无款式图</strong><small>上传第一张图片后自动设为款式图</small></div>}</button></div></div></Card>;
}

"use client";

import { Card, FormItem, NullableDateField, SearchableSelect } from "@/components/foundation";
import Image from "next/image";
import type { QuoteRevision, SelectOption } from "../model/quote-view-model";
import { totalPriceVersionQuantity } from "../model/quote-calculations";

type QuoteBaseInfoProps = {
  revision: QuoteRevision;
  brandOptions: SelectOption[];
  salespersonOptions: SelectOption[];
  onBrandChange: (value: string, option: SelectOption) => void;
  onSalespersonChange: (value: string, option: SelectOption) => void;
  onChange: (revision: QuoteRevision) => void;
};

export function QuoteBaseInfo({ revision, brandOptions, salespersonOptions, onBrandChange, onSalespersonChange, onChange }: QuoteBaseInfoProps) {
  const base = revision.baseInfo;
  const setBase = (patch: Partial<typeof base>) => onChange({ ...revision, baseInfo: { ...base, ...patch } });
  const styleImage = revision.garmentMedia[0];

  return <Card className="qc-base-card"><header><div><span className="qc-section-index">01</span><div><h2>报价基础信息</h2><p>Revision 保存整张报价快照；总数量由价格版本自动计算。</p></div></div><span className="qc-revision-chip">{revision.revisionLabel} · 当前编辑</span></header><div className="qc-base-layout"><div className="qc-form-grid">
    <FormItem label="品牌" required><SearchableSelect value={base.brandId} options={brandOptions} onChange={onBrandChange} /></FormItem>
    <FormItem label="客户业务员" required><SearchableSelect value={base.salespersonId} options={salespersonOptions} onChange={onSalespersonChange} /></FormItem>
    <FormItem label="报价款号" required><input className="qc-control" value={base.quoteStyleNo} onChange={(event) => setBase({ quoteStyleNo: event.target.value })} placeholder="例如 ZRM-26AW-0418" /></FormItem>
    <FormItem label="款式名称" required><input className="qc-control" value={base.styleName} onChange={(event) => setBase({ styleName: event.target.value })} placeholder="请输入款式名称" /></FormItem>
    <FormItem label="总数量" hint="所有 PriceVersion.quantity 自动求和"><div className="qc-control qc-readonly-value"><strong>{totalPriceVersionQuantity(revision.priceVersions).toLocaleString()}</strong><span>件</span></div></FormItem>
    <FormItem label="报价日期"><NullableDateField value={base.quoteDate} onChange={(value) => setBase({ quoteDate: value })} /></FormItem>
    <FormItem label="面料交期"><NullableDateField value={base.fabricLeadDate} onChange={(value) => setBase({ fabricLeadDate: value })} placeholder="默认为空" /></FormItem>
    <FormItem label="成衣交期"><NullableDateField value={base.garmentLeadDate} onChange={(value) => setBase({ garmentLeadDate: value })} placeholder="默认为空" /></FormItem>
    <FormItem label="备注" className="wide"><textarea className="qc-control qc-note-control" rows={3} value={base.note} onChange={(event) => setBase({ note: event.target.value })} placeholder="请输入简短报价说明" /></FormItem>
  </div><div className="qc-style-image-field"><span>款式图</span><div className="qc-style-image">{styleImage ? <Image src={styleImage.url} alt={styleImage.fileName || "款式图"} width={440} height={550} unoptimized /> : <div><b>◇</b><strong>款式图展示位</strong><small>当前阶段仅支持单张 mock 图片预览</small></div>}</div></div></div></Card>;
}

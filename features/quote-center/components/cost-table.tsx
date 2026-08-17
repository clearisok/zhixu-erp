"use client";

import { useState } from "react";
import { Button, Card, NullableNumberInput } from "@/components/foundation";
import { costLineAmount, sumCostLines } from "../model/quote-calculations";
import type { CostLine } from "../model/quote-view-model";

type CostLineRowProps = {
  title: string;
  line: CostLine;
  namePlaceholder: string;
  onChange: (lineId: string, patch: Partial<CostLine>) => void;
  onDelete: (lineId: string) => void;
};

function CostLineRow({ title, line, namePlaceholder, onChange, onDelete }: CostLineRowProps) {
  const [nameDraft, setNameDraft] = useState(line.name);
  const [specificationDraft, setSpecificationDraft] = useState(line.specification);
  const [unitDraft, setUnitDraft] = useState(line.unit);
  const stableLabel = `${title}-${line.id}`;

  return <tr data-row-id={line.id}>
    <td><input aria-label={`${stableLabel}-名称`} placeholder={namePlaceholder} value={nameDraft} onChange={(event) => { const value = event.target.value; setNameDraft(value); onChange(line.id, { name: value }); }} /></td>
    <td><input aria-label={`${stableLabel}-规格`} placeholder="请输入规格" value={specificationDraft} onChange={(event) => { const value = event.target.value; setSpecificationDraft(value); onChange(line.id, { specification: value }); }} /></td>
    <td><NullableNumberInput aria-label={`${stableLabel}-用量`} placeholder="请输入" min="0" value={line.usage} onValueChange={(usage) => onChange(line.id, { usage })} /></td>
    <td><input aria-label={`${stableLabel}-单位`} placeholder="单位" value={unitDraft} onChange={(event) => { const value = event.target.value; setUnitDraft(value); onChange(line.id, { unit: value }); }} /></td>
    <td><div className="qc-number-suffix"><NullableNumberInput aria-label={`${stableLabel}-损耗率`} placeholder="请输入" min="0" value={line.lossRate} onValueChange={(lossRate) => onChange(line.id, { lossRate })} /><span>%</span></div></td>
    <td><div className="qc-number-prefix"><span>¥</span><NullableNumberInput aria-label={`${stableLabel}-单价`} placeholder="请输入" min="0" value={line.unitPrice} onValueChange={(unitPrice) => onChange(line.id, { unitPrice })} /></div></td>
    <td><strong>¥{costLineAmount(line).toFixed(2)}</strong></td>
    <td><button className="qc-delete-line" type="button" aria-label={`删除${nameDraft || title}成本行`} onClick={() => onDelete(line.id)}>×</button></td>
  </tr>;
}

export function CostTable({ title, description, lines, namePlaceholder, subtotalLabel, onChange, onAdd, onDelete }: {
  title: string;
  description: string;
  lines: CostLine[];
  namePlaceholder: string;
  subtotalLabel?: string;
  onChange: (lineId: string, patch: Partial<CostLine>) => void;
  onAdd: () => void;
  onDelete: (lineId: string) => void;
}) {
  return <Card className="qc-cost-card"><header><div><h3>{title}</h3><p>{description}</p></div><Button variant="secondary" onClick={onAdd}>＋ 增加行</Button></header><div className="qc-cost-table-wrap"><table className="qc-cost-table"><thead><tr><th>项目</th><th>规格</th><th>数量 / 用量</th><th>单位</th><th>损耗率</th><th>单价 RMB</th><th>单件金额</th><th /></tr></thead><tbody>{lines.map((line) => <CostLineRow key={line.id} title={title} line={line} namePlaceholder={namePlaceholder} onChange={onChange} onDelete={onDelete} />)}{!lines.length && <tr><td colSpan={8}><div className="qc-inline-empty">暂无成本行，点击“增加行”开始录入</div></td></tr>}</tbody></table></div>{subtotalLabel && <footer className="qc-cost-subtotal"><span>{subtotalLabel}</span><strong>¥{sumCostLines(lines).toFixed(2)} <small>/ 件</small></strong></footer>}</Card>;
}

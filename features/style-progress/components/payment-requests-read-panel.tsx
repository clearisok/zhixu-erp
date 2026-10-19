"use client";
import { useEffect, useState } from 'react';
import { Button } from '@/components/foundation/button';
import { MaterialReadTable } from './material-read-display';
import { readPaymentRequests, PaymentReadError } from '@/features/ainuoke-payment-requests/client';
import { PAYMENT_AMOUNTS, PAYMENT_FIELD_LABELS, PAYMENT_SOURCE_FIELDS, PAYMENT_EMPTY_LABELS,
  type DecimalValue, type SourceValue, type PaymentResolution, type PaymentObservation, type TimedPaymentView } from '@/features/ainuoke-payment-requests/model';

const raw = (value: DecimalValue | SourceValue): string => value.state === 'known' ? value.raw
  : value.state === 'invalid' ? '来源数值待核（'+value.raw+'）' : '未知';
const unit = (value: SourceValue | PaymentResolution): string => value.state === 'known'
  ? 'raw' in value ? value.raw : value.value : value.state === 'conflict' ? '单位冲突' : '单位待核';
function quantity(value: DecimalValue, units?: SourceValue | PaymentResolution) {
  return value.state === 'known' ? raw(value)+'（'+(units ? unit(units) : '单位待核')+'）' : raw(value);
}
function amount(row: PaymentObservation, field: typeof PAYMENT_AMOUNTS[number]) {
  const value = row.amounts[field], currency = row.amountCurrencies[field];
  return value.state === 'known' ? value.raw+' '+(currency.state === 'known' ? currency.value : currency.state === 'conflict' ? '币种冲突' : '币种待核') : raw(value);
}
type State = { key:string; loading:boolean; result:TimedPaymentView|null; error:string|null };
const PAGE_SIZE = 10;
const quantityNames = ['Num','OutStoreNum','bgNum','kpNum'] as const;
const descriptive = PAYMENT_SOURCE_FIELDS.filter(field=>!quantityNames.includes(field as typeof quantityNames[number]) && !PAYMENT_AMOUNTS.includes(field as typeof PAYMENT_AMOUNTS[number]));
/** Existing Drawer content only. Every record is contract-scoped; no material
 * matching, sums, Browser storage, mutation or upstream collection. */
export function PaymentRequestsReadPanel({salesOrderId,salesContractNo,identityKey}:{salesOrderId:string;salesContractNo:string;identityKey:string}) {
  const [revision,setRevision] = useState(0), [page,setPage] = useState(0);
  const scope = JSON.stringify([salesOrderId,salesContractNo,identityKey,revision]);
  const [state,setState] = useState<State>({key:'',loading:true,result:null,error:null});
  const [expiredKey,setExpiredKey] = useState('');
  const reload = () => {setPage(0);setRevision(value=>value+1);};
  useEffect(()=>{
    const controller = new AbortController();
    void readPaymentRequests(salesOrderId,salesContractNo,controller.signal).then(result=>{
      const checked=result.status==='observed'&&performance.now()>=result.deadline?{status:'expired' as const,model:null}:result;
      if(!controller.signal.aborted)setState({key:scope,loading:false,result:checked,error:null});
    },error=>{
      if(controller.signal.aborted)return;
      const message = error instanceof PaymentReadError && error.code === 'not_connected' ? PAYMENT_EMPTY_LABELS.not_connected
        : error instanceof PaymentReadError && error.code === 'forbidden' ? '没有货款申请来源查看权限，旧明细已隐藏。'
        : error instanceof PaymentReadError && error.code === 'authentication_required' ? '登录已失效，请重新登录后读取。'
        : '货款申请来源暂不可读取，旧明细已隐藏。';
      setState({key:scope,loading:false,result:null,error:message});
    });
    return()=>controller.abort();
  },[salesOrderId,salesContractNo,scope]);
  // A focus/visibility return checks the DB again. It never contacts Ainuoke.
  useEffect(()=>{
    const visible = () => {if(document.visibilityState==='visible'){setPage(0);setRevision(value=>value+1);}};
    document.addEventListener('visibilitychange',visible);window.addEventListener('focus',visible);
    return()=>{document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',visible);};
  },[salesOrderId,salesContractNo,identityKey]);
  const current = state.key === scope ? state : null;
  const result = current?.result;
  useEffect(()=>{
    if(!result || result.status!=='observed')return;
    const timer=setTimeout(()=>setExpiredKey(scope),Math.max(0,result.deadline-performance.now())+1);
    return()=>clearTimeout(timer);
  },[result,scope]);
  const expired = result?.status==='expired' || expiredKey===scope;
  const model = result?.status==='observed' && !expired ? result.model : null;
  const pageCount = model ? Math.ceil(model.rows.length/PAGE_SIZE) : 0;
  const currentPage = pageCount ? Math.min(page,pageCount-1) : 0;
  const rows = model?.rows.slice(currentPage*PAGE_SIZE,(currentPage+1)*PAGE_SIZE) ?? [];
  return <section className="sp-payment-requests" aria-label="合同货款申请来源记录">
    <h3>合同货款申请 · 来源记录</h3>
    <p className="sp-event-comparison">以下记录属于合同 {salesContractNo}，尚未逐行关联当前物料。分批记录可能重复采购数量，不合计采购总量；申请金额不代表银行实付。</p>
    <p><Button variant="secondary" size="compact" disabled={!current || current.loading} onClick={reload}>刷新记录</Button></p>
    {!current || current.loading ? <p role="status">正在读取货款申请来源记录…</p>
      : expired ? <p className="sp-reconciliation-pending" role="status">{PAYMENT_EMPTY_LABELS.stale}请刷新记录。</p>
      : current.error ? <p className="sp-reconciliation-pending" role="status">{current.error}</p>
      : result?.status==='empty' ? <p className="sp-reconciliation-pending" role="status">{PAYMENT_EMPTY_LABELS[result.model.sourceStatus]}</p>
      : model && <>
        <p className="sp-event-help" role="status">{model.rows.length} 条合同来源明细 · 尚未形成对账结论 · 观察时间 <time dateTime={model.observedThrough}>{new Date(model.observedThrough).toLocaleString('zh-CN',{hour12:false})}</time></p>
        <MaterialReadTable headers={['申请单','状态','采购合同','物料','颜色 / 规格','采购数量','本次申请出运分配','采购金额','应付金额','本次申请付款金额']}
          rows={rows.map(row=>[raw(row.sourceFields.BillNo),raw(row.sourceFields.Status),raw(row.sourceFields.PurContractNo),raw(row.sourceFields.CnName),raw(row.sourceFields.CnColor)+' / '+raw(row.sourceFields.CnComposition),
            quantity(row.quantities.Num,row.sourceUnits.purchase),quantity(row.quantities.OutStoreNum,row.allocatedShipmentUnit),amount(row,'cgGoodsAmount'),amount(row,'PayAmount'),amount(row,'GoodsAmount')])}/>
        <p className="sp-event-help">显示第 {currentPage+1} / {pageCount} 页 · 共 {model.rows.length} 条来源明细。</p>
        <p><Button variant="secondary" size="compact" disabled={currentPage===0} onClick={()=>setPage(value=>Math.max(0,value-1))}>上一页</Button>{' '}
          <Button variant="secondary" size="compact" disabled={currentPage+1>=pageCount} onClick={()=>setPage(value=>Math.min(pageCount-1,value+1))}>下一页</Button></p>
        <h3>逐行字段与来源</h3>
        {rows.map((row,index)=><details className="sp-event-variant" key={row.observationId} data-payment-observation={row.observationId}>
          <summary>{raw(row.sourceFields.BillNo)} · {raw(row.sourceFields.CnName)} · 明细 {currentPage*PAGE_SIZE+index+1}</summary>
          <p className="sp-event-help">来源第 {row.trace.page} 页第 {row.trace.rowIndex+1} 条；重复来源记录分别保留。</p>
          <MaterialReadTable headers={['数量口径','来源数量']} rows={quantityNames.map(field=>[PAYMENT_FIELD_LABELS[field],quantity(row.quantities[field],field==='Num'?row.sourceUnits.purchase:field==='OutStoreNum'?row.allocatedShipmentUnit:field==='bgNum'?row.sourceUnits.customs:undefined)])}/>
          <MaterialReadTable headers={['金额口径','来源金额']} rows={PAYMENT_AMOUNTS.map(field=>[PAYMENT_FIELD_LABELS[field],amount(row,field)])}/>
          <MaterialReadTable headers={['来源字段','原值']} rows={descriptive.map(field=>[PAYMENT_FIELD_LABELS[field],raw(row.sourceFields[field])])}/>
        </details>)}
      </>}
  </section>;
}

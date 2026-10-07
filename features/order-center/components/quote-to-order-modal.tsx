"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FormItem, Modal, NullableNumberInput } from "@/components/foundation";
import { createOperationId, createOrderOperationLog, operationLogRepository } from "@/features/operation-logs";
import { usePermissions } from "@/features/permissions";
import { calculatePriceVersionMetrics } from "@/features/quote-center/model/quote-calculations";
import type { Quote } from "@/features/quote-center/model/quote-view-model";
import { isBrowserQuoteFrozen } from "@/features/quote-center/authority/quote-writer-mode";
import { orderRepository } from "../repository/order-repository";
import { createOrderFromQuote, suggestOrderNo } from "../service/order-service";

type Props = {
  open: boolean;
  quote: Quote;
  defaultRevisionId: string;
  defaultPriceVersionId: string;
  onClose: () => void;
};

const today = () => new Date().toISOString().slice(0, 10);
const nullableMoney = (value: number | null, symbol = "¥") => value === null ? "—" : `${symbol}${value.toFixed(2)}`;

export function QuoteToOrderModal(props: Props) {
  if (isBrowserQuoteFrozen()) return null;
  return <QuoteToOrderSession {...props} />;
}

function QuoteToOrderSession({ open, quote, defaultRevisionId, defaultPriceVersionId, onClose }: Props) {
  const router = useRouter();
  const { can, currentUser } = usePermissions();
  const defaultRevision = quote.revisions.find((candidate) => candidate.revisionId === defaultRevisionId) ?? quote.revisions[0];
  const defaultPriceVersion = defaultRevision?.priceVersions.find((candidate) => candidate.id === defaultPriceVersionId) ?? defaultRevision?.priceVersions[0];
  const [revisionId, setRevisionId] = useState(defaultRevisionId);
  const [priceVersionId, setPriceVersionId] = useState(defaultPriceVersionId);
  const [orderNo, setOrderNo] = useState("");
  const [customerPoNo, setCustomerPoNo] = useState("");
  const [orderDate, setOrderDate] = useState(today());
  const [initialQuantity, setInitialQuantity] = useState<number | null>(defaultPriceVersion?.quantity ?? null);
  const [merchandiser, setMerchandiser] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const revision = quote.revisions.find((candidate) => candidate.revisionId === revisionId) ?? quote.revisions[0];
  const priceVersion = revision?.priceVersions.find((candidate) => candidate.id === priceVersionId) ?? revision?.priceVersions[0];
  const metrics = useMemo(() => priceVersion ? calculatePriceVersionMetrics(priceVersion) : null, [priceVersion]);

  useEffect(() => {
    if (!open) return;
    void orderRepository.list().then((orders) => setOrderNo(suggestOrderNo(orders, today())));
  }, [open]);

  const chooseRevision = (nextRevisionId: string) => {
    const nextRevision = quote.revisions.find((candidate) => candidate.revisionId === nextRevisionId);
    const nextPrice = nextRevision?.priceVersions[0];
    setRevisionId(nextRevisionId);
    setPriceVersionId(nextPrice?.id ?? "");
    setInitialQuantity(nextPrice?.quantity ?? null);
  };

  const choosePriceVersion = (nextPriceVersionId: string) => {
    const nextPrice = revision?.priceVersions.find((candidate) => candidate.id === nextPriceVersionId);
    setPriceVersionId(nextPriceVersionId);
    setInitialQuantity(nextPrice?.quantity ?? null);
  };

  const submit = async () => {
    if (isBrowserQuoteFrozen()) return;
    if (!can("order.create") || submitting || !revision || !priceVersion) return;
    if (!orderNo.trim()) { setError("请填写订单号"); return; }
    if (initialQuantity === null || initialQuantity < 0) { setError("请确认订单初始数量"); return; }
    if (await orderRepository.orderNoExists(orderNo)) { setError("订单号已存在"); return; }
    setSubmitting(true);
    setError("");
    try {
      const order = createOrderFromQuote({
        quote,
        revision,
        priceVersion,
        initialQuantity,
        actor: { id: currentUser.id, name: currentUser.name },
        header: {
          orderNo,
          customerId: revision.baseInfo.brandId || null,
          customerNameSnapshot: revision.baseInfo.brandName,
          customerPoNo,
          orderDate,
          salespersonId: revision.baseInfo.salespersonId || null,
          salespersonNameSnapshot: revision.baseInfo.salespersonName,
          merchandiserId: null,
          merchandiserNameSnapshot: merchandiser,
          orderType: revision.baseInfo.quoteType,
          remark: `来源报价 ${quote.quoteCode} / ${revision.revisionLabel} / ${priceVersion.name}`,
        },
      });
      await orderRepository.save(order);
      const operationId = createOperationId();
      await operationLogRepository.appendMany([
        createOrderOperationLog({
          order,
          actor: { userId: currentUser.id, userName: currentUser.name },
          action: "报价生成订单",
          beforeValues: { "来源报价": quote.quoteCode, "报价版本": revision.revisionLabel, "价格版本": priceVersion.name },
          afterValues: { "订单号": order.orderNo, "初始数量": initialQuantity, "款号": order.styleNo },
          operationId,
        }),
        createOrderOperationLog({
          order,
          actor: { userId: currentUser.id, userName: currentUser.name },
          action: "创建订单初始价格",
          entityType: "OrderPriceVersion",
          entityId: order.currentPriceVersionId,
          afterValues: {
            "价格版本": "P1",
            "销售价": order.priceVersions[0].salePrice,
            "工价": order.priceVersions[0].processingUnitPrice,
            "加工币种": order.priceVersions[0].processingCurrency,
            "汇率依据": order.priceVersions[0].exchangeRateSnapshot,
          },
          operationId,
          operationSequence: 1,
        }),
      ]);
      onClose();
      router.push(`/order-center/detail?id=${encodeURIComponent(order.id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "生成订单失败");
    } finally {
      setSubmitting(false);
    }
  };

  const summary = priceVersion && revision ? {
    styleNo: revision.baseInfo.quoteStyleNo,
    country: priceVersion.pricingParameters.manufacturingCountry || "—",
    quantity: priceVersion.quantity,
    currency: priceVersion.pricingParameters.laborCurrency,
    labor: priceVersion.labor.value,
    sale: revision.baseInfo.quoteType === "distribution" ? metrics?.garmentSellingPrice ?? null : null,
  } : null;

  return <Modal
    open={open}
    title="生成订单"
    description="订单会保存报价来源与独立快照；后续报价修改不会回写订单。"
    onClose={onClose}
    onSubmit={submit}
    className="oc-quote-order-modal"
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button><Button type="submit" disabled={submitting || !can("order.create")}>{submitting ? "生成中…" : "确认生成订单"}</Button></>}
  >
    <div className="oc-source-summary">
      <FormItem label="报价版本"><select className="qc-control" value={revisionId} onChange={(event) => chooseRevision(event.target.value)}>{quote.revisions.map((candidate) => <option key={candidate.revisionId} value={candidate.revisionId}>{candidate.revisionLabel}{candidate.readOnly ? " · 历史只读" : " · 当前"}</option>)}</select></FormItem>
      <FormItem label="价格版本"><select className="qc-control" value={priceVersionId} onChange={(event) => choosePriceVersion(event.target.value)}>{revision?.priceVersions.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></FormItem>
      {summary && <div className="oc-source-facts">
        <span><small>款号</small><strong>{summary.styleNo || "—"}</strong></span>
        <span><small>制作国家</small><strong>{summary.country}</strong></span>
        <span><small>订单类型</small><strong>{revision?.baseInfo.quoteType === "processing" ? "加工" : "经销"}</strong></span>
        <span><small>报价数量</small><strong>{summary.quantity ?? "—"}</strong></span>
        <span><small>加工币种 / 工价</small><strong>{summary.currency} · {nullableMoney(summary.labor, summary.currency === "USD" ? "$" : "¥")}</strong></span>
        <span><small>成衣销售单价</small><strong>{nullableMoney(summary.sale)}</strong></span>
      </div>}
      {!priceVersion?.confirmation && <div className="oc-warning">当前价格版本尚无客户确认记录；该提醒不会阻止生成订单。</div>}
    </div>
    <div className="oc-source-form">
      <FormItem label="订单号" required><input className="qc-control" value={orderNo} onChange={(event) => setOrderNo(event.target.value)} /></FormItem>
      <FormItem label="客户 PO"><input className="qc-control" value={customerPoNo} onChange={(event) => setCustomerPoNo(event.target.value)} /></FormItem>
      <FormItem label="下单日期" required><input type="date" className="qc-control" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} /></FormItem>
      <FormItem label="订单初始数量" required><NullableNumberInput className="qc-control" min="0" value={initialQuantity} onValueChange={setInitialQuantity} /></FormItem>
      <FormItem label="理单员"><input className="qc-control" value={merchandiser} onChange={(event) => setMerchandiser(event.target.value)} /></FormItem>
    </div>
    {error && <p className="qc-form-alert">{error}</p>}
  </Modal>;
}

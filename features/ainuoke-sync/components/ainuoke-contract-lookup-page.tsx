"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertBanner, AppShell, Button, Card, EmptyState, ErrorState, LoadingState, PageContainer, PageHeader, SearchField, StatusTag, Toast } from "@/components/foundation";
import { loadBasicSettings } from "@/features/basic-settings/repository/basic-settings-repository";
import { operationLogRepository } from "@/features/operation-logs";
import type { SalesOrder } from "@/features/order-center/model/order";
import { orderRepository } from "@/features/order-center/repository/order-repository";
import { usePermissions } from "@/features/permissions";
import type { AinuokeContractMirror, AinuokeSyncState } from "../model/ainuoke";
import { ainuokeRepository } from "../repository/ainuoke-repository";
import { bindAinuokeContract, candidateOrdersForContract } from "../service/ainuoke-sync-service";

const emptyState: AinuokeSyncState = { contracts: [], reviews: [], importRuns: [] };

export function AinuokeContractLookupPage() {
  const { currentUser, can } = usePermissions();
  const [state, setState] = useState(emptyState);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [query, setQuery] = useState("");
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [workingContractNo, setWorkingContractNo] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    Promise.all([ainuokeRepository.load(), orderRepository.list()])
      .then(([nextState, nextOrders]) => { setState(nextState); setOrders(nextOrders); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "无法读取合同匹配数据"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2600); return () => window.clearTimeout(timer); }, [toast]);

  const visibleContracts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return state.contracts.filter((contract) => !needle || [contract.salesContractNo, contract.styleNoRaw, contract.factoryStyleNo, contract.customerName, contract.brandNormalized, contract.brandRaw].join(" ").toLocaleLowerCase().includes(needle));
  }, [query, state.contracts]);

  const bind = async (contract: AinuokeContractMirror) => {
    const orderId = selections[contract.salesContractNo];
    if (!orderId || !can("ainuoke.bind")) return;
    setWorkingContractNo(contract.salesContractNo); setError("");
    try {
      const result = bindAinuokeContract({
        state, orders, contractNo: contract.salesContractNo, orderId, settings: loadBasicSettings(),
        actor: { id: currentUser.id, name: currentUser.name, userId: currentUser.id, userName: currentUser.name },
      });
      await orderRepository.saveAll(result.orders);
      await ainuokeRepository.save(result.state);
      await operationLogRepository.appendMany(result.operationLogs);
      setState(result.state); setOrders(result.orders); setToast(`合同 ${contract.salesContractNo} 已手工绑定并同步`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "手工绑定失败"); }
    finally { setWorkingContractNo(""); }
  };

  if (loading) return <AppShell title="查找销售合同"><PageContainer><LoadingState label="正在读取艾诺科合同镜像" /></PageContainer></AppShell>;
  return <AppShell title="查找销售合同"><PageContainer className="as-page">
    <PageHeader eyebrow="AINUOKE CONTRACT LOOKUP" title="查找销售合同" count={`${visibleContracts.length} 份合同`} description="只显示算法候选，不自动猜测；人工选择订单并确认后才会建立销售合同号唯一绑定。" secondaryActions={<Link href="/ainuoke-sync"><Button variant="secondary">返回艾诺科同步</Button></Link>} />
    {error && <ErrorState title="合同匹配处理失败" description={error} onRetry={() => setError("")} />}
    <AlertBanner tone="info" title="人工确认边界">候选按标准化款号、有效数量和工厂款号评分。无候选或多候选时必须人工判断，已绑定合同不可重复绑定其他订单。</AlertBanner>
    <Card><SearchField value={query} onChange={setQuery} label="查找销售合同" placeholder="搜索销售合同号、款号、工厂款号、客户或品牌" /></Card>
    <Card><div className="as-section-head"><h2>合同与订单候选</h2><span>精确确认后写入</span></div>
      {visibleContracts.length ? <div className="as-history">{visibleContracts.map((contract) => { const candidates = candidateOrdersForContract(contract, orders); const boundOrder = orders.find((order) => order.id === contract.boundOrderId); return <article key={contract.salesContractNo}><div><strong>{contract.salesContractNo} · {contract.styleNoRaw}</strong><span>{contract.customerName || "—"} · {contract.quantity.toLocaleString("zh-CN")} 件 · {contract.colorLines.length} 色</span><small>{boundOrder ? `已绑定 ${boundOrder.orderNo}` : candidates.length ? `${candidates.length} 个候选：${candidates.map((candidate) => `${orders.find((order) => order.id === candidate.orderId)?.orderNo ?? candidate.orderId}（${Math.round(candidate.score * 100)}%，${candidate.reasons.join("+")}）`).join("；")}` : "没有可安全推荐的既有订单"}</small></div><div>{boundOrder ? <StatusTag tone="success">已绑定</StatusTag> : candidates.length ? <><select aria-label={`为合同 ${contract.salesContractNo} 选择订单`} className="qc-control" value={selections[contract.salesContractNo] ?? ""} onChange={(event) => setSelections((current) => ({ ...current, [contract.salesContractNo]: event.target.value }))}><option value="">请选择候选订单</option>{candidates.map((candidate) => { const order = orders.find((item) => item.id === candidate.orderId); return <option key={candidate.orderId} value={candidate.orderId}>{order?.orderNo ?? candidate.orderId} · {order?.styleNo ?? "—"} · {Math.round(candidate.score * 100)}%</option>; })}</select><Button permission="ainuoke.bind" disabled={!selections[contract.salesContractNo] || Boolean(workingContractNo)} onClick={() => void bind(contract)}>{workingContractNo === contract.salesContractNo ? "绑定中…" : "确认手工绑定"}</Button></> : <StatusTag tone="warning">无候选</StatusTag>}</div></article>; })}</div> : <EmptyState title="没有符合条件的销售合同" description="请调整搜索条件，或先返回同步页导入合同镜像。" />}
    </Card><Toast message={toast} />
  </PageContainer></AppShell>;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertBanner,
  AppShell,
  Button,
  Card,
  DescriptionList,
  EmptyState,
  ErrorState,
  FormItem,
  LoadingState,
  PageContainer,
  PageHeader,
  SearchField,
  StatusTag,
} from "@/components/foundation";
import { SalesOrderServerReadError } from "../server/sales-order-server-client";
import { serverSalesOrderReadRepository } from "../server/server-sales-order-read-repository";
import type {
  OrderCenterServerDetailViewModel,
  OrderCenterServerListViewModel,
  ServerSalesOrderCreationSource,
  ServerSalesOrderLifecycleState,
  ServerSalesOrderPage,
} from "../server/sales-order-server-model";

const PAGE_SIZE = 50;
const emptyPage: ServerSalesOrderPage = { limit: PAGE_SIZE, offset: 0, total: 0, hasMore: false };

function readError(error: unknown): string {
  if (error instanceof SalesOrderServerReadError) {
    if (error.status === 401) return "Node server 尚无可信登录 session（401）。";
    if (error.status === 403) return "当前 server identity 尚无 order.view 权限（403）。";
    return `${error.code}（HTTP ${error.status}）`;
  }
  return error instanceof Error ? error.message : "PostgreSQL SalesOrder 读取失败";
}

export function ServerSalesOrderPreviewPage() {
  const [items, setItems] = useState<OrderCenterServerListViewModel[]>([]);
  const [page, setPage] = useState<ServerSalesOrderPage>(emptyPage);
  const [offset, setOffset] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [lifecycleState, setLifecycleState] = useState<ServerSalesOrderLifecycleState | "">("");
  const [creationSource, setCreationSource] = useState<ServerSalesOrderCreationSource | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderCenterServerDetailViewModel | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await serverSalesOrderReadRepository.list({
        limit: PAGE_SIZE,
        offset,
        search: search || undefined,
        lifecycleState: lifecycleState || undefined,
        creationSource: creationSource || undefined,
        sortBy: "orderNo",
        sortDirection: "asc",
      });
      setItems(result.items);
      setPage(result.page);
    } catch (nextError) {
      setItems([]);
      setError(readError(nextError));
    } finally {
      setLoading(false);
    }
  }, [creationSource, lifecycleState, offset, search]);

  useEffect(() => { void Promise.resolve().then(loadList); }, [loadList]);

  const loadDetail = async (id: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      setDetail(await serverSalesOrderReadRepository.getById(id));
    } catch (nextError) {
      setDetail(null);
      setDetailError(readError(nextError));
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <AppShell title="PostgreSQL 只读预览">
      <PageContainer>
        <PageHeader
          eyebrow="DEV SHADOW READ"
          title="PostgreSQL 只读预览"
          count={`${page.total} 条`}
          description="独立读取 server SalesOrder DTO；不会替换或写入 Browser Order Repository。"
        />
        <AlertBanner tone="info" title="Shadow read · source = PostgreSQL">
          此页面没有保存、编辑或删除动作。可信 Node session 与 server order.view 权限仍由 API 独立校验。
        </AlertBanner>
        <Card>
          <form
            className="qc-toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              setOffset(0);
              setSearch(searchInput.normalize("NFKC").trim());
            }}
          >
            <SearchField value={searchInput} onChange={setSearchInput} label="搜索正式订单" placeholder="订单号、BillNo、InsideOrderNo、款号、客户或品牌" />
            <FormItem label="生命周期">
              <select className="qc-control" value={lifecycleState} onChange={(event) => { setOffset(0); setLifecycleState(event.target.value as ServerSalesOrderLifecycleState | ""); }}>
                <option value="">全部</option>
                <option value="draft">draft</option>
                <option value="confirmed">confirmed</option>
                <option value="active">active</option>
                <option value="completed">completed</option>
                <option value="cancelled">cancelled</option>
              </select>
            </FormItem>
            <FormItem label="创建来源">
              <select className="qc-control" value={creationSource} onChange={(event) => { setOffset(0); setCreationSource(event.target.value as ServerSalesOrderCreationSource | ""); }}>
                <option value="">全部</option>
                <option value="ainuoke">ainuoke</option>
                <option value="quote">quote</option>
                <option value="reorder">reorder</option>
                <option value="manual">manual</option>
              </select>
            </FormItem>
            <Button type="submit" variant="secondary">查询</Button>
          </form>
        </Card>
        <Card>
          {loading ? <LoadingState label="读取 PostgreSQL SalesOrders" /> : error ? <ErrorState title="Shadow read 不可用" description={error} onRetry={() => void loadList()} /> : items.length === 0 ? <EmptyState title="没有匹配的 PostgreSQL SalesOrder" /> : (
            <div className="qc-audit-table-wrap" role="region" aria-label="PostgreSQL SalesOrder 只读列表">
              <table>
                <thead><tr><th>正式订单号</th><th>BillNo</th><th>工厂款号 / InsideOrderNo</th><th>款号</th><th>客户 / 品牌</th><th>数量</th><th>生命周期 / Source status</th><th>合同交期</th><th>颜色数</th><th>来源</th><th>详情</th></tr></thead>
                <tbody>{items.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.orderNo}</strong><small>v{item.version} · {item.id}</small></td>
                    <td>{item.billNo ?? "—"}</td>
                    <td>{item.factoryStyleNo ?? "—"}</td>
                    <td>{item.styleNo || "—"}</td>
                    <td><strong>{item.customerName || "—"}</strong><small>{item.brandName || "—"}</small></td>
                    <td>{item.initialQuantity?.toLocaleString("zh-CN") ?? "—"}</td>
                    <td><StatusTag tone="neutral">{item.lifecycleState}</StatusTag><small>{item.sourceLifecycleStatus || "—"}</small></td>
                    <td>{item.contractDeliveryDate ?? "—"}</td>
                    <td>{item.colorCount}</td>
                    <td>PostgreSQL · {item.creationSource}</td>
                    <td><Button variant="text" onClick={() => void loadDetail(item.id)}>查看</Button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <div className="qc-page-actions">
            <Button variant="secondary" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>上一页</Button>
            <span>{page.total === 0 ? "0" : `${page.offset + 1}–${Math.min(page.offset + page.limit, page.total)}`} / {page.total}</span>
            <Button variant="secondary" disabled={!page.hasMore || loading} onClick={() => setOffset(offset + PAGE_SIZE)}>下一页</Button>
          </div>
        </Card>
        <Card>
          <h2>只读详情</h2>
          {detailLoading ? <LoadingState label="读取 PostgreSQL SalesOrder 详情" compact /> : detailError ? <ErrorState description={detailError} /> : !detail ? <EmptyState compact title="选择一条正式订单查看颜色明细" /> : (
            <>
              <DescriptionList columns={3} items={[
                { key: "orderNo", label: "正式订单号", value: detail.orderNo, secondary: `UUID ${detail.id} · version ${detail.version}` },
                { key: "billNo", label: "BillNo", value: detail.billNo },
                { key: "insideOrderNo", label: "InsideOrderNo / 工厂款号", value: detail.factoryStyleNo },
                { key: "styleNo", label: "款号", value: detail.styleNo },
                { key: "customer", label: "客户", value: detail.customerName },
                { key: "brand", label: "品牌", value: detail.brandName },
                { key: "quantity", label: "合同数量", value: detail.initialQuantity?.toLocaleString("zh-CN") },
                { key: "status", label: "生命周期 / Source status", value: detail.lifecycleState, secondary: detail.sourceLifecycleStatus },
                { key: "delivery", label: "合同交期", value: detail.contractDeliveryDate },
              ]} />
              <div className="qc-audit-table-wrap" role="region" aria-label="PostgreSQL SalesOrder 颜色明细">
                <table><thead><tr><th>颜色</th><th>数量</th><th>交期</th></tr></thead><tbody>{detail.colors.map((color) => (
                  <tr key={color.sourceLineIdentity}><td>{color.colorName}</td><td>{color.quantity.toLocaleString("zh-CN")}</td><td>{color.deliveryDate ?? "—"}</td></tr>
                ))}</tbody></table>
              </div>
              {detail.colors.length === 0 && <EmptyState compact title="该订单没有可用颜色 mirror" description="缺失或 invalid enrichment 不影响 SalesOrder master 存在。" />}
            </>
          )}
        </Card>
      </PageContainer>
    </AppShell>
  );
}

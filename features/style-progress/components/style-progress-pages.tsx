"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertBanner,
  AppShell,
  Button,
  Card,
  Drawer,
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
  StatusTag,
  Toast,
} from "@/components/foundation";
import type { SalesOrder } from "@/features/order-center/model/order";
import {
  operationLogRepository,
  createOperationLogDraft,
} from "@/features/operation-logs";
import { usePermissions } from "@/features/permissions";
import { styleProgressRepository } from "../repository/style-progress-repository";
import {
  fabricDisplayOrder,
  filterMaterialsByGarmentColor,
  normalizeGarmentColorTokens,
  trimDisplayOrder,
  type MaterialProgressProjection,
  type StyleProgressProjection,
} from "../service/style-progress-service";
import { loadStyleProgress, type LoadedStyleProgress } from "../service/style-progress-loader";
import type {
  StyleProgressData,
} from "../model/style-progress";
import { MaterialControlTower } from "./material-control-tower";

type Loaded = LoadedStyleProgress;
const readinessLabels = {
  not_purchased: "未采购",
  purchasing: "采购中",
  pending_inbound: "待入库",
  ready: "已齐套",
} as const;
const lifecycleLabels = {
  pending_purchase: "待采购",
  purchasing: "采购中",
  purchase_complete: "采购完成",
  partial_inbound: "部分入库",
  inbound_complete: "入库完成",
  partial_shipment: "部分出运",
  shipment_complete: "出运完成",
  partial_outbound: "部分出库",
  outbound_complete: "出库完成",
} as const;
const salesRiskLabels = {
  overdue: "已逾期",
  "7d": "7天",
  "14d": "14天",
  "30d": "30天",
  normal: "正常",
  unknown: "未记录交期",
} as const;
const materialRiskLabels = {
  ready: "已齐套",
  unpurchase: "存在未采购",
  pending_inbound: "采购/入库中",
  late_expected: "预计到料晚于合同交期",
  normal: "正常",
} as const;
const transportRiskLabels = {
  none: "正常",
  pending_schedule: "待排单",
  hub_missing: "集货仓未设置",
  site_missing: "生产地点未设置",
  route_missing: "路线未配置",
  modes_missing: "运输方式未配置",
  faster_required: "需加快",
  only_fastest: "仅最快可行",
  late: "无可行方式",
} as const;
const tone = (risk: StyleProgressProjection["salesRisk"]) =>
  risk === "overdue" || risk === "7d"
    ? "danger"
    : risk === "14d" || risk === "30d"
      ? "warning"
      : risk === "normal"
        ? "success"
        : "neutral";
const quantity = (value: number | null) =>
  value === null
    ? "—"
    : value.toLocaleString("zh-CN", { maximumFractionDigits: 3 });

async function loadProgress(includeTrace = false): Promise<Loaded> {
  return loadStyleProgress(includeTrace ? { loadData: () => styleProgressRepository.loadAll() } : {});
}

function SummaryMetrics({ rows }: { rows: StyleProgressProjection[] }) {
  const totalMaterials = rows.reduce(
    (total, item) => total + item.totalMaterials,
    0,
  );
  const ready = rows.reduce((total, item) => total + item.totalReady, 0);
  const values = [
    ["销售合同", rows.length],
    ["物料项", totalMaterials],
    ["已齐套", ready],
    ["未采购", rows.reduce((total, item) => total + item.notPurchasedCount, 0)],
    [
      "待入库",
      rows.reduce((total, item) => total + item.pendingInboundCount, 0),
    ],
    [
      "运输高风险",
      rows.reduce((total, item) => total + item.transportRiskCount, 0),
    ],
  ];
  return (
    <section className="sp-metrics">
      {values.map(([label, value]) => (
        <div key={String(label)}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  );
}

function MaterialTable({
  title,
  rows,
  onSaveDate,
  canEdit,
}: {
  title: string;
  rows: MaterialProgressProjection[];
  onSaveDate: (
    row: MaterialProgressProjection,
    date: string | null,
    reset: boolean,
  ) => void;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggleDetail = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return (
    <Card className="sp-material-section">
      <div className="sp-section-head">
        <button type="button" className="sp-section-toggle" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
          <span aria-hidden>{open ? "▾" : "▸"}</span>
          <h2>{title}</h2>
        </button>
        <span>
          {rows.filter((item) => item.readinessStatus === "ready").length}/
          {rows.length} 已齐套
        </span>
      </div>
      {open && (
      <div className="sp-material-table">
        <table>
          <thead>
            <tr>
              <th>状态</th>
              <th>物料 / 颜色 / 编码</th>
              <th>规格 / 用量</th>
              <th>采购进度</th>
              <th>到料</th>
              <th>物流</th>
              <th>异常</th>
              <th>明细</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <Fragment key={item.demand.id}>
              <tr key={item.demand.id} data-material-demand-id={item.demand.id}>
                <td>
                  <StatusTag
                    tone={
                      item.readinessStatus === "ready"
                        ? "success"
                        : item.readinessStatus === "not_purchased"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {readinessLabels[item.readinessStatus]}
                  </StatusTag>
                  <small>{lifecycleLabels[item.lifecycleStatus]}</small>
                </td>
                <td>
                  <strong>
                    {item.demand.sourceActualName || item.demand.materialName}
                  </strong>
                  <span>{item.demand.materialColor || "—"}</span>
                  <small>{item.demand.materialCode}</small>
                </td>
                <td>
                  <strong>{item.demand.specification || "—"}</strong>
                  <span>计划 {quantity(item.demand.plannedConsumption)}</span>
                  {title === "面料" && <small>实际 {quantity(item.demand.actualConsumption)}</small>}
                </td>
                <td>
                  <strong>{quantity(item.purchasedQuantity)} / {quantity(item.demand.requiredQuantity)}</strong>
                  <span>入库 {quantity(item.inboundQuantity)}</span>
                </td>
                <td>
                  <div className="sp-date-edit">
                    <small>拟定 {item.demand.sourceMaterialDueDate ?? "—"}</small>
                    <input
                      type="date"
                      aria-label={`${item.demand.materialName}当前预计到料日`}
                      disabled={!canEdit}
                      value={item.demand.expectedMaterialReadyDate ?? ""}
                      onInput={(event) =>
                        onSaveDate(
                          item,
                          event.currentTarget.value || null,
                          false,
                        )
                      }
                    />
                    {item.demand.expectedDateSource === "manual" && (
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => onSaveDate(item, null, true)}
                      >
                        恢复拟定交期
                      </button>
                    )}
                    <small>
                      {item.demand.expectedDateSource === "manual"
                        ? `人工 · 来源 ${item.demand.sourceMaterialDueDate ?? "—"}`
                        : "跟随拟定交期"}
                    </small>
                    <small>实际 {item.actualInboundDate ?? "—"}</small>
                  </div>
                </td>
                <td>
                  <strong>
                    {item.logistics.recommendedMode?.name ??
                      item.logistics.message}
                  </strong>
                  <span>ETA {item.logistics.expectedArrivalDate ?? "—"}</span>
                  <small>最晚到厂 {item.logistics.latestRequiredArrivalDate ?? "—"}</small>
                </td>
                <td
                  className={
                    item.logistics.status === "late" ||
                    item.logistics.status.endsWith("missing") ||
                    item.readinessStatus === "not_purchased"
                      ? "sp-danger"
                      : ""
                  }
                >
                  {item.readinessStatus === "not_purchased"
                    ? `缺采 ${quantity(item.demand.requiredQuantity)}`
                    : item.logistics.status === "late" ||
                        item.logistics.status.endsWith("missing")
                      ? item.logistics.message
                      : "—"}
                </td>
                <td><button type="button" className="sp-detail-toggle" aria-expanded={expanded.has(item.demand.id)} onClick={() => toggleDetail(item.demand.id)}>{expanded.has(item.demand.id) ? "收起" : "展开"}</button></td>
              </tr>
              {expanded.has(item.demand.id) && (
                <tr className="sp-material-detail-row">
                  <td colSpan={8}>
                    <dl>
                      <div><dt>成衣颜色</dt><dd>{normalizeGarmentColorTokens(item.demand.garmentColors).join(" / ") || "—"}</dd></div>
                      <div><dt>提供方式</dt><dd>{item.demand.supplyMethod ?? "—"}</dd></div>
                      <div><dt>需求 / 样衣</dt><dd>{quantity(item.demand.requiredQuantity)} / {quantity(item.demand.sampleQuantity)}</dd></div>
                      <div><dt>出运 / 出库</dt><dd>{quantity(item.shipmentQuantity)} / {quantity(item.outboundQuantity)}</dd></div>
                      <div><dt>计划开工</dt><dd>{item.logistics.plannedProductionStartDate ?? "—"}</dd></div>
                      <div><dt>物流结论</dt><dd>{item.logistics.message}</dd></div>
                    </dl>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </Card>
  );
}

function LogisticsBasisCard({
  projection,
}: {
  projection: StyleProgressProjection;
}) {
  const basis = projection.logisticsBasis;
  const plannedStartDate =
    projection.materials[0]?.logistics.plannedProductionStartDate ?? null;
  const routeLabel =
    basis.matchedRoute?.name ??
    (projection.transportRisk === "pending_schedule"
      ? "待排单后匹配"
      : projection.transportRisk === "hub_missing"
        ? "待设置集货仓后匹配"
        : projection.transportRisk === "site_missing"
          ? "待设置生产地点后匹配"
          : basis.supplyHub && basis.productionSite
            ? `${basis.supplyHub.name} → ${basis.productionSite.name}路线未配置`
            : "尚未匹配");
  const modeLabel = basis.candidateTransportModes.length
    ? basis.candidateTransportModes
        .map((item) => `${item.name}${item.transitDays}天`)
        .join(" / ")
    : basis.matchedRoute
      ? "当前路线未配置运输方式"
      : "—";
  return (
    <Card
      className="sp-logistics-basis"
      data-sales-contract-no={projection.salesContractNo}
      data-order-id={projection.order?.id ?? ""}
      data-schedule-assignment-id={basis.scheduleAssignmentId ?? ""}
      data-supply-hub-id={basis.supplyHub?.id ?? ""}
      data-production-site-id={basis.productionSite?.id ?? ""}
      data-supply-route-id={basis.matchedRoute?.id ?? ""}
    >
      <div className="sp-logistics-basis-title">
        <strong>物流依据</strong>
        <span>{transportRiskLabels[projection.transportRisk]}</span>
      </div>
      <dl>
        <div>
          <dt>集货仓</dt>
          <dd>{basis.supplyHub?.name ?? "未设置"}</dd>
        </div>
        <div>
          <dt>生产地点</dt>
          <dd>{basis.productionSite?.name ?? "未设置"}</dd>
        </div>
        <div>
          <dt>排单开工</dt>
          <dd>{plannedStartDate ?? "待排单"}</dd>
        </div>
        <div>
          <dt>路线</dt>
          <dd>{routeLabel}</dd>
        </div>
        <div>
          <dt>运输方式</dt>
          <dd>{modeLabel}</dd>
        </div>
      </dl>
    </Card>
  );
}

function sourceDateFromRaw(
  rawFields: Record<string, string | number | boolean | null>,
): string | null {
  const value = Object.entries(rawFields).find(([key]) =>
    key.endsWith(":采购交期"),
  )?.[1];
  if (!value) return null;
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? String(value);
}

function MaterialSourceHistory({
  projection,
  data,
}: {
  projection: StyleProgressProjection;
  data: StyleProgressData;
}) {
  const { can } = usePermissions();
  if (!can("style_progress.view_history")) return null;
  const demandIds = new Set(projection.materials.map((item) => item.demand.id));
  const sourceDates = new Map<string, string[]>();
  for (const snapshot of data.rawSnapshots) {
    if (
      !snapshot.normalizedDemandId ||
      !demandIds.has(snapshot.normalizedDemandId)
    )
      continue;
    const sourceDate = sourceDateFromRaw(snapshot.rawFields);
    if (!sourceDate) continue;
    const dates = sourceDates.get(snapshot.normalizedDemandId) ?? [];
    if (!dates.includes(sourceDate))
      sourceDates.set(snapshot.normalizedDemandId, [...dates, sourceDate]);
  }
  const changed = projection.materials.filter(
    (item) =>
      (sourceDates.get(item.demand.id)?.length ?? 0) > 1 ||
      item.demand.expectedDateSource === "manual",
  );
  const batches = data.batches
    .filter((item) => item.status === "committed")
    .sort((left, right) =>
      (right.committedAt ?? right.createdAt).localeCompare(
        left.committedAt ?? left.createdAt,
      ),
    )
    .slice(0, 5);
  return (
    <Card className="sp-source-history">
      <div className="sp-section-head">
        <h2>来源与跟进历史</h2>
        <span>技术 Trace + 人工 Effective 状态</span>
      </div>
      <p>
        拟定交期保留在
        Source；“当前预计到料日”是业务采用值。人工值不会被重导入覆盖，修改与恢复记录在统一
        OperationLog。
      </p>
      {changed.length > 0 ? (
        <ul>
          {changed.slice(0, 8).map((item) => {
            const dates = sourceDates.get(item.demand.id) ?? [];
            return (
              <li key={item.demand.id}>
                <strong>
                  {item.demand.sourceActualName || item.demand.materialName}
                </strong>
                <span>
                  来源{" "}
                  {dates.length > 1
                    ? dates.join(" → ")
                    : (item.demand.sourceMaterialDueDate ?? "—")}{" "}
                  · 当前 {item.demand.expectedMaterialReadyDate ?? "—"}（
                  {item.demand.expectedDateSource === "manual"
                    ? "人工"
                    : "跟随来源"}
                  ）
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p>当前没有来源交期变化或人工覆盖。</p>
      )}
      <div className="sp-batch-history">
        {batches.map((batch) => (
          <span key={batch.id}>
            {batch.sourceKind === "api" ? `6087050 / ${batch.queryContext.insideOrderNo}` : batch.fileName} ·{" "}
            {batch.committedAt?.slice(0, 10) ?? batch.createdAt.slice(0, 10)} ·{" "}
            {(batch.sourceKind === "api" ? batch.sourceArtifactHash : batch.fileHash).slice(0, 10)}…
          </span>
        ))}
      </div>
    </Card>
  );
}

export function LegacyStyleProgressDetailPage() {
  const router = useRouter();
  const backTarget = { href: "/order-center", label: "返回订单列表" };
  const params = useSearchParams();
  const contract =
    params.get("contract")?.normalize("NFKC").trim().toLocaleUpperCase() ?? "";
  const { currentUser, can } = usePermissions();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [selectedColor, setSelectedColor] = useState("all");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const reload = async () => {
    try {
      setLoaded(await loadProgress(true));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取款式进度");
    }
  };
  useEffect(() => {
    Promise.resolve().then(() => void reload());
  }, []);
  const projection =
    loaded?.projections.find((item) => item.salesContractNo === contract) ??
    null;
  const colors = normalizeGarmentColorTokens([
    ...(projection?.order?.orderColorLines.map((line) => line.colorName) ?? []),
    ...(projection?.materials.flatMap((item) => item.demand.garmentColors) ?? []),
  ]);
  const visible = filterMaterialsByGarmentColor(
    projection?.materials ?? [],
    selectedColor,
  );
  const saveDate = async (
    item: MaterialProgressProjection,
    date: string | null,
    reset: boolean,
  ) => {
    const before = item.demand.expectedMaterialReadyDate;
    try {
      const next = await styleProgressRepository.updateExpectedDate(
        item.demand.id,
        date,
        reset ? "source" : "manual",
      );
      await operationLogRepository.append(
        createOperationLogDraft({
          actor: { userId: currentUser.id, userName: currentUser.name },
          module: "款式进度",
          entityType: "MaterialDemand",
          entityId: item.demand.id,
          action: reset ? "恢复拟定交期" : "修改当前预计到料日",
          beforeData: {
            orderId: projection?.order?.id,
            orderNo: projection?.order?.orderNo,
            orderStyleNo: projection?.styleNo,
            values: {
              当前预计到料日: before,
              来源: item.demand.expectedDateSource,
            },
          },
          afterData: {
            orderId: projection?.order?.id,
            orderNo: projection?.order?.orderNo,
            orderStyleNo: projection?.styleNo,
            values: {
              当前预计到料日: next.expectedMaterialReadyDate,
              来源: next.expectedDateSource,
            },
          },
        }),
      );
      setToast(reset ? "已恢复使用拟定交期" : "当前预计到料日已保存");
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败");
    }
  };
  if (!loaded && !error)
    return (
      <AppShell title="款式进度详情" backTarget={backTarget}>
        <PageContainer>
          <LoadingState label="正在读取物料明细" />
        </PageContainer>
      </AppShell>
    );
  if (error)
    return (
      <AppShell title="款式进度详情" backTarget={backTarget}>
        <PageContainer>
          <ErrorState
            title="读取失败"
            description={error}
            onRetry={() => {
              setError("");
              void reload();
            }}
          />
        </PageContainer>
      </AppShell>
    );
  if (!projection)
    return (
      <AppShell title="款式进度详情" backTarget={backTarget}>
        <PageContainer className="sp-page">

          <PageHeader title={contract || "款式进度详情"} />
          <EmptyState
            title="当前导入数据未找到该款"
            description="没有使用虚构数据补齐；请核对销售合同号或导入最新面辅料申购统计。"
          />
        </PageContainer>
      </AppShell>
    );
  return (
    <AppShell
      title={`${projection.factoryStyleNo || projection.styleNo} · 款式进度`}
      backTarget={backTarget}
    >
      <PageContainer className="sp-page sp-detail">

        <PageHeader
          variant="object"
          eyebrow="STYLE PROGRESS"
          title={projection.factoryStyleNo || projection.styleNo}
          description={
            <>
              {projection.salesContractNo} · {projection.brand} ·{" "}
              {projection.owner || "未记录跟单人"}
            </>
          }
          status={
            <StatusTag tone={tone(projection.salesRisk)}>
              {salesRiskLabels[projection.salesRisk]}
            </StatusTag>
          }
          secondaryActions={
            projection.order ? (
              <Button
                variant="secondary"
                onClick={() =>
                  router.push(
                    `/order-center/detail?id=${encodeURIComponent(projection.order!.id)}`,
                  )
                }
              >
                查看订单
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => router.push("/ainuoke-sync")}
              >
                前往艾诺科同步
              </Button>
            )
          }
        />
        {!projection.order && (
          <AlertBanner tone="warning" title="销售合同尚未形成织序订单">
            款式进度不会猜测款号或自动创建订单；请在艾诺科同步处理。
          </AlertBanner>
        )}
        <section className="sp-detail-summary">
          <Card>
            <span>合同交期</span>
            <strong>{projection.contractDeliveryDate ?? "—"}</strong>
            <small>
              {projection.daysRemaining === null
                ? "未记录"
                : projection.daysRemaining < 0
                  ? `逾期 ${Math.abs(projection.daysRemaining)} 天`
                  : `剩余 ${projection.daysRemaining} 天`}
            </small>
          </Card>
          <Card>
            <span>面料齐套</span>
            <strong>
              {projection.fabricReady}/{projection.fabricTotal}
            </strong>
          </Card>
          <Card>
            <span>辅料齐套</span>
            <strong>
              {projection.trimReady}/{projection.trimTotal}
            </strong>
          </Card>
          <Card>
            <span>总齐套</span>
            <strong>{projection.readinessRate.toFixed(1)}%</strong>
          </Card>
          <Card>
            <span>物料风险</span>
            <strong>{materialRiskLabels[projection.materialRisk]}</strong>
          </Card>
          <Card>
            <span>运输风险</span>
            <strong>{transportRiskLabels[projection.transportRisk]}</strong>
          </Card>
        </section>
        <LogisticsBasisCard projection={projection} />
        <Card className="sp-exceptions">
          <div>
            <h2>关键异常</h2>
            <span>优先显示 3–5 项</span>
          </div>
          {projection.keyExceptions.length ? (
            <ol>
              {projection.keyExceptions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          ) : (
            <p>当前没有关键异常。</p>
          )}
        </Card>
        {colors.length > 0 && (
          <Card className="sp-color-filter">
            <strong>成衣颜色</strong>
            <button
              type="button"
              className={selectedColor === "all" ? "active" : ""}
              onClick={() => setSelectedColor("all")}
            >
              全部
            </button>
            {colors.map((color) => (
              <button
                type="button"
                key={color}
                className={selectedColor === color ? "active" : ""}
                onClick={() => setSelectedColor(color)}
              >
                {color}
              </button>
            ))}
            <span className="sp-color-scope">当前投影 {visible.length} / {projection.materials.length} 项物料</span>
          </Card>
        )}
        <MaterialTable
          title="面料"
          rows={fabricDisplayOrder(visible)}
          onSaveDate={(row, date, reset) => void saveDate(row, date, reset)}
          canEdit={can("style_progress.edit")}
        />
        <MaterialTable
          title="辅料"
          rows={trimDisplayOrder(visible)}
          onSaveDate={(row, date, reset) => void saveDate(row, date, reset)}
          canEdit={can("style_progress.edit")}
        />
        <MaterialSourceHistory projection={projection} data={loaded!.data} />
        {toast && <Toast message={toast} />}
      </PageContainer>
    </AppShell>
  );
}

export function StyleProgressDetailPage() {
  const params = useSearchParams();
  const contract = params.get("contract")?.normalize("NFKC").trim().toLocaleUpperCase() ?? "";
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const reload = async () => {
    try {
      setLoaded(await loadProgress(true));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取款式进度");
    }
  };
  useEffect(() => { Promise.resolve().then(() => void reload()); }, []);
  const projection = loaded?.projections.find((item) => item.salesContractNo === contract) ?? null;
  const backTarget = { href: "/order-center", label: "返回订单列表" };
  if (!loaded && !error) return <AppShell title="款式进度详情" backTarget={backTarget}><PageContainer><LoadingState label="正在读取物料明细" /></PageContainer></AppShell>;
  if (error) return <AppShell title="款式进度详情" backTarget={backTarget}><PageContainer><ErrorState title="读取失败" description={error} onRetry={() => void reload()} /></PageContainer></AppShell>;
  if (!loaded || !projection) return <AppShell title="款式进度详情" backTarget={backTarget}><PageContainer className="sp-page"><PageHeader title={contract || "款式进度详情"} /><EmptyState title="当前导入数据未找到该款" description="没有使用虚构数据补齐；请核对销售合同号或导入最新面辅料申购统计。" /></PageContainer></AppShell>;
  return <AppShell title={`${projection.factoryStyleNo || projection.styleNo} · 款式进度`} backTarget={backTarget}><PageContainer className="sp-page sp-detail sp-v4-page"><MaterialControlTower projection={projection} data={loaded.data} settings={loaded.settings} onReload={reload} onToast={setToast} />{toast && <Toast message={toast} />}</PageContainer></AppShell>;
}

export function OrderStyleProgressSummary({ order }: { order: SalesOrder }) {
  const router = useRouter();
  const [projection, setProjection] = useState<StyleProgressProjection | null>(
    null,
  );
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    if (!order.salesContractNo) return;
    void loadProgress().then((loaded) =>
      setProjection(
        loaded.projections.find(
          (item) => item.salesContractNo === order.salesContractNo,
        ) ?? null,
      ),
    );
  }, [order.salesContractNo]);
  if (!order.salesContractNo || !projection)
    return (
      <Card className="sp-order-summary">
        <EmptyState
          compact
          title="尚无面辅料跟进"
          description={
            order.salesContractNo
              ? "请在款式进度导入真实面辅料申购统计。"
              : "订单尚未绑定销售合同。"
          }
        />
      </Card>
    );
  return (
    <>
      <Card className="sp-order-summary">
        <div>
          <strong>面辅料跟进</strong>
          <span>
            面料 {projection.fabricReady}/{projection.fabricTotal} · 辅料{" "}
            {projection.trimReady}/{projection.trimTotal} · 总齐套{" "}
            {projection.readinessRate.toFixed(1)}%
          </span>
          <small>
            {projection.notPurchasedCount} 项未采购 ·{" "}
            {projection.pendingInboundCount} 项待入库 ·{" "}
            {projection.transportRiskCount} 项运输风险
          </small>
          <em>预计最晚齐料：{projection.expectedLatestMaterialDate ?? "—"}</em>
        </div>
        <div>
          <Button variant="secondary" onClick={() => setDrawer(true)}>
            展开
          </Button>
          <Button
            onClick={() =>
              router.push(
                `/order-center/style-progress/detail?contract=${encodeURIComponent(projection.salesContractNo)}`,
              )
            }
          >
            进入款式进度
          </Button>
        </div>
      </Card>
      <Drawer
        open={drawer}
        title={`${projection.factoryStyleNo || projection.styleNo} · 面辅料摘要`}
        description={`${projection.salesContractNo} · 完整编辑请进入款式进度`}
        onClose={() => setDrawer(false)}
        footer={
          <Button
            onClick={() =>
              router.push(
                `/order-center/style-progress/detail?contract=${encodeURIComponent(projection.salesContractNo)}`,
              )
            }
          >
            进入款式进度
          </Button>
        }
      >
        <SummaryMetrics rows={[projection]} />
        <h3>关键异常</h3>
        {projection.keyExceptions.length ? (
          <ol>
            {projection.keyExceptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        ) : (
          <p>当前没有关键异常。</p>
        )}
        <h3>运输结论</h3>
        <p>
          {transportRiskLabels[projection.transportRisk]} · 风险物料{" "}
          {projection.transportRiskCount} 项
        </p>
      </Drawer>
    </>
  );
}

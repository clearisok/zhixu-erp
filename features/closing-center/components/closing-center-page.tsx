"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AppShell,
  Button,
  Card,
  FormItem,
  Modal,
  NullableNumberInput,
  PageBackButton,
  PageContainer,
  PageHeader,
  StatusTag,
  Toast,
} from "@/components/foundation";
import { usePermissions } from "@/features/permissions";
import { orderRepository } from "@/features/order-center/repository/order-repository";
import type { SalesOrder } from "@/features/order-center/model/order";
import { operationsSettingsRepository } from "@/features/operations-settings/repository/operations-settings-repository";
import type { OperationsSettingsState } from "@/features/operations-settings/model/operations-settings";
import { productionSchedulingRepository } from "@/features/production-scheduling/repository/production-scheduling-repository";
import type {
  ProductionSchedulingState,
  ScheduleAssignment,
} from "@/features/production-scheduling/model/production-scheduling";
import {
  createClosingAllocationLog,
  createClosingPeriodLog,
  createOperationId,
  operationLogRepository,
} from "@/features/operation-logs";
import {
  acknowledgeAllocationSchedule,
  allocationOutput,
  allocationWarnings,
  allocationsForClosingPeriod,
  closingRepository,
  createAllocationDraft,
  createClosingPeriod,
  filterClosingPeriods,
  getAssignmentsForClosing,
  groupClosingPeriodsByYear,
  projectMonthlyTargetBalance,
  projectOrderClosing,
  projectOrderProductionForClosing,
  saveClosingAllocation,
  sortClosingPeriodsLatestFirst,
  summarizeClosing,
  syncAllocationSchedule,
  transitionClosingPeriod,
  voidClosingAllocation,
  type ClosingAllocation,
  type ClosingPeriodStatus,
  type ClosingState,
} from "..";

const emptyState: ClosingState = { periods: [], allocations: [] };
const emptyScheduling: ProductionSchedulingState = {
  scheduleAssignments: [],
  orderExecutionTrackings: [],
  scheduleBatches: [],
};
const statusText = {
  open: "开放中",
  confirmed: "已确认",
  locked: "已锁定",
} as const;
const closingStatusText = {
  unclosed: "未关账",
  partially_closed: "部分关账",
  closed: "已关账",
  over_allocated: "超额关账",
} as const;
const money = (value: number, digits = 2) =>
  `¥${value.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
const quantity = (value: number) => value.toLocaleString("zh-CN");
const thisMonth = () => new Date().toISOString().slice(0, 7);

type AllocationDraft = ClosingAllocation & { keepReason?: string };
type PeriodFilter = ClosingPeriodStatus | "all";

function executorName(
  assignment: ScheduleAssignment,
  settings: OperationsSettingsState,
) {
  return assignment.executionType === "internal"
    ? (settings.productionGroups.find(
        (item) => item.id === assignment.productionGroupId,
      )?.name ?? "历史生产组")
    : (settings.outsourceFactories.find(
        (item) => item.id === assignment.outsourceFactoryId,
      )?.name ?? "历史外发厂");
}

function ErrorLayer({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  if (!message || typeof document === "undefined") return null;
  return createPortal(
    <div className="cc-error qc-foundation-portal" role="alert">
      <span>{message}</span>
      <button type="button" aria-label="关闭错误提示" onClick={onClose}>
        ×
      </button>
    </div>,
    document.body,
  );
}

export function ClosingCenterPage({ detail = false }: { detail?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can, currentUser } = usePermissions();
  const actor = useMemo(
    () => ({ id: currentUser.id, name: currentUser.name }),
    [currentUser.id, currentUser.name],
  );
  const logActor = useMemo(
    () => ({ userId: currentUser.id, userName: currentUser.name }),
    [currentUser.id, currentUser.name],
  );
  const [overviewView, setOverviewView] = useState<"periods" | "balance">(
    "periods",
  );
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [state, setState] = useState<ClosingState>(emptyState);
  const [scheduling, setScheduling] =
    useState<ProductionSchedulingState>(emptyScheduling);
  const [settings, setSettings] = useState<OperationsSettingsState>(() =>
    operationsSettingsRepository.load(),
  );
  const [selectedMonth, setSelectedMonth] = useState(
    searchParams.get("month") ?? thisMonth(),
  );
  const [query, setQuery] = useState("");
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState(
    searchParams.get("orderId") ?? "",
  );
  const [periodDraft, setPeriodDraft] = useState<{
    month: string;
    taxRate: number | null;
    remark: string;
  } | null>(null);
  const [allocationDraft, setAllocationDraft] =
    useState<AllocationDraft | null>(null);
  const [transition, setTransition] = useState<{
    action: "lock" | "reopen";
    reason: string;
    acknowledged: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    Promise.all([
      orderRepository.list(),
      closingRepository.load(),
      productionSchedulingRepository.load(),
    ]).then(([nextOrders, nextClosing, nextScheduling]) => {
      setOrders(nextOrders);
      setState(nextClosing);
      setScheduling(nextScheduling);
      setSettings(operationsSettingsRepository.load());
      const requested = searchParams.get("month");
      setSelectedMonth(
        requested ??
          sortClosingPeriodsLatestFirst(nextClosing.periods)[0]?.month ??
          thisMonth(),
      );
    });
  }, [searchParams]);

  const sortedPeriods = useMemo(
    () => sortClosingPeriodsLatestFirst(state.periods),
    [state.periods],
  );
  const groupedPeriods = useMemo(
    () =>
      groupClosingPeriodsByYear(
        filterClosingPeriods(state.periods, periodFilter),
      ),
    [periodFilter, state.periods],
  );
  const selectedPeriod =
    state.periods.find((item) => item.month === selectedMonth) ?? null;
  const selectedPeriodId = selectedPeriod?.id ?? null;
  const periodAllocations = selectedPeriodId
    ? allocationsForClosingPeriod(state, selectedPeriodId)
    : [];
  const summary = summarizeClosing(periodAllocations);
  const periodOrderIds = new Set(
    periodAllocations.map((item) => item.salesOrderId),
  );
  const normalizedQuery = query.trim().normalize("NFKC").toLocaleLowerCase();
  const orderRows = orders
    .filter((order) => periodOrderIds.has(order.id))
    .map((order) => ({
      order,
      projection: projectOrderClosing(order, state),
      production: projectOrderProductionForClosing(order, scheduling),
    }))
    .filter(
      ({ order }) =>
        !normalizedQuery ||
        [
          order.orderNo,
          order.salesContractNo,
          order.styleNo,
          order.factoryStyleNo,
          order.styleName,
          order.customerNameSnapshot,
        ]
          .join(" ")
          .normalize("NFKC")
          .toLocaleLowerCase()
          .includes(normalizedQuery),
    );
  const pickerNeedle = pickerQuery
    .trim()
    .normalize("NFKC")
    .toLocaleLowerCase();
  const pickerOrders = orders
    .filter((order) => !periodOrderIds.has(order.id))
    .filter(
      (order) =>
        !pickerNeedle ||
        [order.orderNo, order.styleNo, order.styleName, order.customerNameSnapshot]
          .join(" ")
          .normalize("NFKC")
          .toLocaleLowerCase()
          .includes(pickerNeedle),
    )
    .slice(0, 40);
  const importedAllocations = periodAllocations
    .filter((item) => item.id.startsWith("closing-history-"))
    .map((allocation) => ({
      allocation,
      order: orders.find((order) => order.id === allocation.salesOrderId) ?? null,
    }));
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };
  const persist = async (next: ClosingState) => {
    const saved = await closingRepository.save(next);
    setState(saved);
    return saved;
  };

  if (!can("closing.view"))
    return (
      <AppShell title="关账中心">
        <PageContainer>
          <Card className="cc-empty">
            <strong>暂无关账查看权限</strong>
            <p>请联系管理员分配 closing.view 权限。</p>
          </Card>
        </PageContainer>
      </AppShell>
    );

  const savePeriod = async () => {
    if (!periodDraft || periodDraft.taxRate === null || !can("closing.edit"))
      return;
    setError("");
    try {
      const result = createClosingPeriod(state, {
        month: periodDraft.month,
        taxRateSnapshot: periodDraft.taxRate,
        remark: periodDraft.remark,
        actor,
      });
      await persist(result.state);
      await operationLogRepository.append(
        createClosingPeriodLog({
          after: result.period,
          actor: logActor,
          action: "创建关账月份",
        }),
      );
      setSelectedMonth(result.period.month);
      setPeriodDraft(null);
      notify("关账月份已创建");
      router.push(
        `/closing-center/detail?month=${encodeURIComponent(result.period.month)}`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建失败");
    }
  };

  const openAllocation = (
    order: SalesOrder,
    allocation?: ClosingAllocation,
  ) => {
    if (!selectedPeriod) return;
    const assignments = getAssignmentsForClosing(order, scheduling);
    const base = allocation
      ? structuredClone(allocation)
      : createAllocationDraft({
          period: selectedPeriod,
          order,
          assignment: assignments[0] ?? null,
          settings,
          actor,
        });
    setPickerOpen(false);
    setAllocationDraft(base);
  };

  const changeAssignment = (assignmentId: string) => {
    if (!allocationDraft || !selectedPeriod) return;
    const order = orders.find(
      (item) => item.id === allocationDraft.salesOrderId,
    );
    if (!order) return;
    const assignment =
      scheduling.scheduleAssignments.find((item) => item.id === assignmentId) ??
      null;
    const next = createAllocationDraft({
      period:
        state.periods.find(
          (item) => item.id === allocationDraft.closingPeriodId,
        ) ?? selectedPeriod,
      order,
      assignment,
      settings,
      actor,
    });
    const alreadySaved = state.allocations.some(
      (item) => item.id === allocationDraft.id,
    );
    setAllocationDraft({
      ...next,
      id: allocationDraft.id,
      quantity: alreadySaved ? allocationDraft.quantity : next.quantity,
      closingPeriodId: allocationDraft.closingPeriodId,
      remark: allocationDraft.remark,
      createdAt: allocationDraft.createdAt,
      createdBy: allocationDraft.createdBy,
      createdByName: allocationDraft.createdByName,
    });
  };

  const saveAllocation = async () => {
    if (!allocationDraft || !can("closing.edit")) return;
    setError("");
    try {
      const order = orders.find(
        (item) => item.id === allocationDraft.salesOrderId,
      );
      if (!order) throw new Error("订单不存在");
      const result = saveClosingAllocation(state, allocationDraft, actor);
      await persist(result.state);
      const operationId = createOperationId();
      if (!result.before) {
        await operationLogRepository.append(
          createClosingAllocationLog({
            after: result.allocation,
            actor: logActor,
            action: "新增关账归属",
            orderNo: order.orderNo,
            styleNo: order.styleNo,
            operationId,
          }),
        );
      } else {
        const { before, allocation: after } = result;
        const changes: Array<{
          action: Parameters<typeof createClosingAllocationLog>[0]["action"];
          fields: string[];
        }> = [];
        if (before.closingPeriodId !== after.closingPeriodId)
          changes.push({ action: "调整关账月份", fields: ["月份ID"] });
        if (before.quantity !== after.quantity)
          changes.push({ action: "调整关账数量", fields: ["关账数量"] });
        if (
          before.closingProcessingUnitPrice !==
            after.closingProcessingUnitPrice ||
          before.processingCurrencySnapshot !== after.processingCurrencySnapshot
        )
          changes.push({
            action: "修改关账工价",
            fields: ["关账工价", "加工币种"],
          });
        if (before.fxRateSnapshot !== after.fxRateSnapshot)
          changes.push({ action: "调整关账汇率", fields: ["汇率"] });
        if (before.salePriceSnapshot !== after.salePriceSnapshot)
          changes.push({ action: "调整关账销售价", fields: ["销售价"] });
        if (before.taxRateSnapshot !== after.taxRateSnapshot)
          changes.push({ action: "调整关账税率", fields: ["税率"] });
        if (
          before.scheduleAssignmentId !== after.scheduleAssignmentId ||
          before.executionTypeSnapshot !== after.executionTypeSnapshot ||
          before.productionGroupIdSnapshot !== after.productionGroupIdSnapshot ||
          before.outsourceFactoryIdSnapshot !== after.outsourceFactoryIdSnapshot
        )
          changes.push({
            action: "调整关账执行方",
            fields: ["执行类型", "执行方"],
          });
        if (!changes.length)
          changes.push({ action: "修改关账归属", fields: ["状态"] });
        await operationLogRepository.appendMany(
          changes.map((change, operationSequence) =>
            createClosingAllocationLog({
              before,
              after,
              actor: logActor,
              action: change.action,
              orderNo: order.orderNo,
              styleNo: order.styleNo,
              operationId,
              operationSequence,
              fields: change.fields,
            }),
          ),
        );
      }
      setAllocationDraft(null);
      notify("关账归属已保存");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败");
    }
  };

  const voidAllocation = async (allocation: ClosingAllocation) => {
    const reason = window.prompt("请输入作废原因");
    if (!reason) return;
    const order = orders.find((item) => item.id === allocation.salesOrderId);
    try {
      const result = voidClosingAllocation(state, allocation.id, actor, reason);
      await persist(result.state);
      await operationLogRepository.append(
        createClosingAllocationLog({
          before: result.before,
          after: result.allocation,
          actor: logActor,
          action: "作废关账归属",
          orderNo: order?.orderNo,
          styleNo: order?.styleNo,
          reason,
        }),
      );
      notify("关账归属已作废");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "作废失败");
    }
  };

  const periodWarningCount = selectedPeriod
    ? periodAllocations.reduce((sum, allocation) => {
        const order = orders.find(
          (item) => item.id === allocation.salesOrderId,
        );
        return (
          sum +
          (order
            ? allocationWarnings(
                allocation,
                order,
                state,
                scheduling,
                settings,
              ).length
            : 1)
        );
      }, 0)
    : 0;

  const simpleTransition = async (action: "confirm" | "unconfirm") => {
    if (!selectedPeriod) return;
    try {
      const result = transitionClosingPeriod(
        state,
        selectedPeriod.id,
        action,
        actor,
      );
      await persist(result.state);
      await operationLogRepository.append(
        createClosingPeriodLog({
          before: result.before,
          after: result.period,
          actor: logActor,
          action: action === "confirm" ? "确认关账月份" : "取消确认关账月份",
        }),
      );
      notify(action === "confirm" ? "关账月份已确认" : "已取消确认");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败");
    }
  };

  const saveTransition = async () => {
    if (!selectedPeriod || !transition) return;
    try {
      const result = transitionClosingPeriod(
        state,
        selectedPeriod.id,
        transition.action,
        actor,
        {
          reason: transition.reason,
          warningCount: periodWarningCount,
          warningsAcknowledged: transition.acknowledged,
        },
      );
      await persist(result.state);
      await operationLogRepository.append(
        createClosingPeriodLog({
          before: result.before,
          after: result.period,
          actor: logActor,
          action:
            transition.action === "lock"
              ? "锁定关账月份"
              : "重新打开关账月份",
          reason: transition.reason,
        }),
      );
      setTransition(null);
      notify(
        transition.action === "lock"
          ? "关账月份已锁定"
          : "关账月份已重新打开",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败");
    }
  };

  const syncSchedule = async (allocation: ClosingAllocation) => {
    const order = orders.find((item) => item.id === allocation.salesOrderId);
    if (!order) return;
    try {
      const result = syncAllocationSchedule(
        state,
        allocation.id,
        scheduling,
        settings,
        actor,
      );
      await persist(result.state);
      await operationLogRepository.append(
        createClosingAllocationLog({
          before: result.before,
          after: result.allocation,
          actor: logActor,
          action: "同步排单快照",
          orderNo: order.orderNo,
          styleNo: order.styleNo,
        }),
      );
      notify("已同步当前排单快照");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "同步失败");
    }
  };

  const keepSchedule = async (allocation: ClosingAllocation) => {
    const reason = window.prompt("请填写保留原关账快照的原因");
    if (!reason) return;
    const order = orders.find((item) => item.id === allocation.salesOrderId);
    if (!order) return;
    try {
      const result = acknowledgeAllocationSchedule(
        state,
        allocation.id,
        scheduling,
        settings,
        actor,
        reason,
      );
      await persist(result.state);
      await operationLogRepository.append(
        createClosingAllocationLog({
          before: result.before,
          after: result.allocation,
          actor: logActor,
          action: "保留关账快照",
          orderNo: order.orderNo,
          styleNo: order.styleNo,
          reason,
        }),
      );
      notify("已确认保留原关账快照");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "确认失败");
    }
  };

  const periodModal = (
    <Modal
      open={Boolean(periodDraft)}
      title="新建关账月份"
      description="税率在创建时形成快照；后续全局默认值变化不会污染该月份。"
      onClose={() => setPeriodDraft(null)}
      onSubmit={savePeriod}
      footer={
        <>
          <Button variant="secondary" onClick={() => setPeriodDraft(null)}>
            取消
          </Button>
          <Button type="submit" permission="closing.edit">
            创建月份
          </Button>
        </>
      }
    >
      {periodDraft && (
        <div className="qc-modal-form">
          <FormItem label="月份" required>
            <input
              type="month"
              className="qc-control"
              value={periodDraft.month}
              onChange={(event) =>
                setPeriodDraft({ ...periodDraft, month: event.target.value })
              }
            />
          </FormItem>
          <FormItem label="销售产值税率 %" required>
            <NullableNumberInput
              className="qc-control"
              min="0"
              value={periodDraft.taxRate}
              onValueChange={(value) =>
                setPeriodDraft({ ...periodDraft, taxRate: value })
              }
            />
          </FormItem>
          <FormItem label="备注">
            <textarea
              className="qc-control"
              value={periodDraft.remark}
              onChange={(event) =>
                setPeriodDraft({ ...periodDraft, remark: event.target.value })
              }
            />
          </FormItem>
        </div>
      )}
    </Modal>
  );

  if (!detail) {
    return (
      <AppShell title="关账中心">
        <PageContainer>
          <PageHeader
            eyebrow="CLOSING CENTER"
            title="关账中心"
            description="按年份浏览关账月份；最新月份优先，确认与锁定保持独立。"
            actions={
              <Button
                permission="closing.edit"
                onClick={() =>
                  setPeriodDraft({
                    month: thisMonth(),
                    taxRate:
                      settings.closingSettings.defaultSalesTaxRatePercent,
                    remark: "",
                  })
                }
              >
                ＋ 新建月份
              </Button>
            }
          />
          <Card className="cc-toolbar cc-overview-toolbar">
            <div className="cc-tabs">
              <button
                className={overviewView === "periods" ? "active" : ""}
                onClick={() => setOverviewView("periods")}
              >
                月份总览
              </button>
              <button
                className={overviewView === "balance" ? "active" : ""}
                onClick={() => setOverviewView("balance")}
              >
                产值平衡
              </button>
            </div>
            {overviewView === "periods" && (
              <div className="cc-filter-tabs" aria-label="关账月份状态">
                {(
                  [
                    ["all", "全部"],
                    ["open", "开放中"],
                    ["confirmed", "已确认"],
                    ["locked", "已锁定"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    className={periodFilter === value ? "active" : ""}
                    onClick={() => setPeriodFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </Card>

          {overviewView === "periods" && (
            <div className="cc-year-groups">
              {groupedPeriods.map((group) => (
                <section key={group.year} className="cc-year-group">
                  <header>
                    <h2>{group.year}</h2>
                    <span>{group.periods.length} 个月份</span>
                  </header>
                  <div className="cc-month-grid">
                    {group.periods.map((period) => {
                      const allocations = allocationsForClosingPeriod(
                        state,
                        period.id,
                      );
                      const monthSummary = summarizeClosing(allocations);
                      return (
                        <button
                          type="button"
                          className="cc-month-card"
                          key={period.id}
                          onClick={() =>
                            router.push(
                              `/closing-center/detail?month=${encodeURIComponent(period.month)}`,
                            )
                          }
                        >
                          <span className="cc-month-card-head">
                            <strong>{period.month}</strong>
                            <StatusTag
                              tone={
                                period.status === "locked"
                                  ? "danger"
                                  : period.status === "confirmed"
                                    ? "success"
                                    : "neutral"
                              }
                            >
                              {statusText[period.status]}
                            </StatusTag>
                          </span>
                          <span className="cc-month-card-metrics">
                            <span>
                              <small>关账数量</small>
                              <b>{quantity(monthSummary.quantity)}</b>
                            </span>
                            <span>
                              <small>加工产值</small>
                              <b>{money(monthSummary.processingOutputRmb)}</b>
                            </span>
                            <span>
                              <small>归属</small>
                              <b>{allocations.length} 条</b>
                            </span>
                          </span>
                          <span className="cc-month-card-open">进入月份 →</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
              {!groupedPeriods.length && (
                <Card className="cc-empty">
                  <strong>当前分类没有关账月份</strong>
                  <p>切换状态分类，或创建新的关账月份。</p>
                </Card>
              )}
            </div>
          )}

          {overviewView === "balance" && (
            <Card className="cc-balance">
              <div className="cc-balance-row head">
                <span>月份</span>
                <span>总加工目标</span>
                <span>当前加工</span>
                <span>差额 / 达成率</span>
                <span>内部目标</span>
                <span>当前内部</span>
                <span>外发 / 待分配</span>
              </div>
              {sortedPeriods.map((period) => {
                const actual = summarizeClosing(
                  allocationsForClosingPeriod(state, period.id),
                );
                const target =
                  settings.closingSettings.monthlyProductionTargets.find(
                    (item) => item.month === period.month,
                  );
                const balance = projectMonthlyTargetBalance(actual, target);
                return (
                  <button
                    type="button"
                    className="cc-balance-row"
                    key={period.id}
                    onClick={() =>
                      router.push(
                        `/closing-center/detail?month=${encodeURIComponent(period.month)}`,
                      )
                    }
                  >
                    <span>
                      <strong>{period.month}</strong>
                      <small>{statusText[period.status]}</small>
                    </span>
                    <span>
                      {balance.total.target === null
                        ? "—"
                        : money(balance.total.target)}
                    </span>
                    <span>{money(balance.total.actual)}</span>
                    <span>
                      {balance.total.difference === null
                        ? "—"
                        : `${money(balance.total.difference)} / ${(balance.total.completionRate ?? 0).toFixed(1)}%`}
                    </span>
                    <span>
                      {balance.internal.target === null
                        ? "—"
                        : money(balance.internal.target)}
                    </span>
                    <span>{money(balance.internal.actual)}</span>
                    <span>
                      {money(balance.outsourceActual)} /{" "}
                      {money(balance.pendingActual)}
                    </span>
                  </button>
                );
              })}
            </Card>
          )}
          {periodModal}
          <ErrorLayer message={error} onClose={() => setError("")} />
          <Toast message={toast} />
        </PageContainer>
      </AppShell>
    );
  }

  const changeMonth = (month: string) => {
    setSelectedMonth(month);
    setExpandedOrderId("");
    setQuery("");
    router.replace(`/closing-center/detail?month=${encodeURIComponent(month)}`);
  };

  return (
    <AppShell title="关账中心">
      <PageContainer>
        <PageHeader
          variant="object"
          eyebrow="CLOSING MONTH"
          title={selectedPeriod?.month ?? selectedMonth}
          back={
            <PageBackButton fallbackHref="/closing-center" label="返回关账中心" />
          }
          status={
            selectedPeriod ? (
              <StatusTag
                tone={
                  selectedPeriod.status === "locked"
                    ? "danger"
                    : selectedPeriod.status === "confirmed"
                      ? "success"
                      : "neutral"
                }
              >
                {statusText[selectedPeriod.status]}
              </StatusTag>
            ) : null
          }
          description="月份路由决定归属、KPI、筛选和全部操作；订单、排单、生产与关账数量相互独立。"
          actions={
            selectedPeriod && selectedPeriod.status !== "locked" ? (
              <Button
                permission="closing.edit"
                onClick={() => setPickerOpen(true)}
              >
                ＋ 新增归属
              </Button>
            ) : null
          }
        />

        <Card className="cc-toolbar cc-detail-toolbar">
          <label>
            <span>切换月份</span>
            <select
              className="qc-control"
              aria-label="切换月份"
              value={selectedMonth}
              onChange={(event) => changeMonth(event.target.value)}
            >
              {sortedPeriods.map((period) => (
                <option key={period.id} value={period.month}>
                  {period.month} · {statusText[period.status]}
                </option>
              ))}
              {!sortedPeriods.length && (
                <option value={selectedMonth}>{selectedMonth} · 未创建</option>
              )}
            </select>
          </label>
          <input
            className="qc-control"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索本月订单、款号、客户"
          />
        </Card>

        {selectedPeriod ? (
          <>
            <Card className="cc-period-head">
              <div>
                <small>关账月份</small>
                <strong>{selectedPeriod.month}</strong>
                <StatusTag
                  tone={
                    selectedPeriod.status === "locked"
                      ? "danger"
                      : selectedPeriod.status === "confirmed"
                        ? "success"
                        : "neutral"
                  }
                >
                  {statusText[selectedPeriod.status]}
                </StatusTag>
              </div>
              <dl>
                <div>
                  <dt>关账数量</dt>
                  <dd>{quantity(summary.quantity)}</dd>
                </div>
                <div>
                  <dt>加工产值</dt>
                  <dd>{money(summary.processingOutputRmb)}</dd>
                </div>
                <div>
                  <dt>内部</dt>
                  <dd>{money(summary.internalProcessingOutputRmb)}</dd>
                </div>
                <div>
                  <dt>外发</dt>
                  <dd>{money(summary.outsourceProcessingOutputRmb)}</dd>
                </div>
                <div>
                  <dt>待分配</dt>
                  <dd>{money(summary.pendingProcessingOutputRmb)}</dd>
                </div>
                <div>
                  <dt>销售产值</dt>
                  <dd>{summary.salesOutputWan.toFixed(2)} 万</dd>
                </div>
              </dl>
              <div className="cc-period-actions">
                {selectedPeriod.status === "open" && (
                  <Button
                    permission="closing.confirm"
                    variant="secondary"
                    onClick={() => void simpleTransition("confirm")}
                  >
                    确认月份
                  </Button>
                )}
                {selectedPeriod.status === "confirmed" && (
                  <>
                    <Button
                      permission="closing.confirm"
                      variant="secondary"
                      onClick={() => void simpleTransition("unconfirm")}
                    >
                      取消确认
                    </Button>
                    <Button
                      permission="closing.lock"
                      onClick={() =>
                        setTransition({
                          action: "lock",
                          reason: "",
                          acknowledged: false,
                        })
                      }
                    >
                      锁定月份
                    </Button>
                  </>
                )}
                {selectedPeriod.status === "locked" && (
                  <Button
                    permission="closing.reopen"
                    variant="danger"
                    onClick={() =>
                      setTransition({
                        action: "reopen",
                        reason: "",
                        acknowledged: false,
                      })
                    }
                  >
                    重新打开
                  </Button>
                )}
              </div>
            </Card>

            {periodWarningCount > 0 && (
              <Card className="cc-warning">
                ⚠ 当前月份共有 {periodWarningCount} 项关账预警；预警不自动改写快照，锁账前需明确确认。
              </Card>
            )}

            <Card className="cc-order-table">
              <div className="cc-order-row head">
                <span>订单 / 款式</span>
                <span>客户</span>
                <span>订单数量</span>
                <span>已排</span>
                <span>已生产</span>
                <span>本月关账</span>
                <span>累计关账</span>
                <span>状态 / 操作</span>
              </div>
              {orderRows.map(({ order, projection, production }) => {
                const allocations = periodAllocations.filter(
                  (item) => item.salesOrderId === order.id,
                );
                const monthQty = allocations.reduce(
                  (sum, item) => sum + item.quantity,
                  0,
                );
                return (
                  <div key={order.id} className="cc-order-group">
                    <div className="cc-order-row">
                      <span>
                        <strong>{order.orderNo}</strong>
                        <small>
                          {order.styleNo} · {order.styleName}
                        </small>
                      </span>
                      <span>{order.customerNameSnapshot}</span>
                      <span>{quantity(projection.effectiveQuantity)}</span>
                      <span>{quantity(production.scheduledQuantity)}</span>
                      <span>{quantity(production.completedQuantity)}</span>
                      <span>{quantity(monthQty)}</span>
                      <span>{quantity(projection.allocatedQuantity)}</span>
                      <span className="cc-row-actions">
                        <StatusTag
                          tone={
                            projection.status === "closed"
                              ? "success"
                              : projection.status === "over_allocated"
                                ? "danger"
                                : "neutral"
                          }
                        >
                          {closingStatusText[projection.status]}
                        </StatusTag>
                        <Button
                          variant="text"
                          onClick={() =>
                            setExpandedOrderId(
                              expandedOrderId === order.id ? "" : order.id,
                            )
                          }
                        >
                          {expandedOrderId === order.id ? "收起" : "明细"}
                        </Button>
                        <Button
                          permission="closing.edit"
                          variant="text"
                          disabled={selectedPeriod.status === "locked"}
                          onClick={() => openAllocation(order)}
                        >
                          ＋ 归属
                        </Button>
                      </span>
                    </div>
                    {expandedOrderId === order.id && (
                      <div className="cc-allocation-list">
                        {allocations.map((allocation) => {
                          const output = allocationOutput(allocation);
                          const warnings = allocationWarnings(
                            allocation,
                            order,
                            state,
                            scheduling,
                            settings,
                          );
                          return (
                            <article key={allocation.id}>
                              <div>
                                <strong>
                                  {allocation.productionGroupNameSnapshot ??
                                    allocation.outsourceFactoryNameSnapshot ??
                                    "待分配"}
                                </strong>
                                <small>
                                  {allocation.scheduleAssignmentId
                                    ? `排单 ${allocation.scheduleAssignmentId.slice(-6)}`
                                    : "未关联排单"}{" "}
                                  · {quantity(allocation.quantity)} 件
                                </small>
                              </div>
                              <div>
                                <strong>{money(output.processingOutputRmb)}</strong>
                                <small>
                                  {output.originalCurrency}{" "}
                                  {output.originalAmount.toFixed(2)}
                                  {output.salesOutputWan === null
                                    ? " · 销售 —"
                                    : ` · 销售 ${output.salesOutputWan.toFixed(2)} 万`}
                                </small>
                              </div>
                              <div className="cc-allocation-warnings">
                                {warnings.map((warning) => (
                                  <span key={warning.code}>
                                    ⚠ {warning.message}
                                  </span>
                                ))}
                              </div>
                              <div>
                                {warnings.some(
                                  (item) => item.code === "schedule-stale",
                                ) && selectedPeriod.status !== "locked" && (
                                  <>
                                    <Button
                                      permission="closing.edit"
                                      variant="text"
                                      onClick={() => void syncSchedule(allocation)}
                                    >
                                      同步排单
                                    </Button>
                                    <Button
                                      permission="closing.edit"
                                      variant="text"
                                      onClick={() => void keepSchedule(allocation)}
                                    >
                                      保留快照
                                    </Button>
                                  </>
                                )}
                                <Button
                                  permission="closing.edit"
                                  variant="text"
                                  disabled={selectedPeriod.status === "locked"}
                                  onClick={() => openAllocation(order, allocation)}
                                >
                                  编辑
                                </Button>
                                <Button
                                  permission="closing.edit"
                                  variant="text"
                                  disabled={selectedPeriod.status === "locked"}
                                  onClick={() => void voidAllocation(allocation)}
                                >
                                  作废
                                </Button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {!orderRows.length && (
                <div className="cc-month-empty">
                  <strong>
                    {query ? "本月没有匹配的关账订单" : "本月尚无关账归属"}
                  </strong>
                  {!query && selectedPeriod.status !== "locked" && (
                    <Button
                      permission="closing.edit"
                      variant="secondary"
                      onClick={() => setPickerOpen(true)}
                    >
                      选择订单添加归属
                    </Button>
                  )}
                </div>
              )}
            </Card>

            {importedAllocations.length > 0 && (
              <Card className="cc-imported-table">
                <div className="as-section-head">
                  <h2>本月已导入真实关账</h2>
                  <span>
                    共 {importedAllocations.length} 条 · currencySnapshot = USD
                  </span>
                </div>
                <div className="cc-imported-row head">
                  <span>销售合同</span>
                  <span>款号 / 工厂款号</span>
                  <span>关账数量</span>
                  <span>客户工价</span>
                  <span>代购辅料</span>
                  <span>柬厂结算单价</span>
                  <span>执行方</span>
                </div>
                {importedAllocations.map(({ allocation, order }) => (
                  <div className="cc-imported-row" key={allocation.id}>
                    <span>
                      {allocation.salesContractNoSnapshot ??
                        order?.salesContractNo ??
                        "—"}
                    </span>
                    <span>
                      <strong>{order?.styleNo ?? "历史款"}</strong>
                      <small>{order?.factoryStyleNo || "—"}</small>
                    </span>
                    <span>{quantity(allocation.quantity)}</span>
                    <span>
                      USD {allocation.customerProcessingUnitPriceSnapshot.toFixed(2)}
                    </span>
                    <span>
                      {allocation.purchasedTrimUnitCostSnapshot === null
                        ? "—"
                        : `USD ${allocation.purchasedTrimUnitCostSnapshot.toFixed(2)}`}
                    </span>
                    <span>
                      USD {allocation.factorySettlementUnitPriceSnapshot.toFixed(2)}
                    </span>
                    <span>
                      {allocation.productionGroupNameSnapshot ??
                        allocation.outsourceFactoryNameSnapshot ??
                        "待分配"}
                    </span>
                  </div>
                ))}
              </Card>
            )}
          </>
        ) : (
          <Card className="cc-empty">
            <strong>{selectedMonth} 尚未创建关账月份</strong>
            <p>返回月份总览，或创建该月份后再录入关账事实。</p>
            <div>
              <Button
                variant="secondary"
                onClick={() => router.push("/closing-center")}
              >
                返回月份总览
              </Button>
              <Button
                permission="closing.edit"
                onClick={() =>
                  setPeriodDraft({
                    month: selectedMonth,
                    taxRate:
                      settings.closingSettings.defaultSalesTaxRatePercent,
                    remark: "",
                  })
                }
              >
                创建该月份
              </Button>
            </div>
          </Card>
        )}

        {periodModal}
        <Modal
          open={pickerOpen}
          title="选择订单添加归属"
          description={`只会写入 ${selectedMonth} 的新关账快照。`}
          onClose={() => setPickerOpen(false)}
          footer={
            <Button variant="secondary" onClick={() => setPickerOpen(false)}>
              关闭
            </Button>
          }
        >
          <div className="cc-order-picker">
            <input
              className="qc-control"
              placeholder="搜索订单号、款号、客户"
              value={pickerQuery}
              onChange={(event) => setPickerQuery(event.target.value)}
            />
            <div>
              {pickerOrders.map((order) => (
                <button
                  type="button"
                  key={order.id}
                  onClick={() => openAllocation(order)}
                >
                  <strong>
                    {order.styleNo} · {order.orderNo}
                  </strong>
                  <span>{order.customerNameSnapshot}</span>
                </button>
              ))}
              {!pickerOrders.length && <p>没有可添加的订单。</p>}
            </div>
          </div>
        </Modal>
        <Modal
          open={Boolean(allocationDraft)}
          title="调整关账"
          description="保存的是本月关账快照；不会回写订单价格、排单或完成数量。"
          onClose={() => setAllocationDraft(null)}
          onSubmit={saveAllocation}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setAllocationDraft(null)}
              >
                取消
              </Button>
              <Button type="submit" permission="closing.edit">
                保存归属
              </Button>
            </>
          }
        >
          {allocationDraft &&
            (() => {
              const order = orders.find(
                (item) => item.id === allocationDraft.salesOrderId,
              );
              const assignments = order
                ? getAssignmentsForClosing(order, scheduling)
                : [];
              return (
                <div className="qc-modal-form">
                  <FormItem label="订单">
                    <input
                      className="qc-control"
                      disabled
                      value={
                        order
                          ? `${order.orderNo} · ${order.styleNo}`
                          : allocationDraft.salesOrderId
                      }
                    />
                  </FormItem>
                  <FormItem label="归属月份">
                    <select
                      className="qc-control"
                      value={allocationDraft.closingPeriodId}
                      onChange={(event) =>
                        setAllocationDraft({
                          ...allocationDraft,
                          closingPeriodId: event.target.value,
                        })
                      }
                    >
                      {sortedPeriods
                        .filter(
                          (item) =>
                            item.status !== "locked" ||
                            item.id === allocationDraft.closingPeriodId,
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.month} · {statusText[item.status]}
                          </option>
                        ))}
                    </select>
                  </FormItem>
                  <FormItem label="引用排单">
                    <select
                      className="qc-control"
                      value={allocationDraft.scheduleAssignmentId ?? ""}
                      onChange={(event) => changeAssignment(event.target.value)}
                    >
                      <option value="">不关联排单（待分配）</option>
                      {assignments.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.executionType === "internal" ? "内部" : "外发"} ·{" "}
                          {executorName(item, settings)} ·{" "}
                          {quantity(item.plannedQuantity)} 件
                        </option>
                      ))}
                    </select>
                  </FormItem>
                  <FormItem label="关账数量" required>
                    <NullableNumberInput
                      className="qc-control"
                      min="0"
                      value={allocationDraft.quantity}
                      onValueChange={(value) =>
                        setAllocationDraft({
                          ...allocationDraft,
                          quantity: value ?? 0,
                        })
                      }
                    />
                  </FormItem>
                  <FormItem label="关账工价" required>
                    <NullableNumberInput
                      className="qc-control"
                      min="0"
                      value={allocationDraft.closingProcessingUnitPrice}
                      onValueChange={(value) =>
                        setAllocationDraft({
                          ...allocationDraft,
                          closingProcessingUnitPrice: value ?? 0,
                        })
                      }
                    />
                  </FormItem>
                  <FormItem label="加工币种">
                    <select
                      className="qc-control"
                      value={allocationDraft.processingCurrencySnapshot}
                      onChange={(event) =>
                        setAllocationDraft({
                          ...allocationDraft,
                          processingCurrencySnapshot: event.target.value as
                            | "CNY"
                            | "USD",
                          fxRateSnapshot:
                            event.target.value === "CNY"
                              ? null
                              : allocationDraft.fxRateSnapshot,
                        })
                      }
                    >
                      <option value="CNY">CNY</option>
                      <option value="USD">USD</option>
                    </select>
                  </FormItem>
                  <FormItem label="USD/CNY 汇率">
                    <NullableNumberInput
                      className="qc-control"
                      min="0"
                      disabled={
                        allocationDraft.processingCurrencySnapshot === "CNY"
                      }
                      value={allocationDraft.fxRateSnapshot}
                      onValueChange={(value) =>
                        setAllocationDraft({
                          ...allocationDraft,
                          fxRateSnapshot: value,
                        })
                      }
                    />
                  </FormItem>
                  <FormItem label="销售价快照">
                    <NullableNumberInput
                      className="qc-control"
                      min="0"
                      disabled={allocationDraft.orderTypeSnapshot === "processing"}
                      value={allocationDraft.salePriceSnapshot}
                      onValueChange={(value) =>
                        setAllocationDraft({
                          ...allocationDraft,
                          salePriceSnapshot: value,
                        })
                      }
                    />
                  </FormItem>
                  <FormItem label="税率 %">
                    <NullableNumberInput
                      className="qc-control"
                      min="0"
                      value={allocationDraft.taxRateSnapshot}
                      onValueChange={(value) =>
                        setAllocationDraft({
                          ...allocationDraft,
                          taxRateSnapshot: value ?? 0,
                        })
                      }
                    />
                  </FormItem>
                  <FormItem label="备注">
                    <textarea
                      className="qc-control"
                      value={allocationDraft.remark}
                      onChange={(event) =>
                        setAllocationDraft({
                          ...allocationDraft,
                          remark: event.target.value,
                        })
                      }
                    />
                  </FormItem>
                </div>
              );
            })()}
        </Modal>
        <Modal
          open={Boolean(transition)}
          title={
            transition?.action === "lock" ? "锁定关账月份" : "重新打开月份"
          }
          description={
            transition?.action === "lock"
              ? "锁定后所有普通关账编辑将被拒绝。"
              : "重新打开属于高权限修正，必须保留原因和操作日志。"
          }
          onClose={() => setTransition(null)}
          onSubmit={saveTransition}
          footer={
            <>
              <Button variant="secondary" onClick={() => setTransition(null)}>
                取消
              </Button>
              <Button
                type="submit"
                variant={transition?.action === "reopen" ? "danger" : "primary"}
                permission={
                  transition?.action === "reopen"
                    ? "closing.reopen"
                    : "closing.lock"
                }
              >
                确认
              </Button>
            </>
          }
        >
          {transition && (
            <div className="qc-modal-form">
              {transition.action === "lock" && periodWarningCount > 0 && (
                <label className="cc-check">
                  <input
                    type="checkbox"
                    checked={transition.acknowledged}
                    onChange={(event) =>
                      setTransition({
                        ...transition,
                        acknowledged: event.target.checked,
                      })
                    }
                  />
                  我已检查并接受当前 {periodWarningCount} 项预警
                </label>
              )}
              <FormItem
                label="原因"
                required={
                  transition.action === "reopen" || periodWarningCount > 0
                }
              >
                <textarea
                  className="qc-control"
                  value={transition.reason}
                  onChange={(event) =>
                    setTransition({ ...transition, reason: event.target.value })
                  }
                />
              </FormItem>
            </div>
          )}
        </Modal>
        <ErrorLayer message={error} onClose={() => setError("")} />
        <Toast message={toast} />
      </PageContainer>
    </AppShell>
  );
}

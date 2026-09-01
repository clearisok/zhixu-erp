import { normalizeOrderNo, normalizeSalesOrderV10, validateOrderCollection, type SalesOrder } from "../model/order.ts";
import { suggestOrderNo } from "../service/order-service.ts";

type LegacyOrderPriceVersion = Omit<SalesOrder["priceVersions"][number], "salesOrderId"> & { orderItemId: string };
type LegacyOrderQuantityChange = Omit<SalesOrder["quantityChanges"][number], "salesOrderId"> & { orderItemId: string };
type LegacyDeliveryPlan = Omit<SalesOrder["deliveryPlans"][number], "salesOrderId"> & { orderItemId: string };

/** Migration-only reader for the v5 multi-style runtime model. */
export type LegacyOrderItem = {
  id: string;
  sourceQuoteId: string | null;
  sourceRevisionId: string | null;
  sourcePriceVersionId: string | null;
  sourceOrderItemId: string | null;
  styleNo: string;
  styleName: string;
  brandId: string | null;
  brandNameSnapshot: string;
  productionCountry: string;
  processDescription: string;
  customerRequirement: string;
  remark: string;
  initialQuantity: number;
  fabricExecutionSnapshots: SalesOrder["fabricExecutionSnapshots"];
  trimExecutionSnapshots: SalesOrder["trimExecutionSnapshots"];
  quantityChanges: LegacyOrderQuantityChange[];
  deliveryPlans: LegacyDeliveryPlan[];
  priceVersions: LegacyOrderPriceVersion[];
  currentPriceVersionId: string;
  imageAttachmentIds: string[];
  fileAttachmentIds: string[];
  styleImageAttachmentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LegacySalesOrderV5 = Omit<SalesOrder,
  | "sourceQuoteId"
  | "sourceRevisionId"
  | "sourcePriceVersionId"
  | "styleNo"
  | "styleName"
  | "brandId"
  | "brandNameSnapshot"
  | "productionCountry"
  | "processDescription"
  | "customerRequirement"
  | "initialQuantity"
  | "fabricExecutionSnapshots"
  | "trimExecutionSnapshots"
  | "quantityChanges"
  | "deliveryPlans"
  | "priceVersions"
  | "currentPriceVersionId"
  | "imageAttachmentIds"
  | "fileAttachmentIds"
  | "styleImageAttachmentId"
> & { items: LegacyOrderItem[] };

export type OrderMigrationDiagnostic = {
  severity: "warning" | "error";
  code: string;
  message: string;
  legacyOrderId?: string;
  legacyOrderItemId?: string;
};

export type OrderMigrationResult = {
  orders: SalesOrder[];
  legacyOrderItemToSalesOrderId: Record<string, string>;
  diagnostics: OrderMigrationDiagnostic[];
  migrated: boolean;
};

export class OrderMigrationError extends Error {
  readonly diagnostics: OrderMigrationDiagnostic[];

  constructor(diagnostics: OrderMigrationDiagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join("；"));
    this.name = "OrderMigrationError";
    this.diagnostics = diagnostics;
  }
}

function mergeRemarks(orderRemark: string, itemRemark: string): string {
  const values = [orderRemark.trim(), itemRemark.trim()].filter(Boolean);
  return [...new Set(values)].join("\n");
}

function migratedOrderId(legacyOrderId: string, legacyOrderItemId: string): string {
  return `sales-order-v6-${legacyOrderId}-${legacyOrderItemId}`;
}

function fail(code: string, message: string, legacyOrderId?: string, legacyOrderItemId?: string): never {
  throw new OrderMigrationError([{ severity: "error", code, message, legacyOrderId, legacyOrderItemId }]);
}

function assertLegacyCollection(value: unknown): LegacySalesOrderV5[] {
  if (!Array.isArray(value)) fail("orders.invalid", "订单 v5 数据不是数组，已保留原始记录");
  const orders = value as LegacySalesOrderV5[];
  const orderIds = new Set<string>();
  const orderNos = new Set<string>();
  const itemIds = new Set<string>();
  for (const order of orders) {
    if (!order || typeof order !== "object" || !Array.isArray(order.items)) fail("order.invalid", "订单 v5 聚合结构无效，已保留原始记录");
    if (!order.id || orderIds.has(order.id)) fail("order.id.duplicate", `旧订单存在重复 ID：${order.id || "（空）"}`, order.id);
    orderIds.add(order.id);
    const normalizedOrderNo = normalizeOrderNo(order.orderNo ?? "");
    if (!normalizedOrderNo || orderNos.has(normalizedOrderNo)) fail("order.orderNo.duplicate", `旧订单号无效或重复：${order.orderNo || "（空）"}`, order.id);
    orderNos.add(normalizedOrderNo);
    if (!order.items.length) fail("order.items.empty", `旧订单 ${order.orderNo} 没有 OrderItem，无法安全提升，原始记录未覆盖`, order.id);
    for (const item of order.items) {
      if (!item?.id || itemIds.has(item.id)) fail("orderItem.id.duplicate", `旧订单款式存在重复 ID：${item?.id || "（空）"}`, order.id, item?.id);
      itemIds.add(item.id);
      if (!Array.isArray(item.priceVersions) || !item.priceVersions.length) fail("orderItem.price.empty", `旧订单 ${order.orderNo} · ${item.styleNo || item.id} 没有价格版本`, order.id, item.id);
      const current = item.priceVersions.find((version) => version.id === item.currentPriceVersionId);
      if (!current || current.orderItemId !== item.id) fail("orderItem.price.pointer", `旧订单 ${order.orderNo} · ${item.styleNo || item.id} 的 currentPriceVersionId 无效`, order.id, item.id);
      if (item.priceVersions.some((version) => version.orderItemId !== item.id)) fail("orderItem.price.owner", `旧订单 ${order.orderNo} · ${item.styleNo || item.id} 的价格历史归属损坏`, order.id, item.id);
      if (item.quantityChanges.some((change) => change.orderItemId !== item.id)) fail("orderItem.quantity.owner", `旧订单 ${order.orderNo} · ${item.styleNo || item.id} 的数量历史归属损坏`, order.id, item.id);
      if (item.deliveryPlans.some((plan) => plan.orderItemId !== item.id)) fail("orderItem.delivery.owner", `旧订单 ${order.orderNo} · ${item.styleNo || item.id} 的交期历史归属损坏`, order.id, item.id);
    }
  }
  return structuredClone(orders);
}

function liftPriceVersions(salesOrderId: string, versions: LegacyOrderPriceVersion[]): SalesOrder["priceVersions"] {
  return versions.map(({ orderItemId, ...version }) => { void orderItemId; return { ...version, salesOrderId }; });
}

function liftQuantityChanges(salesOrderId: string, changes: LegacyOrderQuantityChange[]): SalesOrder["quantityChanges"] {
  return changes.map(({ orderItemId, ...change }) => { void orderItemId; return { ...change, salesOrderId }; });
}

function liftDeliveryPlans(salesOrderId: string, plans: LegacyDeliveryPlan[]): SalesOrder["deliveryPlans"] {
  return plans.map(({ orderItemId, ...plan }) => { void orderItemId; return { ...plan, salesOrderId }; });
}

export function migrateOrderCollectionV5ToV6(value: unknown): OrderMigrationResult {
  if (Array.isArray(value) && value.every((entry) => !entry || typeof entry !== "object" || !("items" in entry))) {
    const orders = validateOrderCollection(value.map((entry) => normalizeSalesOrderV10(entry as SalesOrder)));
    return {
      orders,
      legacyOrderItemToSalesOrderId: {},
      diagnostics: [],
      migrated: false,
    };
  }

  const legacyOrders = assertLegacyCollection(value);
  const diagnostics: OrderMigrationDiagnostic[] = [];
  const mapping = new Map<string, string>();
  const usedIds = new Set(legacyOrders.map((order) => order.id));
  const usedOrderNos: Array<Pick<SalesOrder, "orderNo">> = legacyOrders.map((order) => ({ orderNo: order.orderNo }));

  for (const order of legacyOrders) {
    order.items.forEach((item, index) => {
      const nextId = index === 0 ? order.id : migratedOrderId(order.id, item.id);
      if (index > 0 && usedIds.has(nextId)) fail("migration.salesOrderId.collision", `拆单生成的 SalesOrder ID 冲突：${nextId}`, order.id, item.id);
      usedIds.add(nextId);
      mapping.set(item.id, nextId);
    });
  }

  const migratedOrders: SalesOrder[] = [];
  for (const legacyOrder of legacyOrders) {
    for (const [index, item] of legacyOrder.items.entries()) {
      const salesOrderId = mapping.get(item.id)!;
      const orderNo = index === 0 ? legacyOrder.orderNo : suggestOrderNo(usedOrderNos, legacyOrder.orderDate);
      if (index > 0) usedOrderNos.push({ orderNo });
      const mappedSourceOrderId = item.sourceOrderItemId ? mapping.get(item.sourceOrderItemId) : undefined;
      if (item.sourceOrderItemId && !mappedSourceOrderId) {
        diagnostics.push({ severity: "warning", code: "sourceOrderItemId.unresolved", message: `旧翻单来源 ${item.sourceOrderItemId} 无法解析；订单 ${orderNo} 保留原 sourceOrderId 作为兼容来源`, legacyOrderId: legacyOrder.id, legacyOrderItemId: item.id });
      }
      migratedOrders.push(normalizeSalesOrderV10({
        id: salesOrderId,
        orderNo,
        customerId: legacyOrder.customerId,
        customerNameSnapshot: legacyOrder.customerNameSnapshot,
        customerPoNo: legacyOrder.customerPoNo,
        sourceType: legacyOrder.sourceType,
        sourceOrderId: mappedSourceOrderId ?? legacyOrder.sourceOrderId,
        sourceQuoteId: item.sourceQuoteId,
        sourceRevisionId: item.sourceRevisionId,
        sourcePriceVersionId: item.sourcePriceVersionId,
        orderDate: legacyOrder.orderDate,
        salespersonId: legacyOrder.salespersonId,
        salespersonNameSnapshot: legacyOrder.salespersonNameSnapshot,
        merchandiserId: legacyOrder.merchandiserId,
        merchandiserNameSnapshot: legacyOrder.merchandiserNameSnapshot,
        orderType: legacyOrder.orderType,
        status: legacyOrder.status,
        styleNo: item.styleNo,
        styleName: item.styleName,
        brandId: item.brandId,
        brandNameSnapshot: item.brandNameSnapshot,
        productionCountry: item.productionCountry,
        processDescription: item.processDescription,
        customerRequirement: item.customerRequirement,
        remark: mergeRemarks(legacyOrder.remark, item.remark),
        initialQuantity: item.initialQuantity,
        fabricExecutionSnapshots: structuredClone(item.fabricExecutionSnapshots),
        trimExecutionSnapshots: structuredClone(item.trimExecutionSnapshots),
        quantityChanges: liftQuantityChanges(salesOrderId, item.quantityChanges),
        deliveryPlans: liftDeliveryPlans(salesOrderId, item.deliveryPlans),
        priceVersions: liftPriceVersions(salesOrderId, item.priceVersions),
        currentPriceVersionId: item.currentPriceVersionId,
        imageAttachmentIds: [...item.imageAttachmentIds],
        fileAttachmentIds: [...item.fileAttachmentIds],
        styleImageAttachmentId: item.styleImageAttachmentId,
        createdAt: legacyOrder.createdAt,
        updatedAt: legacyOrder.updatedAt.localeCompare(item.updatedAt) >= 0 ? legacyOrder.updatedAt : item.updatedAt,
        createdBy: legacyOrder.createdBy,
        updatedBy: legacyOrder.updatedBy,
      } as SalesOrder));
    }
  }

  const orders = validateOrderCollection(migratedOrders);
  diagnostics.push({ severity: "warning", code: "migration.completed", message: `订单 v5 → v6 已完成：${legacyOrders.length} 张旧订单迁移为 ${orders.length} 张单款 SalesOrder` });
  return { orders, legacyOrderItemToSalesOrderId: Object.fromEntries(mapping), diagnostics, migrated: true };
}

export function migrateOrderStorageRecordToV6(value: unknown, options: { schemaVersion: number; fallbackTimestamp: string }): { schemaVersion: number; initializedAt: string; updatedAt: string; data: SalesOrder[] } {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const payload = record && "data" in record ? record.data : value;
  return {
    schemaVersion: options.schemaVersion,
    initializedAt: record && typeof record.initializedAt === "string" ? record.initializedAt : options.fallbackTimestamp,
    updatedAt: record && typeof record.updatedAt === "string" ? record.updatedAt : options.fallbackTimestamp,
    data: migrateOrderCollectionV5ToV6(payload).orders,
  };
}

import { createClosingRepository, type ClosingRepository } from "../../features/closing-center/repository/closing-repository.ts";
import {
  createAllocationDraft,
  createClosingPeriod,
  projectOrderClosing,
  saveClosingAllocation,
  summarizeClosing,
  transitionClosingPeriod,
} from "../../features/closing-center/service/closing-service.ts";
import type { ClosingPeriod, ClosingState } from "../../features/closing-center/model/closing.ts";
import { browserLocalDataStore, type LocalDataStore } from "../../features/data-management/repository/local-data-store.ts";
import { activeDeliveryPlans, getCurrentPriceVersion, getEffectiveQuantity, normalizeOrderNo, validateOrderCollection, type SalesOrder } from "../../features/order-center/model/order.ts";
import { isUiQaDatasetOrder, UI_QA_DATASET_ID as ORDER_UI_QA_DATASET_ID } from "../../features/order-center/model/order-provenance.ts";
import { createOrderRepository, type OrderRepository } from "../../features/order-center/repository/order-repository.ts";
import {
  cancelOrder,
  changeOrderQuantity,
  confirmOrder,
  createManualOrder,
  createOrderFromQuote,
  createOrderPriceVersion,
  upsertDeliveryPlan,
  voidDeliveryPlan,
} from "../../features/order-center/service/order-service.ts";
import {
  DEFAULT_CAMBODIA_SITE_ID,
  DEFAULT_SUPPLY_HUB_ID,
  normalizeOperationsSettings,
  upsertProductionGroup,
  type OperationsSettingsState,
  type ProductionGroup,
} from "../../features/operations-settings/model/operations-settings.ts";
import { createOperationsSettingsRepository } from "../../features/operations-settings/repository/operations-settings-repository.ts";
import { validateProductionSchedulingState, type ProductionSchedulingState, type ScheduleAssignment } from "../../features/production-scheduling/model/production-scheduling.ts";
import { createProductionSchedulingRepository, type ProductionSchedulingRepository } from "../../features/production-scheduling/repository/production-scheduling-repository.ts";
import {
  buildProductionGroupOverview,
  createScheduleAssignment,
  projectOrderSchedule,
  recalculateInternalQueue,
  updateScheduleAssignment,
  upsertOrderExecutionTracking,
} from "../../features/production-scheduling/service/production-scheduling-service.ts";
import { calculatePriceVersionMetrics, copyPriceVersion } from "../../features/quote-center/model/quote-calculations.ts";
import {
  confirmationAggregateStatus,
  createRevisionFromSnapshot,
  summarizeRevisionConfirmations,
} from "../../features/quote-center/model/quote-workflows.ts";
import {
  createQuoteDraft,
  getDefaultRevision,
  type FabricCostLine,
  type PriceVersion,
  type Quote,
  type QuoteRevision,
  type TrimCostLine,
} from "../../features/quote-center/model/quote-view-model.ts";
import { createMockQuoteRepository } from "../../features/quote-center/repository/mock-quote-repository.ts";
import type { QuoteRepository } from "../../features/quote-center/repository/quote-repository.ts";

export const UI_QA_DATASET_ID = ORDER_UI_QA_DATASET_ID;
export const UI_QA_SEED = "zhixu-ui-redesign-2026";
export const UI_QA_MARKER = `UI-REDESIGN-QA · ${UI_QA_DATASET_ID}`;
export const UI_QA_ANCHOR_DATE = "2026-08-30";
export const UI_QA_GENERATED_AT = "2026-08-30T08:00:00.000+08:00";

const ACTOR = { id: "ui-qa-generator", name: "DEV/QA 数据生成器" };
const GROUP_NUMBERS = [...Array.from({ length: 13 }, (_, index) => index + 1), 15, 16];
const GROUP_ORDER_COUNTS = [9, 11, 8, 10, 12, 9, 11, 8, 10, 12, 9, 11, 8, 10, 12] as const;
const QUOTE_COUNT = 72;
const ORDER_COUNT = 168;
const SCHEDULED_ORDER_COUNT = GROUP_ORDER_COUNTS.reduce((total, count) => total + count, 0);
const CUSTOMER_NAMES = ["曙光服饰采购", "远帆成衣贸易", "青禾时装供应链", "星屿服装采购", "澜庭品牌管理", "云帛国际贸易", "嘉木成衣事业部", "新岸服饰采购", "鹿鸣服装贸易", "安澜品牌供应链"];
const BRAND_NAMES = ["DEV Aster", "QA North", "DEV Loom", "QA Harbor", "DEV Field", "QA Grove", "DEV Coast", "QA Atelier"];
const SALESPERSON_NAMES = ["林青禾", "陈曦", "周妍", "孙宇", "顾明", "沈佳", "许安", "唐宁"];
const STYLE_NAMES = ["精梳棉宽松圆领短袖", "珠地棉翻领短袖", "弹力针织连帽上衣", "轻量梭织工装衬衫", "罗纹拼接长袖上衣", "运动针织束口长裤", "空气层休闲卫衣", "色织条纹针织衫", "棉弹基础背心", "双面布休闲夹克"];
const QUANTITY_POOL = [1200, 2400, 3600, 5000, 6500, 8000, 10000, 12000, 15000, 18000, 24000, 30000] as const;
const FABRICS = [
  { name: "精梳棉 40S", composition: "100% Cotton", supplier: "DEV 华东针织供应链", width: 145, gsm: 180, price: 23.5, unit: "kg" as const },
  { name: "高弹棉氨汗布", composition: "95% Cotton / 5% Spandex", supplier: "QA 苏州弹力面料实验供应商", width: 160, gsm: 210, price: 32.8, unit: "kg" as const },
  { name: "色织循环条纹双面布", composition: "78% Cotton / 17% Polyester / 5% Spandex", supplier: "DEV 无锡锦彩纺织科技测试部", width: 168, gsm: 285, price: 48.6, unit: "kg" as const },
  { name: "轻量再生涤梭织布", composition: "100% Recycled Polyester", supplier: "QA 宁波新材料长名称供应商", width: 150, gsm: 118, price: 18.9, unit: "meter" as const },
  { name: "1×1 罗纹", composition: "95% Cotton / 5% Spandex", supplier: "DEV 罗纹联合工厂", width: 120, gsm: 260, price: 42.3, unit: "kg" as const },
] as const;
const TRIMS = [
  { name: "主唛", specification: "缎面印字 45×20mm", supplier: "DEV 织标辅料", unit: "枚", price: 0.28 },
  { name: "洗水唛", specification: "尼龙带双面印字", supplier: "QA 标识供应商", unit: "枚", price: 0.16 },
  { name: "透明自封袋", specification: "28×38cm 环保材质", supplier: "DEV 苏州包装", unit: "个", price: 0.34 },
  { name: "18L 四眼纽扣", specification: "哑光树脂 18L", supplier: "QA 纽扣工坊", unit: "粒", price: 0.18 },
  { name: "3# 尼龙拉链", specification: "闭尾同色 22cm", supplier: "DEV 拉链供应链", unit: "条", price: 1.36 },
  { name: "吊牌套装", specification: "350g 双面四色 + 棉绳", supplier: "QA 品牌包装", unit: "套", price: 0.52 },
] as const;

type Random = () => number;
type DatasetRepositories = {
  store: LocalDataStore;
  quotes: QuoteRepository;
  orders: OrderRepository;
  scheduling: ProductionSchedulingRepository;
  closing: ClosingRepository;
  operationsSettings: ReturnType<typeof createOperationsSettingsRepository>;
};

export type UiQaDatasetManifest = {
  datasetId: string;
  seed: string;
  marker: string;
  generatedAt: string;
  anchorDate: string;
  environment: string;
  counts: Record<string, number>;
  distributions: Record<string, Record<string, number>>;
  ids: Record<string, string[]>;
  installation: Record<string, number>;
  actualTotals: Record<string, number>;
  productionGroups: Array<{ productionGroup: string; productionGroupId: string; reused: boolean; scheduledOrders: number; currentExecuting: string; pending: number; tailDate: string }>;
  closingMonths: Array<{ month: string; periodId: string; status: string; relations: number; orders: number; quantity: number; processingOutputRmb: number }>;
  calculatorSamples: Array<{ quoteId: string; priceVersionId: string; currency: string; fabricCost: number; trimCost: number; laborInput: number; laborRmb: number; otherCost: number; preMarkupTotal: number; garmentSellingPrice: number }>;
  integrity: Record<string, boolean | number | string>;
};

export type UiQaDatasetCleanupCounts = { qaOrders: number; realOrders: number; qaSchedule: number; realSchedule: number };
export type UiQaDatasetCleanupReport = {
  datasetId: typeof UI_QA_DATASET_ID;
  before: UiQaDatasetCleanupCounts;
  after: UiQaDatasetCleanupCounts;
  removed: { quotes: number; orders: number; scheduleAssignments: number; orderExecutionTrackings: number; scheduleBatches: number; closingAllocations: number; closingPeriods: number };
};

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

export function createDeterministicRandom(seed = UI_QA_SEED): Random {
  let state = hashSeed(seed);
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const pad = (value: number, width = 3) => String(value).padStart(width, "0");
const clone = <T>(value: T): T => structuredClone(value);
const integer = (random: Random, min: number, max: number) => Math.floor(random() * (max - min + 1)) + min;
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const plusDays = (value: string, days: number) => { const next = date(value); next.setUTCDate(next.getUTCDate() + days); return next.toISOString().slice(0, 10); };
const timestampAt = (days: number, hour = 8) => `${plusDays(UI_QA_ANCHOR_DATE, days)}T${String(hour).padStart(2, "0")}:00:00.000+08:00`;
const markerText = (detail: string) => `${UI_QA_MARKER} · ${detail}`;

function resolveStableId<T>(base: string, existing: readonly T[], idOf: (item: T) => string, owned: (item: T) => boolean): string {
  for (let suffix = 1; suffix < 100; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-collision-${suffix}`;
    const found = existing.find((item) => idOf(item) === candidate);
    if (!found || owned(found)) return candidate;
  }
  throw new Error(`无法为 ${base} 分配安全的稳定 ID`);
}

function quoteOwned(quote: Quote) { return quote.revisions.some((revision) => revision.baseInfo.note.includes(UI_QA_DATASET_ID)); }
function orderOwned(order: SalesOrder) { return isUiQaDatasetOrder(order); }
function assignmentOwned(assignment: ScheduleAssignment) { return assignment.remark.includes(UI_QA_DATASET_ID); }
function periodOwned(period: ClosingPeriod) { return period.remark.includes(UI_QA_DATASET_ID); }

function fabricLine(quoteIndex: number, priceIndex: number, lineIndex: number, random: Random): FabricCostLine {
  const source = FABRICS[(quoteIndex + priceIndex + lineIndex) % FABRICS.length]!;
  return {
    id: `uiqa-q-${pad(quoteIndex + 1)}-pv-${priceIndex + 1}-fabric-${lineIndex + 1}`,
    lineGroupId: `uiqa-fabric-group-${quoteIndex + 1}-${lineIndex + 1}`,
    sourceLibraryItemId: null,
    name: source.name,
    composition: source.composition,
    segmentLengthCm: integer(random, 108, 168),
    netWidthCm: source.width + integer(random, -4, 6),
    gsm: source.gsm + integer(random, -12, 15),
    lossRate: integer(random, 2, 9),
    supplier: source.supplier,
    unitPrice: Number((source.price + random() * 4).toFixed(2)),
    purchaseUnit: source.unit,
  };
}

function trimLine(quoteIndex: number, priceIndex: number, lineIndex: number, random: Random): TrimCostLine {
  const source = TRIMS[(quoteIndex * 2 + priceIndex + lineIndex) % TRIMS.length]!;
  return {
    id: `uiqa-q-${pad(quoteIndex + 1)}-pv-${priceIndex + 1}-trim-${lineIndex + 1}`,
    lineGroupId: `uiqa-trim-group-${quoteIndex + 1}-${lineIndex + 1}`,
    sourceLibraryItemId: null,
    name: source.name,
    specification: source.specification,
    supplier: source.supplier,
    usage: lineIndex === 3 ? integer(random, 2, 5) : 1,
    unit: source.unit,
    lossRate: integer(random, 1, 5),
    unitPrice: Number((source.price + random() * 0.16).toFixed(2)),
  };
}

function buildPriceVersion(quoteIndex: number, priceIndex: number, source: PriceVersion, random: Random): PriceVersion {
  const cambodia = priceIndex % 2 === 0 ? quoteIndex % 3 !== 0 : quoteIndex % 3 === 0;
  const id = `uiqa-q-${pad(quoteIndex + 1)}-price-${priceIndex + 1}`;
  const quantity = QUANTITY_POOL[(quoteIndex + priceIndex * 3) % QUANTITY_POOL.length]!;
  const base = priceIndex === 0 ? clone(source) : copyPriceVersion(source, { id, name: "", quantity, description: "" });
  const fabricCount = 2 + (quoteIndex + priceIndex) % 3;
  const trimCount = 1 + (quoteIndex + priceIndex * 2) % 4;
  return {
    ...base,
    id,
    name: priceIndex === 0 && quoteIndex % 3 === 0 ? "基础价格" : cambodia ? `柬埔寨 · ${quantity.toLocaleString("zh-CN")}件` : `中国 · ${quantity.toLocaleString("zh-CN")}件`,
    quantity,
    description: markerText(cambodia ? "柬埔寨制作价格方案" : "中国制作价格方案"),
    pricingParameters: cambodia
      ? { manufacturingCountry: "柬埔寨", manufacturingPresetId: "preset-cambodia", manufacturingPresetName: "柬埔寨制作", laborCurrency: "USD", usdCnyRate: 7.08 + quoteIndex % 5 * 0.01, markupRate: 8 + quoteIndex % 5, includeFreight: true, freightName: "柬埔寨运输分摊", freightAmount: Number((0.8 + random() * 1.2).toFixed(2)) }
      : { manufacturingCountry: "中国", manufacturingPresetId: "preset-china", manufacturingPresetName: "中国制作", laborCurrency: "CNY", usdCnyRate: 7.12, markupRate: 6 + quoteIndex % 4, includeFreight: false, freightName: "运费", freightAmount: null },
    fabrics: Array.from({ length: fabricCount }, (_, lineIndex) => fabricLine(quoteIndex, priceIndex, lineIndex, random)),
    trims: Array.from({ length: trimCount }, (_, lineIndex) => trimLine(quoteIndex, priceIndex, lineIndex, random)),
    labor: { value: cambodia ? Number((1.8 + random() * 1.8).toFixed(2)) : Number((15 + random() * 16).toFixed(2)), description: cambodia ? "裁剪、车缝、整烫、质检与柬埔寨包装" : "裁剪、车缝、整烫、质检与国内包装" },
    otherCosts: [
      { id: `${id}-other-1`, lineGroupId: `uiqa-other-group-${quoteIndex + 1}-1`, name: "包装分摊", specification: "单件分摊", usage: 1, unit: "件", lossRate: 0, unitPrice: Number((0.5 + random()).toFixed(2)), amount: Number((0.5 + random()).toFixed(2)), source: "manual" },
      ...(quoteIndex % 4 === 0 ? [{ id: `${id}-other-2`, lineGroupId: `uiqa-other-group-${quoteIndex + 1}-2`, name: "验货测试费", specification: "单件分摊", usage: 1, unit: "件", lossRate: 0, unitPrice: 0.35, amount: 0.35, source: "manual" as const }] : []),
    ],
    confirmation: null,
  };
}

function setDefaultRevision(quote: Quote, update: (revision: QuoteRevision) => QuoteRevision): Quote {
  return { ...quote, revisions: quote.revisions.map((revision) => revision.revisionId === quote.defaultRevisionId ? update(revision) : revision) };
}

function buildQuote(index: number, id: string): Quote {
  const random = createDeterministicRandom(`${UI_QA_SEED}:quote:${index}`);
  const quoteDate = plusDays(UI_QA_ANCHOR_DATE, -55 + index % 48);
  let quote = createQuoteDraft(id, `QA-QT-260830-${pad(index + 1)}`, quoteDate, { laborCurrency: "CNY", usdCnyRate: 7.12, markupRate: 8 });
  const priceVersionCount = 1 + index % 3;
  quote = setDefaultRevision(quote, (revision) => ({
    ...revision,
    createdAt: timestampAt(-55 + index % 48, 9),
    createdBy: ACTOR.name,
    note: markerText("确定性报价样本"),
    baseInfo: {
      brandId: `uiqa-brand-${pad(index % BRAND_NAMES.length + 1, 2)}`,
      brandName: BRAND_NAMES[index % BRAND_NAMES.length]!,
      salespersonId: `uiqa-sales-${pad(index % SALESPERSON_NAMES.length + 1, 2)}`,
      salespersonName: SALESPERSON_NAMES[index % SALESPERSON_NAMES.length]!,
      quoteType: index % 4 === 0 ? "processing" : "distribution",
      quoteStyleNo: `${["CAM", "KN", "DEV", "QA", "AT"][index % 5]}-${26001 + index}`,
      styleName: STYLE_NAMES[index % STYLE_NAMES.length]!,
      quoteDate,
      fabricLeadDate: plusDays(quoteDate, 18 + index % 12),
      garmentLeadDate: plusDays(quoteDate, 55 + index % 28),
      note: markerText(`虚构品牌 ${BRAND_NAMES[index % BRAND_NAMES.length]}`),
    },
    priceVersions: Array.from({ length: priceVersionCount }, (_, priceIndex) => buildPriceVersion(index, priceIndex, revision.priceVersions[0]!, random)),
    imageAttachmentIds: [], fileAttachmentIds: [], styleImageAttachmentId: null,
  }));

  const revisionCount = index < 24 ? 1 : index < 60 ? 2 : 3;
  for (let revisionNumber = 2; revisionNumber <= revisionCount; revisionNumber += 1) {
    const revisionId = `${id}-revision-v${revisionNumber}`;
    quote = createRevisionFromSnapshot(quote, { sourceRevisionId: quote.defaultRevisionId, reason: revisionNumber === 2 ? "客户调价" : "面料价格变化", note: markerText(`历史报价快照 V${revisionNumber}`), createdBy: ACTOR.name, nowIso: timestampAt(-30 + index % 20 + revisionNumber, 10), revisionId });
    quote = setDefaultRevision(quote, (revision) => ({ ...revision, priceVersions: revision.priceVersions.map((version, priceIndex) => ({ ...version, labor: { ...version.labor, value: version.labor.value === null ? null : Number((version.labor.value + revisionNumber * (priceIndex + 1) * 0.07).toFixed(2)) }, confirmation: null })) }));
  }

  quote = setDefaultRevision(quote, (revision) => {
    const mode = index % 6;
    const confirmCount = mode === 0 || mode === 3 ? 0 : mode === 1 || mode === 4 ? Math.max(1, revision.priceVersions.length - 1) : revision.priceVersions.length;
    const priceVersions = revision.priceVersions.map((version, priceIndex) => {
      if (priceIndex >= confirmCount) return { ...version, confirmation: null };
      const metrics = calculatePriceVersionMetrics(version);
      return { ...version, confirmation: { quotedGarmentPrice: metrics.garmentSellingPrice, confirmedGarmentPrice: revision.baseInfo.quoteType === "distribution" ? Number((metrics.garmentSellingPrice - (index % 3) * 0.1).toFixed(2)) : null, quotedLaborPrice: version.labor.value ?? 0, confirmedLaborPrice: version.labor.value, note: markerText("客户确认样本"), confirmedAt: timestampAt(-4 + index % 4, 14) } };
    });
    const confirmationSummary = summarizeRevisionConfirmations({ priceVersions });
    return { ...revision, priceVersions, confirmationSummary };
  });
  const summary = getDefaultRevision(quote).confirmationSummary;
  quote.aggregateStatus = summary.confirmedCount === 0 && index % 2 === 0 ? "draft" : confirmationAggregateStatus(summary);
  return quote;
}

function determinizeOrder(order: SalesOrder, orderId: string, createdAt: string): SalesOrder {
  const priceVersions = order.priceVersions.map((version, index) => ({ ...version, id: `${orderId}-price-p${index + 1}`, salesOrderId: orderId, createdAt }));
  return {
    ...order,
    id: orderId,
    priceVersions,
    currentPriceVersionId: priceVersions.at(-1)!.id,
    fabricExecutionSnapshots: order.fabricExecutionSnapshots.map((line, index) => ({ ...line, id: `${orderId}-fabric-${index + 1}` })),
    trimExecutionSnapshots: order.trimExecutionSnapshots.map((line, index) => ({ ...line, id: `${orderId}-trim-${index + 1}` })),
    quantityChanges: [], deliveryPlans: [], createdAt, updatedAt: createdAt,
  };
}

function queuePosition(orderIndex: number) {
  let offset = 0;
  for (let groupIndex = 0; groupIndex < GROUP_ORDER_COUNTS.length; groupIndex += 1) {
    const count = GROUP_ORDER_COUNTS[groupIndex]!;
    if (orderIndex < offset + count) return { groupIndex, position: orderIndex - offset };
    offset += count;
  }
  return null;
}

function buildOrder(index: number, id: string, orderNo: string, quotes: Quote[]): SalesOrder {
  const random = createDeterministicRandom(`${UI_QA_SEED}:order:${index}`);
  const quote = index < 60 ? quotes[index % quotes.length]! : null;
  const revision = quote ? getDefaultRevision(quote) : null;
  const priceVersion = revision?.priceVersions[index % revision.priceVersions.length] ?? null;
  const createdAt = timestampAt(-42 + index % 35, 11);
  const orderDate = createdAt.slice(0, 10);
  const orderType = revision?.baseInfo.quoteType ?? (index % 4 === 0 ? "distribution" : "processing");
  const header = {
    orderNo,
    customerId: `uiqa-customer-${pad(index % CUSTOMER_NAMES.length + 1, 2)}`,
    customerNameSnapshot: CUSTOMER_NAMES[index % CUSTOMER_NAMES.length]!,
    customerPoNo: index % 11 === 0 ? "" : index % 3 === 0 ? `PO/CAM/${26000 + index}` : index % 3 === 1 ? `QA-${2026000 + index}` : `DEV PO ${pad(index + 1)}`,
    orderDate,
    salespersonId: `uiqa-sales-${pad(index % SALESPERSON_NAMES.length + 1, 2)}`,
    salespersonNameSnapshot: SALESPERSON_NAMES[index % SALESPERSON_NAMES.length]!,
    merchandiserId: null,
    merchandiserNameSnapshot: ["理单员甲", "理单员乙", "理单员丙", "理单员丁"][index % 4]!,
    orderType,
    remark: markerText(index < SCHEDULED_ORDER_COUNT ? "柬埔寨生产订单" : "未排订单"),
  } as const;
  let order = quote && revision && priceVersion
    ? createOrderFromQuote({ quote, revision, priceVersion, header, initialQuantity: QUANTITY_POOL[index % QUANTITY_POOL.length]!, actor: ACTOR })
    : createManualOrder({ header, style: { styleNo: `${["CAM", "KN", "DEV", "QA", "AT"][index % 5]}-${26101 + index}`, styleName: STYLE_NAMES[index % STYLE_NAMES.length]!, brandId: `uiqa-brand-${pad(index % BRAND_NAMES.length + 1, 2)}`, brandNameSnapshot: BRAND_NAMES[index % BRAND_NAMES.length]!, productionCountry: index < SCHEDULED_ORDER_COUNT ? "柬埔寨" : index % 3 === 0 ? "中国" : "柬埔寨", processDescription: "裁剪、车缝、整烫、质检、包装", customerRequirement: "按确认样衣及装箱资料执行", initialQuantity: QUANTITY_POOL[index % QUANTITY_POOL.length]!, averageDailyOutput: 900 + index % 8 * 300, fabricExecutionSnapshots: [{ id: "temporary", sourceFabricLineId: null, name: FABRICS[index % FABRICS.length]!.name, composition: FABRICS[index % FABRICS.length]!.composition, specification: `${FABRICS[index % FABRICS.length]!.width}cm / ${FABRICS[index % FABRICS.length]!.gsm}gsm`, supplierNameSnapshot: FABRICS[index % FABRICS.length]!.supplier, remark: "" }], trimExecutionSnapshots: [{ id: "temporary", sourceTrimLineId: null, name: TRIMS[index % TRIMS.length]!.name, specification: TRIMS[index % TRIMS.length]!.specification, supplierNameSnapshot: TRIMS[index % TRIMS.length]!.supplier, remark: "" }], imageAttachmentIds: [], fileAttachmentIds: [], styleImageAttachmentId: null }, actor: ACTOR, id, createdAt });
  order = determinizeOrder(order, id, createdAt);
  const initial = getCurrentPriceVersion(order);
  order.priceVersions = [{ ...initial, salePrice: orderType === "distribution" ? Number((36 + random() * 68).toFixed(1)) : null, processingUnitPrice: initial.processingUnitPrice ?? Number((initial.processingCurrency === "USD" ? 1.8 + random() * 1.8 : 14 + random() * 18).toFixed(2)), exchangeRateSnapshot: initial.processingCurrency === "USD" ? initial.exchangeRateSnapshot ?? 7.12 : null, reason: quote ? "报价生成订单初始价格" : "DEV/QA 初始价格" }];
  order.currentPriceVersionId = order.priceVersions[0]!.id;
  if (index % 4 === 0) {
    const current = getCurrentPriceVersion(order);
    order = createOrderPriceVersion(order, { salePrice: current.salePrice === null ? null : Number((current.salePrice + 1.2).toFixed(1)), processingUnitPrice: Number(((current.processingUnitPrice ?? 0) + (current.processingCurrency === "USD" ? 0.12 : 1.1)).toFixed(2)), processingCurrency: current.processingCurrency, exchangeRateSnapshot: current.exchangeRateSnapshot, effectiveDate: plusDays(orderDate, 8), reason: "DEV/QA 客户调价", actor: ACTOR });
    const versions = order.priceVersions.map((version, versionIndex) => ({ ...version, id: `${id}-price-p${versionIndex + 1}`, salesOrderId: id, createdAt: timestampAt(-24 + index % 12, 13) }));
    order = { ...order, priceVersions: versions, currentPriceVersionId: versions.at(-1)!.id };
  }
  if (index % 5 === 0) {
    const before = getEffectiveQuantity(order);
    order = changeOrderQuantity(order, { afterQuantity: Math.max(100, before - Math.min(500, Math.floor(before / 10))), changeType: "decrease", reason: "DEV/QA 客户减量", actor: ACTOR });
    order.quantityChanges = order.quantityChanges.map((change, changeIndex) => ({ ...change, id: `${id}-quantity-${changeIndex + 1}`, createdAt: timestampAt(-18 + index % 9, 15) }));
  } else if (index % 7 === 0) {
    const before = getEffectiveQuantity(order);
    order = changeOrderQuantity(order, { afterQuantity: before + 600, changeType: "increase", reason: "DEV/QA 客户追加", actor: ACTOR });
    order.quantityChanges = order.quantityChanges.map((change, changeIndex) => ({ ...change, id: `${id}-quantity-${changeIndex + 1}`, createdAt: timestampAt(-17 + index % 8, 15) }));
  }
  const effective = getEffectiveQuantity(order);
  const deliveryBase = plusDays(UI_QA_ANCHOR_DATE, 4 + index % 43);
  if (index % 14 !== 13) {
    if (index % 6 === 0) {
      const oldId = `${id}-delivery-old`;
      order = upsertDeliveryPlan(order, { id: oldId, deliveryDate: plusDays(deliveryBase, -5), quantity: effective, remark: "DEV/QA 原交期", createdAt, voidedAt: null }, ACTOR);
      order = voidDeliveryPlan(order, oldId, ACTOR);
    }
    if (index % 4 === 0) {
      const first = Math.floor(effective * 0.45);
      order = upsertDeliveryPlan(order, { id: `${id}-delivery-1`, deliveryDate: deliveryBase, quantity: first, remark: "DEV/QA 首批", createdAt, voidedAt: null }, ACTOR);
      order = upsertDeliveryPlan(order, { id: `${id}-delivery-2`, deliveryDate: plusDays(deliveryBase, 12), quantity: effective - first, remark: "DEV/QA 尾批", createdAt, voidedAt: null }, ACTOR);
    } else order = upsertDeliveryPlan(order, { id: `${id}-delivery-1`, deliveryDate: deliveryBase, quantity: effective, remark: "DEV/QA 单一交期", createdAt, voidedAt: null }, ACTOR);
    order.deliveryPlans = order.deliveryPlans.map((plan, planIndex) => ({ ...plan, updatedAt: timestampAt(-12 + index % 7, 16), voidedAt: plan.voidedAt ? timestampAt(-13 + index % 7, 16) : null, id: plan.id || `${id}-delivery-${planIndex + 1}` }));
  }
  const position = queuePosition(index);
  if (position) {
    order = confirmOrder(order, ACTOR);
    order.status = position.position === 0 ? "completed" : position.position === 1 ? "active" : "confirmed";
  } else if (index >= ORDER_COUNT - 3) order = cancelOrder(order, "DEV/QA 已取消样本", ACTOR);
  else order.status = index % 3 === 0 ? "draft" : "confirmed";
  return { ...order, remark: header.remark, createdAt, updatedAt: timestampAt(-2 + index % 3, 17), createdBy: ACTOR.name, updatedBy: ACTOR.name };
}

function ensureProductionGroups(state: OperationsSettingsState, existingAssignments: ScheduleAssignment[]) {
  let next = clone(state);
  const groups: Array<{ group: ProductionGroup; reused: boolean }> = [];
  for (const groupNumber of GROUP_NUMBERS) {
    const name = `${groupNumber}组`;
    const existingByName = next.productionGroups.find((group) => group.name.trim() === name);
    if (existingByName) {
      if (!existingByName.enabled) throw new Error(`${name} 已存在但未启用；为保护现有资料，生成器不会覆盖启用状态`);
      groups.push({ group: existingByName, reused: true });
      continue;
    }
    const baseId = `uiqa-production-group-${pad(groupNumber, 2)}`;
    const groupId = resolveStableId(baseId, next.productionGroups, (group) => group.id, (group) => group.remark.includes(UI_QA_DATASET_ID));
    const assignmentUsesId = existingAssignments.some((assignment) => assignment.productionGroupId === groupId && !assignmentOwned(assignment));
    if (assignmentUsesId) throw new Error(`${groupId} 已被非 QA 排单引用，无法安全创建`);
    const group: ProductionGroup = { id: groupId, name, shortName: name, productionSiteId: DEFAULT_CAMBODIA_SITE_ID, enabled: true, sortOrder: groupNumber, remark: markerText("柬埔寨生产组"), createdAt: UI_QA_GENERATED_AT, updatedAt: UI_QA_GENERATED_AT };
    next = upsertProductionGroup(next, group, UI_QA_GENERATED_AT);
    groups.push({ group, reused: false });
  }
  return { state: next, groups };
}

function buildScheduling(existing: ProductionSchedulingState, orders: SalesOrder[], settings: OperationsSettingsState, groups: Array<{ group: ProductionGroup; reused: boolean }>) {
  let state = clone(existing);
  const ids: string[] = [];
  let orderOffset = 0;
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex]!.group;
    const count = GROUP_ORDER_COUNTS[groupIndex]!;
    const groupOrders = orders.slice(orderOffset, orderOffset + count);
    orderOffset += count;
    for (let position = 0; position < groupOrders.length; position += 1) {
      const order = groupOrders[position]!;
      const baseId = `uiqa-schedule-g${pad(GROUP_NUMBERS[groupIndex]!, 2)}-${pad(position + 1, 2)}`;
      const assignmentId = resolveStableId(baseId, state.scheduleAssignments, (assignment) => assignment.id, assignmentOwned);
      ids.push(assignmentId);
      if (state.scheduleAssignments.some((assignment) => assignment.id === assignmentId)) continue;
      const durationMode = position % 3 === 0 ? "average_daily_output" as const : "workdays" as const;
      const requiredWorkdays = 2 + (groupIndex + position) % 3;
      const averageDailyOutput = Math.ceil(getEffectiveQuantity(order) / requiredWorkdays);
      const created = createScheduleAssignment(state, { salesOrderId: order.id, executionType: "internal", productionGroupId: group.id, plannedQuantity: getEffectiveQuantity(order), durationMode, averageDailyOutput, requiredWorkdays, plannedStartDate: plusDays(UI_QA_ANCHOR_DATE, -18 + groupIndex % 4), dateMode: "auto_queue", remark: markerText(`生产队列 ${nameForGroup(groupIndex)} #${position + 1}`), actor: ACTOR, settings, timestamp: timestampAt(-25 + groupIndex, 9) });
      created.assignment.id = assignmentId;
      state = { ...created.state, scheduleAssignments: created.state.scheduleAssignments.map((assignment) => assignment === created.assignment ? created.assignment : assignment) };
    }
    state = recalculateInternalQueue(state, group.id, settings, plusDays(UI_QA_ANCHOR_DATE, -18 + groupIndex % 4)).state;
    const queue = state.scheduleAssignments.filter((assignment) => assignment.productionGroupId === group.id && ids.includes(assignment.id)).sort((left, right) => (left.queueSequence ?? 0) - (right.queueSequence ?? 0));
    if (queue[0] && queue[0].status === "planned") state = updateScheduleAssignment(state, queue[0].id, { status: "completed", completedQuantity: queue[0].plannedQuantity, actualStartDate: queue[0].plannedStartDate, actualCompletedDate: plusDays(UI_QA_ANCHOR_DATE, -2) }, { actor: ACTOR, settings, timestamp: timestampAt(-2, 17) }).state;
    if (queue[1] && queue[1].status === "planned") state = updateScheduleAssignment(state, queue[1].id, { status: "in_progress", completedQuantity: Math.floor(queue[1].plannedQuantity * 0.36), actualStartDate: plusDays(UI_QA_ANCHOR_DATE, -1) }, { actor: ACTOR, settings, timestamp: timestampAt(-1, 9) }).state;
  }
  for (let index = 0; index < Math.min(45, orders.length); index += 1) {
    const order = orders[index]!;
    if (state.orderExecutionTrackings.some((tracking) => tracking.salesOrderId === order.id)) continue;
    const ready = plusDays(UI_QA_ANCHOR_DATE, -8 + index % 16);
    const tracked = upsertOrderExecutionTracking(state, { salesOrderId: order.id, patch: { fabricReadiness: { status: index % 7 === 0 ? "issue" : "ready", remark: index % 7 === 0 ? "DEV/QA 面料待补" : "" }, trimReadiness: { status: index % 5 === 0 ? "in_progress" : "ready", remark: "" }, sampleProgress: { status: "ready", remark: "" }, printingEmbroideryProgress: { status: index % 4 === 0 ? "in_progress" : "not_applicable", remark: "" }, shortOverStatus: { status: "not_started", remark: "" }, supplyHubId: DEFAULT_SUPPLY_HUB_ID, fabricSupplyHubArrivalDate: ready, trimSupplyHubArrivalDate: plusDays(ready, index % 3), remark: markerText("物料跟进样本") }, actor: ACTOR, timestamp: timestampAt(-7 + index % 7, 12) });
    tracked.tracking.id = `uiqa-tracking-${pad(index + 1)}`;
    state = { ...tracked.state, orderExecutionTrackings: tracked.state.orderExecutionTrackings.map((tracking) => tracking === tracked.tracking ? tracked.tracking : tracking) };
  }
  return { state: validateProductionSchedulingState(state), ids };
}

function nameForGroup(groupIndex: number) { return `${GROUP_NUMBERS[groupIndex]}组`; }

function candidateMonths(existing: ClosingPeriod[]): string[] {
  const preferred = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-05", "2026-04", "2026-10", "2026-03"];
  const owned = existing.filter(periodOwned).map((period) => period.month);
  const available = preferred.filter((month) => !existing.some((period) => period.month === month));
  return [...owned, ...available].filter((month, index, values) => values.indexOf(month) === index).slice(0, 3);
}

function buildClosing(existing: ClosingState, orders: SalesOrder[], scheduling: ProductionSchedulingState, settings: OperationsSettingsState) {
  let state = clone(existing);
  const months = candidateMonths(state.periods);
  if (months.length < 3) throw new Error("没有足够的安全月份用于创建 DEV/QA 关账样本");
  const periodIds: string[] = [];
  const periods: ClosingPeriod[] = [];
  for (let index = 0; index < months.length; index += 1) {
    const month = months[index]!;
    const existingPeriod = state.periods.find((period) => period.month === month && periodOwned(period));
    if (existingPeriod) { periods.push(existingPeriod); periodIds.push(existingPeriod.id); continue; }
    const baseId = `uiqa-closing-period-${month}`;
    const periodId = resolveStableId(baseId, state.periods, (period) => period.id, periodOwned);
    const created = createClosingPeriod(state, { month, taxRateSnapshot: settings.closingSettings.defaultSalesTaxRatePercent, remark: markerText(index === 0 ? "已锁定月份" : index === 1 ? "已确认月份" : "开放月份"), actor: ACTOR, now: timestampAt(-70 + index * 30, 8) });
    created.period.id = periodId;
    state = { ...created.state, periods: created.state.periods.map((period) => period === created.period ? created.period : period) };
    periods.push(created.period); periodIds.push(periodId);
  }
  const allocationIds: string[] = [];
  const allocationCounts = [15, 30, 45] as const;
  let orderOffset = 0;
  for (let periodIndex = 0; periodIndex < periods.length; periodIndex += 1) {
    let period = state.periods.find((item) => item.id === periods[periodIndex]!.id)!;
    const count = allocationCounts[periodIndex]!;
    for (let index = 0; index < count; index += 1) {
      const order = orders[orderOffset + index]!;
      const assignment = scheduling.scheduleAssignments.find((item) => item.salesOrderId === order.id) ?? null;
      const allocationId = `uiqa-closing-${periodIndex + 1}-${pad(index + 1)}`;
      allocationIds.push(allocationId);
      if (state.allocations.some((allocation) => allocation.id === allocationId)) continue;
      if (period.status !== "open") throw new Error(`${period.month} 已非开放状态但缺少 ${allocationId}；生成器拒绝覆盖或重开现有月份`);
      const effective = getEffectiveQuantity(order);
      const quantity = (periodIndex === 2 && index % 3 === 0) || (periodIndex === 1 && index % 4 === 0) ? Math.max(1, Math.floor(effective * 0.55)) : effective;
      let allocation = createAllocationDraft({ period, order, assignment, settings, quantity, actor: ACTOR, now: timestampAt(-55 + periodIndex * 25 + index % 10, 14) });
      allocation = { ...allocation, id: allocationId, remark: markerText(quantity < effective ? "部分关账" : "完整关账") };
      state = saveClosingAllocation(state, allocation, ACTOR, allocation.createdAt).state;
    }
    orderOffset += count;
    period = state.periods.find((item) => item.id === period.id)!;
    if (periodIndex === 0 && period.status === "open") {
      state = transitionClosingPeriod(state, period.id, "confirm", ACTOR, { now: timestampAt(-20, 10) }).state;
      state = transitionClosingPeriod(state, period.id, "lock", ACTOR, { warningCount: 0, now: timestampAt(-18, 10) }).state;
    } else if (periodIndex === 1 && period.status === "open") state = transitionClosingPeriod(state, period.id, "confirm", ACTOR, { now: timestampAt(-3, 10) }).state;
  }
  return { state, periodIds, allocationIds, months };
}

function distribution<T extends string>(values: T[]): Record<string, number> {
  return values.reduce<Record<string, number>>((result, value) => { result[value] = (result[value] ?? 0) + 1; return result; }, {});
}

export function createUiQaRepositories(store: LocalDataStore): DatasetRepositories {
  return { store, quotes: createMockQuoteRepository({ store, legacySessionStorage: null }), orders: createOrderRepository(store), scheduling: createProductionSchedulingRepository(store), closing: createClosingRepository(store), operationsSettings: createOperationsSettingsRepository(store) };
}

export async function cleanupUiQaDataset(repositories?: DatasetRepositories): Promise<UiQaDatasetCleanupReport> {
  const repos = repositories ?? createUiQaRepositories(browserLocalDataStore);
  if (repos.store.environment !== "development") throw new Error(`拒绝执行：当前 LocalDataEnvironment=${repos.store.environment}`);
  if (!repositories && (typeof window === "undefined" || !["127.0.0.1", "localhost"].includes(window.location.hostname) || window.location.port !== "3001")) throw new Error("拒绝执行：只允许当前 DEV 3001 Origin");

  const [quotes, orders, scheduling, closing] = await Promise.all([repos.quotes.list(), repos.orders.list(), repos.scheduling.load(), repos.closing.load()]);
  const qaOrderIds = new Set(orders.filter(orderOwned).map((order) => order.id));
  const qaAssignmentIds = new Set(scheduling.scheduleAssignments.filter((assignment) => assignmentOwned(assignment) || qaOrderIds.has(assignment.salesOrderId)).map((assignment) => assignment.id));
  const counts = (nextOrders: SalesOrder[], nextScheduling: ProductionSchedulingState): UiQaDatasetCleanupCounts => ({
    qaOrders: nextOrders.filter(orderOwned).length,
    realOrders: nextOrders.filter((order) => !orderOwned(order)).length,
    qaSchedule: nextScheduling.scheduleAssignments.filter((assignment) => assignmentOwned(assignment) || qaOrderIds.has(assignment.salesOrderId)).length,
    realSchedule: nextScheduling.scheduleAssignments.filter((assignment) => !assignmentOwned(assignment) && !qaOrderIds.has(assignment.salesOrderId)).length,
  });
  const before = counts(orders, scheduling);

  const qaQuotes = quotes.filter(quoteOwned);
  for (const quote of qaQuotes) await repos.quotes.delete(quote.id, { mode: "hard" });

  const nextOrders = orders.filter((order) => !qaOrderIds.has(order.id));
  const nextScheduling: ProductionSchedulingState = {
    scheduleAssignments: scheduling.scheduleAssignments.filter((assignment) => !qaAssignmentIds.has(assignment.id)),
    orderExecutionTrackings: scheduling.orderExecutionTrackings.filter((tracking) => !qaOrderIds.has(tracking.salesOrderId) && !tracking.remark.includes(UI_QA_DATASET_ID)),
    scheduleBatches: scheduling.scheduleBatches.flatMap((batch) => {
      if (batch.remark.includes(UI_QA_DATASET_ID)) return [];
      const allocations = batch.allocations.filter((allocation) => !qaOrderIds.has(allocation.salesOrderId) && !qaAssignmentIds.has(allocation.scheduleAssignmentId));
      return allocations.length >= 2 ? [{ ...batch, allocations }] : [];
    }),
  };
  const nextAllocations = closing.allocations.filter((allocation) => !qaOrderIds.has(allocation.salesOrderId) && !qaAssignmentIds.has(allocation.scheduleAssignmentId ?? "") && !allocation.remark.includes(UI_QA_DATASET_ID));
  const retainedPeriodIds = new Set(nextAllocations.map((allocation) => allocation.closingPeriodId));
  const nextClosing: ClosingState = {
    allocations: nextAllocations,
    periods: closing.periods.filter((period) => !periodOwned(period) || retainedPeriodIds.has(period.id)),
  };

  await repos.orders.saveAll(nextOrders);
  await repos.scheduling.save(nextScheduling);
  await repos.closing.save(nextClosing);

  return {
    datasetId: UI_QA_DATASET_ID,
    before,
    after: counts(nextOrders, nextScheduling),
    removed: {
      quotes: qaQuotes.length,
      orders: orders.length - nextOrders.length,
      scheduleAssignments: scheduling.scheduleAssignments.length - nextScheduling.scheduleAssignments.length,
      orderExecutionTrackings: scheduling.orderExecutionTrackings.length - nextScheduling.orderExecutionTrackings.length,
      scheduleBatches: scheduling.scheduleBatches.length - nextScheduling.scheduleBatches.length,
      closingAllocations: closing.allocations.length - nextClosing.allocations.length,
      closingPeriods: closing.periods.length - nextClosing.periods.length,
    },
  };
}

export async function installUiQaDataset(repositories?: DatasetRepositories): Promise<UiQaDatasetManifest> {
  const repos = repositories ?? createUiQaRepositories(browserLocalDataStore);
  if (repos.store.environment !== "development") throw new Error(`拒绝执行：当前 LocalDataEnvironment=${repos.store.environment}`);
  if (!repositories && (typeof window === "undefined" || !["127.0.0.1", "localhost"].includes(window.location.hostname) || window.location.port !== "3001")) throw new Error("拒绝执行：只允许当前 DEV 3001 Origin");

  const existingQuotes = await repos.quotes.list();
  const existingOrders = await repos.orders.list();
  const existingScheduling = await repos.scheduling.load();
  const existingClosing = await repos.closing.load();
  const currentSettings = repos.operationsSettings.load();
  const ensured = ensureProductionGroups(currentSettings, existingScheduling.scheduleAssignments);
  if (ensured.groups.some((item) => !item.reused)) repos.operationsSettings.save(ensured.state);
  const settings = normalizeOperationsSettings(repos.operationsSettings.load(), UI_QA_GENERATED_AT);

  const quoteIds = Array.from({ length: QUOTE_COUNT }, (_, index) => resolveStableId(`uiqa-quote-${pad(index + 1)}`, existingQuotes, (quote) => quote.id, quoteOwned));
  const quotes = quoteIds.map((id, index) => buildQuote(index, id));
  let quotesAdded = 0; let quotesSkipped = 0;
  for (const quote of quotes) {
    const existing = existingQuotes.find((item) => item.id === quote.id);
    if (existing) { if (!quoteOwned(existing)) throw new Error(`报价 ID ${quote.id} 保护校验失败`); quotesSkipped += 1; }
    else { await repos.quotes.save(quote); quotesAdded += 1; }
  }

  const usedOrderNos = new Set(existingOrders.map((order) => normalizeOrderNo(order.orderNo)));
  const orderIds: string[] = []; const orderNos: string[] = [];
  for (let index = 0; index < ORDER_COUNT; index += 1) {
    const orderId = resolveStableId(`uiqa-order-${pad(index + 1)}`, existingOrders, (order) => order.id, orderOwned);
    const existingDatasetOrder = existingOrders.find((order) => order.id === orderId && orderOwned(order));
    let orderNo = existingDatasetOrder?.orderNo ?? `QA-SO-260830-${pad(index + 1)}`;
    for (let suffix = 2; usedOrderNos.has(normalizeOrderNo(orderNo)) && !existingDatasetOrder; suffix += 1) orderNo = `QA-SO-260830-${pad(index + 1)}-C${suffix}`;
    usedOrderNos.add(normalizeOrderNo(orderNo)); orderIds.push(orderId); orderNos.push(orderNo);
  }
  const orders = orderIds.map((id, index) => buildOrder(index, id, orderNos[index]!, quotes));
  validateOrderCollection(orders);
  let ordersAdded = 0; let ordersSkipped = 0;
  for (const order of orders) {
    const existing = existingOrders.find((item) => item.id === order.id);
    if (existing) { if (!orderOwned(existing)) throw new Error(`订单 ID ${order.id} 保护校验失败`); ordersSkipped += 1; }
    else { await repos.orders.save(order); ordersAdded += 1; }
  }

  const schedulingResult = buildScheduling(existingScheduling, orders, settings, ensured.groups);
  const addedAssignments = schedulingResult.state.scheduleAssignments.length - existingScheduling.scheduleAssignments.length;
  if (addedAssignments || schedulingResult.state.orderExecutionTrackings.length !== existingScheduling.orderExecutionTrackings.length) await repos.scheduling.save(schedulingResult.state);
  const closingResult = buildClosing(existingClosing, orders, schedulingResult.state, settings);
  const addedPeriods = closingResult.state.periods.length - existingClosing.periods.length;
  const addedAllocations = closingResult.state.allocations.length - existingClosing.allocations.length;
  if (addedPeriods || addedAllocations || JSON.stringify(closingResult.state.periods) !== JSON.stringify(existingClosing.periods)) await repos.closing.save(closingResult.state);

  const savedQuotes = await repos.quotes.list();
  const savedOrders = await repos.orders.list();
  const savedScheduling = await repos.scheduling.load();
  const savedClosing = await repos.closing.load();
  const generatedQuotes = savedQuotes.filter((quote) => quoteIds.includes(quote.id));
  const generatedOrders = savedOrders.filter((order) => orderIds.includes(order.id));
  const generatedAssignments = savedScheduling.scheduleAssignments.filter((assignment) => schedulingResult.ids.includes(assignment.id));
  const generatedAllocations = savedClosing.allocations.filter((allocation) => closingResult.allocationIds.includes(allocation.id));
  const overviews = buildProductionGroupOverview(generatedOrders, { scheduleAssignments: generatedAssignments, orderExecutionTrackings: savedScheduling.orderExecutionTrackings.filter((tracking) => orderIds.includes(tracking.salesOrderId)), scheduleBatches: [] }, settings);
  const orderById = new Map(generatedOrders.map((order) => [order.id, order]));
  const groupReport = ensured.groups.map(({ group, reused }, index) => {
    const overview = overviews.find((item) => item.group.id === group.id);
    return { productionGroup: nameForGroup(index), productionGroupId: group.id, reused, scheduledOrders: overview?.assignments.length ?? 0, currentExecuting: overview?.current ? orderById.get(overview.current.salesOrderId)?.orderNo ?? overview.current.salesOrderId : "—", pending: overview?.pendingCount ?? 0, tailDate: overview?.tailDate ?? "—" };
  });
  const closingStatuses = generatedOrders.map((order) => projectOrderClosing(order, savedClosing).status);
  const productionStatuses = generatedOrders.map((order) => projectOrderSchedule(order, savedScheduling, { today: UI_QA_ANCHOR_DATE }).productionStatus);
  const revisionCounts = generatedQuotes.map((quote) => quote.revisions.length);
  const priceVersionCounts = generatedQuotes.map((quote) => getDefaultRevision(quote).priceVersions.length);
  const currentPriceVersions = generatedQuotes.flatMap((quote) => getDefaultRevision(quote).priceVersions);
  const allRevisionPriceVersions = generatedQuotes.flatMap((quote) => quote.revisions.flatMap((revision) => revision.priceVersions));
  const allIds = [...quoteIds, ...orderIds, ...schedulingResult.ids, ...closingResult.periodIds, ...closingResult.allocationIds];
  const referencesValid = generatedAssignments.every((assignment) => orderIds.includes(assignment.salesOrderId)) && generatedAllocations.every((allocation) => orderIds.includes(allocation.salesOrderId) && (!allocation.scheduleAssignmentId || schedulingResult.ids.includes(allocation.scheduleAssignmentId)));
  const quoteById = new Map(generatedQuotes.map((quote) => [quote.id, quote]));
  const quoteOrderSourcesValid = generatedOrders.filter((order) => order.sourceType === "quote").every((order) => {
    const quote = order.sourceQuoteId ? quoteById.get(order.sourceQuoteId) : null;
    const revision = quote?.revisions.find((item) => item.revisionId === order.sourceRevisionId);
    return Boolean(revision?.priceVersions.some((version) => version.id === order.sourcePriceVersionId));
  });
  const groupSequencesContinuous = ensured.groups.every(({ group }) => {
    const sequences = generatedAssignments.filter((assignment) => assignment.productionGroupId === group.id).map((assignment) => assignment.queueSequence).sort((left, right) => (left ?? 0) - (right ?? 0));
    return sequences.every((sequence, index) => sequence === index + 1);
  });
  const closingMonths = closingResult.periodIds.map((periodId) => {
    const period = savedClosing.periods.find((item) => item.id === periodId)!;
    const allocations = generatedAllocations.filter((allocation) => allocation.closingPeriodId === periodId);
    const summary = summarizeClosing(allocations);
    return { month: period.month, periodId, status: period.status, relations: allocations.length, orders: new Set(allocations.map((allocation) => allocation.salesOrderId)).size, quantity: summary.quantity, processingOutputRmb: Number(summary.processingOutputRmb.toFixed(2)) };
  });
  const calculatorSamples = (["CNY", "USD"] as const).flatMap((currency) => {
    const entry = generatedQuotes.flatMap((quote) => getDefaultRevision(quote).priceVersions.map((version) => ({ quote, version }))).find(({ version }) => version.pricingParameters.laborCurrency === currency);
    if (!entry) return [];
    const metrics = calculatePriceVersionMetrics(entry.version);
    return [{ quoteId: entry.quote.id, priceVersionId: entry.version.id, currency, fabricCost: metrics.fabricCost, trimCost: metrics.trimCost, laborInput: metrics.laborInput, laborRmb: metrics.laborRmb, otherCost: metrics.otherCost, preMarkupTotal: metrics.preMarkupTotal, garmentSellingPrice: metrics.garmentSellingPrice }];
  });
  const qaAugustPeriods = savedClosing.periods.filter((period) => period.month === "2026-08" && periodOwned(period));
  const nonQaAugustPeriods = savedClosing.periods.filter((period) => period.month === "2026-08" && !periodOwned(period));

  return {
    datasetId: UI_QA_DATASET_ID, seed: UI_QA_SEED, marker: UI_QA_MARKER, generatedAt: UI_QA_GENERATED_AT, anchorDate: UI_QA_ANCHOR_DATE, environment: repos.store.environment,
    counts: { customers: CUSTOMER_NAMES.length, brands: BRAND_NAMES.length, quotes: generatedQuotes.length, quoteRevisions: generatedQuotes.reduce((total, quote) => total + quote.revisions.length, 0), currentPriceVersions: currentPriceVersions.length, allRevisionPriceVersions: allRevisionPriceVersions.length, singleRevisionQuotes: revisionCounts.filter((count) => count === 1).length, v2Quotes: revisionCounts.filter((count) => count === 2).length, v3Quotes: revisionCounts.filter((count) => count === 3).length, singlePriceVersionQuotes: priceVersionCounts.filter((count) => count === 1).length, multiplePriceVersionQuotes: priceVersionCounts.filter((count) => count > 1).length, orders: generatedOrders.length, deliveryPlans: generatedOrders.reduce((total, order) => total + order.deliveryPlans.length, 0), activeDeliveryPlans: generatedOrders.reduce((total, order) => total + activeDeliveryPlans(order).length, 0), quantityChanges: generatedOrders.reduce((total, order) => total + order.quantityChanges.length, 0), orderPriceVersions: generatedOrders.reduce((total, order) => total + order.priceVersions.length, 0), ordersWithQuantityHistory: generatedOrders.filter((order) => order.quantityChanges.length > 0).length, ordersWithPriceHistory: generatedOrders.filter((order) => order.priceVersions.length > 1).length, ordersWithMultipleDeliveryPlans: generatedOrders.filter((order) => activeDeliveryPlans(order).length > 1).length, scheduledOrders: generatedAssignments.length, unscheduledOrders: generatedOrders.filter((order) => !generatedAssignments.some((assignment) => assignment.salesOrderId === order.id)).length, productionGroups: ensured.groups.length, orderExecutionTrackings: savedScheduling.orderExecutionTrackings.filter((tracking) => orderIds.includes(tracking.salesOrderId)).length, closingPeriods: closingResult.periodIds.length, closingAllocations: generatedAllocations.length, operationLogs: 0, attachments: 0 },
    distributions: { quoteStatus: distribution(generatedQuotes.map((quote) => quote.aggregateStatus)), quoteConfirmation: distribution(generatedQuotes.map((quote) => { const summary = getDefaultRevision(quote).confirmationSummary; return summary.confirmedCount === 0 ? "unconfirmed" : summary.confirmedCount === summary.totalCount ? "confirmed" : "partially_confirmed"; })), revisionCount: distribution(revisionCounts.map(String)), priceVersionCount: distribution(priceVersionCounts.map(String)), priceVersionCountry: distribution(currentPriceVersions.map((version) => version.pricingParameters.manufacturingCountry)), priceVersionCurrency: distribution(currentPriceVersions.map((version) => version.pricingParameters.laborCurrency)), orderStatus: distribution(generatedOrders.map((order) => order.status)), productionCountry: distribution(generatedOrders.map((order) => order.productionCountry || "未填写")), poPresence: distribution(generatedOrders.map((order) => order.customerPoNo ? "withPo" : "withoutPo")), productionStatus: distribution(productionStatuses), closingStatus: distribution(closingStatuses), closingPeriodStatus: distribution(savedClosing.periods.filter((period) => closingResult.periodIds.includes(period.id)).map((period) => period.status)) },
    ids: { quotes: quoteIds, orders: orderIds, scheduleAssignments: schedulingResult.ids, closingPeriods: closingResult.periodIds, closingAllocations: closingResult.allocationIds, productionGroupsCreated: ensured.groups.filter((item) => !item.reused).map((item) => item.group.id), productionGroupsReused: ensured.groups.filter((item) => item.reused).map((item) => item.group.id) },
    installation: { quotesAdded, quotesSkipped, ordersAdded, ordersSkipped, assignmentsAdded: addedAssignments, assignmentsSkipped: schedulingResult.ids.length - addedAssignments, closingPeriodsAdded: addedPeriods, closingPeriodsSkipped: closingResult.periodIds.length - addedPeriods, closingAllocationsAdded: addedAllocations, closingAllocationsSkipped: closingResult.allocationIds.length - addedAllocations },
    actualTotals: { quotes: savedQuotes.length, orders: savedOrders.length, productionGroups: settings.productionGroups.length, scheduleAssignments: savedScheduling.scheduleAssignments.length, closingPeriods: savedClosing.periods.length, closingAllocations: savedClosing.allocations.length },
    productionGroups: groupReport,
    closingMonths,
    calculatorSamples,
    integrity: { deterministicSeed: UI_QA_SEED, uniqueGeneratedIds: new Set(allIds).size === allIds.length, oneOrderOneStyle: generatedOrders.every((order) => Boolean(order.styleNo) && !("items" in order)), noGroup14: !ensured.groups.some((item) => item.group.name.trim() === "14组"), allGroupsCovered: groupReport.every((group) => group.scheduledOrders >= 8 && group.scheduledOrders <= 12), variedGroupCounts: new Set(groupReport.map((group) => group.scheduledOrders)).size > 1, referencesValid, quoteOrderSourcesValid, defaultRevisionValid: generatedQuotes.every((quote) => quote.revisions.some((revision) => revision.revisionId === quote.defaultRevisionId && !revision.readOnly)), currentPricePointersValid: generatedOrders.every((order) => order.priceVersions.some((version) => version.id === order.currentPriceVersionId && version.salesOrderId === order.id)), groupSequencesContinuous, scheduleDatesOrdered: generatedAssignments.every((assignment) => !assignment.plannedStartDate || !assignment.plannedEndDate || assignment.plannedStartDate <= assignment.plannedEndDate), deliveryScheduleFactsSeparated: generatedOrders.every((order) => order.deliveryPlans.every((plan) => plan.salesOrderId === order.id)) && generatedAssignments.every((assignment) => assignment.salesOrderId && !generatedOrders.flatMap((order) => order.deliveryPlans.map((plan) => plan.id)).includes(assignment.id)), qaAugustClosingPeriods: qaAugustPeriods.length, nonQaAugustClosingPeriodsPreserved: nonQaAugustPeriods.length },
  };
}

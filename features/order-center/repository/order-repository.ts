"use client";

import { browserLocalDataStore, type LocalDataStore } from "../../data-management/repository/local-data-store.ts";
import { migrateOrderCollectionV5ToV6 } from "../migration/order-v5-to-v6.ts";
import { normalizeOrderNo, normalizeSalesOrderV10, orderReferencesAttachment, validateOrderCollection, type SalesOrder } from "../model/order.ts";

export const ORDER_STORAGE_NAME = "sales-orders";

export interface OrderRepository {
  list(): Promise<SalesOrder[]>;
  getById(id: string): Promise<SalesOrder | null>;
  save(order: SalesOrder): Promise<SalesOrder>;
  saveAll(orders: SalesOrder[]): Promise<SalesOrder[]>;
  orderNoExists(orderNo: string, excludingId?: string): Promise<boolean>;
  isAttachmentReferenced(attachmentId: string): Promise<boolean>;
}

const clone = <T>(value: T): T => structuredClone(value);

export function createOrderRepository(store: LocalDataStore = browserLocalDataStore): OrderRepository {
  let memory: SalesOrder[] | null = null;
  const migrate = (value: unknown) => {
    const result = migrateOrderCollectionV5ToV6(value);
    for (const diagnostic of result.diagnostics) console.warn(`[order-migration:${diagnostic.code}] ${diagnostic.message}`);
    return result.orders.map(normalizeSalesOrderV10);
  };
  const read = () => memory ??= validateOrderCollection(store.initialize(ORDER_STORAGE_NAME, { seed: () => [], migrate }));
  const write = (orders: SalesOrder[]) => { memory = store.save(ORDER_STORAGE_NAME, validateOrderCollection(orders)); };
  return {
    async list() { return clone(read().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))); },
    async getById(id) { return clone(read().find((order) => order.id === id) ?? null); },
    async save(order) {
      if (!normalizeOrderNo(order.orderNo)) throw new Error("请填写订单号");
      if (read().some((candidate) => candidate.id !== order.id && normalizeOrderNo(candidate.orderNo) === normalizeOrderNo(order.orderNo))) throw new Error("订单号已存在");
      validateOrderCollection([order]);
      const orders = read();
      const index = orders.findIndex((candidate) => candidate.id === order.id);
      if (index >= 0) orders[index] = clone(order); else orders.unshift(clone(order));
      write(orders);
      return clone(order);
    },
    async saveAll(orders) {
      const normalized = orders.map(normalizeSalesOrderV10);
      write(validateOrderCollection(normalized));
      return clone(normalized);
    },
    async orderNoExists(orderNo, excludingId) { return read().some((order) => order.id !== excludingId && normalizeOrderNo(order.orderNo) === normalizeOrderNo(orderNo)); },
    async isAttachmentReferenced(attachmentId) { return read().some((order) => orderReferencesAttachment(order, attachmentId)); },
  };
}

export const orderRepository = createOrderRepository();
export const orderStorageKey = browserLocalDataStore.key(ORDER_STORAGE_NAME);

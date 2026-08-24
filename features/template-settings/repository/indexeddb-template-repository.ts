"use client";

import type { TemplateDefinition } from "../model/template-definition";
import type { TemplateRepository } from "./template-repository";

const DATABASE = "zhixu-export-templates";
const STORE = "templates";
const DEFAULT_KEY = "zhixu.template-settings.default.quote_customer";
const BUILTIN_FORMAL_URL = new URL("../../../templates/quote-export-template-v1.xlsx", import.meta.url);
const BUILTIN_PLACEHOLDER_URL = new URL("../../../templates/quote-customer-placeholder-v1.xlsx", import.meta.url);
const BUILTIN_TIME = "2026-08-22T00:00:00.000Z";

export const BUILTIN_FORMAL_TEMPLATE: TemplateDefinition = {
  id: "builtin-quote-customer-formal-v1", type: "quote_customer", name: "报价单模板", version: 1,
  fileName: "quote-export-template-v1.xlsx", isDefault: true, enabled: true,
  createdAt: BUILTIN_TIME, updatedAt: BUILTIN_TIME, createdBy: "系统", builtIn: true,
};

export const BUILTIN_PLACEHOLDER_TEMPLATE: TemplateDefinition = {
  id: "builtin-quote-customer-placeholder-v2", type: "quote_customer", name: "报价单占位符模板", version: 2,
  fileName: "quote-customer-placeholder-v1.xlsx", isDefault: false, enabled: true,
  createdAt: BUILTIN_TIME, updatedAt: BUILTIN_TIME, createdBy: "系统", builtIn: true,
};

type StoredTemplate = { definition: TemplateDefinition; blob: Blob };

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "definition.id" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开模板存储"));
  });
}

async function allStored(): Promise<StoredTemplate[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => { db.close(); resolve(request.result as StoredTemplate[]); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

async function putStored(record: StoredTemplate): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(record);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}

function defaultId(): string {
  return typeof localStorage === "undefined" ? BUILTIN_FORMAL_TEMPLATE.id : localStorage.getItem(DEFAULT_KEY) || BUILTIN_FORMAL_TEMPLATE.id;
}

function withDefault(definitions: TemplateDefinition[]): TemplateDefinition[] {
  const selected = defaultId();
  const validDefault = definitions.some((item) => item.id === selected && item.enabled) ? selected : BUILTIN_FORMAL_TEMPLATE.id;
  return definitions.map((item) => ({ ...item, isDefault: item.id === validDefault }));
}

async function builtInBlob(id: string): Promise<Blob | null> {
  const url = id === BUILTIN_FORMAL_TEMPLATE.id ? BUILTIN_FORMAL_URL : id === BUILTIN_PLACEHOLDER_TEMPLATE.id ? BUILTIN_PLACEHOLDER_URL : null;
  if (!url) return null;
  const response = await fetch(url);
  return response.ok ? response.blob() : null;
}

export const indexedDbTemplateRepository: TemplateRepository = {
  async list(type) {
    const user = (await allStored()).map((item) => item.definition);
    return withDefault([BUILTIN_FORMAL_TEMPLATE, BUILTIN_PLACEHOLDER_TEMPLATE, ...user]).filter((item) => !type || item.type === type);
  },
  async getById(id) { return (await this.list()).find((item) => item.id === id) ?? null; },
  async getBlob(id) { return await builtInBlob(id) ?? (await allStored()).find((item) => item.definition.id === id)?.blob ?? null; },
  async save(definition, blob) { await putStored({ definition: { ...definition, builtIn: false }, blob }); },
  async setDefault(id) {
    const definition = await this.getById(id);
    if (!definition?.enabled) throw new Error("停用模板不能设为默认");
    localStorage.setItem(DEFAULT_KEY, id);
  },
  async setEnabled(id, enabled) {
    const record = (await allStored()).find((item) => item.definition.id === id);
    if (!record) throw new Error("系统内置模板不能停用");
    await putStored({ ...record, definition: { ...record.definition, enabled, updatedAt: new Date().toISOString() } });
    if (!enabled && defaultId() === id) localStorage.setItem(DEFAULT_KEY, BUILTIN_FORMAL_TEMPLATE.id);
  },
  async copy(id, definition) {
    const blob = await this.getBlob(id);
    if (!blob) throw new Error("模板文件不可用");
    await this.save({ ...definition, builtIn: false }, blob);
  },
};

export async function getDefaultQuoteCustomerTemplate(): Promise<{ definition: TemplateDefinition; buffer: ArrayBuffer }> {
  const definitions = await indexedDbTemplateRepository.list("quote_customer");
  const definition = definitions.find((item) => item.isDefault && item.enabled) ?? BUILTIN_FORMAL_TEMPLATE;
  const blob = await indexedDbTemplateRepository.getBlob(definition.id);
  if (!blob) throw new Error("默认报价模板文件不可用");
  return { definition, buffer: await blob.arrayBuffer() };
}

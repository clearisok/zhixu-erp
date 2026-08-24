"use client";

import type { AttachmentViewModel } from "../model/quote-attachments";
import type { AttachmentRepository, SaveAttachmentInput } from "./attachment-repository";

const DATABASE_NAME = "zhixu-quote-attachments";
const DATABASE_VERSION = 1;
const STORE_NAME = "attachments";

type StoredAttachment = AttachmentViewModel & { blob: Blob };

let databasePromise: Promise<IDBDatabase> | null = null;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("附件存储操作失败"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("附件存储事务失败"));
    transaction.onabort = () => reject(transaction.error ?? new Error("附件存储事务已中止"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("当前浏览器不支持 IndexedDB，无法保存附件。"));
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开附件数据库"));
  });
  return databasePromise;
}

function metadata(record: StoredAttachment): AttachmentViewModel {
  return {
    id: record.id,
    name: record.name,
    mimeType: record.mimeType,
    size: record.size,
    kind: record.kind,
    storageKey: record.storageKey,
    createdAt: record.createdAt,
    createdBy: record.createdBy,
    legacyUrl: record.legacyUrl,
  };
}

export const indexedDbAttachmentRepository: AttachmentRepository = {
  async save(file: File, input: SaveAttachmentInput) {
    const database = await openDatabase();
    const viewModel: AttachmentViewModel = {
      id: input.id,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      kind: input.kind,
      storageKey: `${STORE_NAME}/${input.id}`,
      createdAt: input.createdAt,
      createdBy: input.createdBy,
    };
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ ...viewModel, blob: file } satisfies StoredAttachment);
    await transactionComplete(transaction);
    return viewModel;
  },

  async get(id) {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const record = await requestResult(transaction.objectStore(STORE_NAME).get(id) as IDBRequest<StoredAttachment | undefined>);
    return record ? metadata(record) : null;
  },

  async list(ids) {
    if (!ids.length) return [];
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const records = await Promise.all(ids.map((id) => requestResult(store.get(id) as IDBRequest<StoredAttachment | undefined>)));
    return records.filter((record): record is StoredAttachment => Boolean(record)).map(metadata);
  },

  async getBlob(id) {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const record = await requestResult(transaction.objectStore(STORE_NAME).get(id) as IDBRequest<StoredAttachment | undefined>);
    return record?.blob ?? null;
  },

  async delete(id) {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    await transactionComplete(transaction);
  },
};

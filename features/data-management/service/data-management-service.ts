"use client";

import { loadBasicSettings } from "../../basic-settings/repository/basic-settings-repository";
import { recentSearchRepository } from "../../global-search/repository/recent-search-repository";
import { operationLogRepository } from "../../operation-logs/repository/operation-log-repository";
import { permissionRepository } from "../../permissions/repository/permission-repository";
import { operationsSettingsRepository } from "../../operations-settings/repository/operations-settings-repository";
import { orderRepository } from "../../order-center/repository/order-repository";
import { migrateOrderStorageRecordToV6 } from "../../order-center/migration/order-v5-to-v6";
import { productionSchedulingRepository, PRODUCTION_SCHEDULING_STORAGE_NAME } from "../../production-scheduling/repository/production-scheduling-repository";
import { validateProductionSchedulingState } from "../../production-scheduling/model/production-scheduling";
import { migrateProductionSchedulingV8ToV9 } from "../../production-scheduling/migration/production-scheduling-v8-to-v9";
import { closingRepository, CLOSING_STORAGE_NAME } from "../../closing-center/repository/closing-repository";
import { validateClosingState } from "../../closing-center/model/closing";
import { ainuokeRepository, AINUOKE_STORAGE_NAME } from "../../ainuoke-sync/repository/ainuoke-repository";
import { validateAinuokeSyncState } from "../../ainuoke-sync/model/ainuoke";
import {
  exportStoredAttachments,
  replaceStoredAttachments,
  type AttachmentBackupRecord,
} from "../../quote-center/repository/indexeddb-attachment-repository";
import { mockQuoteRepository } from "../../quote-center/repository/mock-quote-repository";
import {
  CURRENT_MOCK_USER_ID,
  loadGlobalQuoteSettings,
  loadQuoteSettings,
} from "../../quote-center/model/quote-settings";
import {
  exportStoredTemplates,
  indexedDbTemplateRepository,
  replaceStoredTemplates,
  type TemplateBackupRecord,
} from "../../template-settings/repository/indexeddb-template-repository";
import {
  LOCAL_DATA_BACKUP_VERSION,
  type BackupSummary,
  type EncodedBlob,
  type LocalDataBackup,
} from "../model/data-backup";
import {
  browserLocalDataStore,
  LEGACY_LOCAL_DATA_KEYS,
  LOCAL_DATA_SCHEMA_VERSION,
  LocalDataCorruptionError,
} from "../repository/local-data-store";

export const RESET_ALL_LOCAL_DATA_CONFIRMATION = "重置全部本地业务数据";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function base64ToBlob(encoded: EncodedBlob): Blob {
  const binary = atob(encoded.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const blob = new Blob([bytes], { type: encoded.mimeType });
  if (blob.size !== encoded.size) throw new Error("备份中的文件大小校验失败");
  return blob;
}

async function encodeBlob(blob: Blob): Promise<EncodedBlob> {
  return { mimeType: blob.type || "application/octet-stream", size: blob.size, base64: arrayBufferToBase64(await blob.arrayBuffer()) };
}

export async function initializeLocalDataLifecycle(): Promise<void> {
  if (typeof window === "undefined") return;
  loadBasicSettings();
  loadGlobalQuoteSettings();
  loadQuoteSettings(CURRENT_MOCK_USER_ID);
  const legacyPreferenceUserIds: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    const prefix = `${LEGACY_LOCAL_DATA_KEYS.quotePreferencesPrefix}.`;
    if (key?.startsWith(prefix)) legacyPreferenceUserIds.push(decodeURIComponent(key.slice(prefix.length)));
  }
  for (const userId of legacyPreferenceUserIds) loadQuoteSettings(userId);
  permissionRepository.load();
  operationsSettingsRepository.load();
  await orderRepository.list();
  await productionSchedulingRepository.load();
  await closingRepository.load();
  await ainuokeRepository.load();
  await mockQuoteRepository.list();
  await operationLogRepository.list();
  recentSearchRepository.list(CURRENT_MOCK_USER_ID);
  await indexedDbTemplateRepository.list();
}

export async function exportLocalDataBackup(): Promise<LocalDataBackup> {
  await initializeLocalDataLifecycle();
  const [attachments, templates] = await Promise.all([exportStoredAttachments(), exportStoredTemplates()]);
  return {
    product: "zhixu-erp",
    backupVersion: LOCAL_DATA_BACKUP_VERSION,
    schemaVersion: LOCAL_DATA_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    environment: browserLocalDataStore.environment,
    origin: typeof window === "undefined" ? "unknown" : window.location.origin,
    namespace: browserLocalDataStore.namespace,
    localRecords: browserLocalDataStore.getRawRecords(),
    attachments: await Promise.all(attachments.map(async ({ attachment, blob }) => ({ attachment, file: await encodeBlob(blob) }))),
    templates: await Promise.all(templates.map(async ({ definition, blob }) => ({ definition, file: await encodeBlob(blob) }))),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function validateLocalDataBackup(value: unknown): LocalDataBackup {
  if (!isRecord(value) || value.product !== "zhixu-erp" || value.backupVersion !== LOCAL_DATA_BACKUP_VERSION) throw new Error("不是受支持的织序 ERP 备份文件");
  if (typeof value.schemaVersion !== "number" || value.schemaVersion > LOCAL_DATA_SCHEMA_VERSION) throw new Error("备份数据版本高于当前系统，无法安全恢复");
  if (typeof value.createdAt !== "string" || typeof value.environment !== "string" || typeof value.origin !== "string") throw new Error("备份元数据不完整");
  if (!isRecord(value.localRecords) || !Array.isArray(value.attachments) || !Array.isArray(value.templates)) throw new Error("备份内容结构不完整");
  const localRecords: Record<string, string> = {};
  let restoredOrders: Awaited<ReturnType<typeof orderRepository.list>> | undefined;
  for (const [key, raw] of Object.entries(value.localRecords)) {
    if (!key.startsWith(`${browserLocalDataStore.namespace}.`) || typeof raw !== "string") throw new Error(`备份包含无效存储项：${key}`);
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (key.endsWith(".sales-orders")) {
        const migrated = migrateOrderStorageRecordToV6(parsed, { schemaVersion: LOCAL_DATA_SCHEMA_VERSION, fallbackTimestamp: value.createdAt });
        restoredOrders = migrated.data;
        localRecords[key] = JSON.stringify(migrated);
        continue;
      }
    } catch (error) { throw new LocalDataCorruptionError(key, error); }
    localRecords[key] = raw;
  }
  const schedulingKey = `${browserLocalDataStore.namespace}.${PRODUCTION_SCHEDULING_STORAGE_NAME}`;
  if (localRecords[schedulingKey]) {
    try {
      const parsed = JSON.parse(localRecords[schedulingKey]) as { data?: unknown };
      const scheduling = validateProductionSchedulingState(migrateProductionSchedulingV8ToV9(parsed?.data ?? parsed), { orders: restoredOrders });
      if (!restoredOrders && (scheduling.scheduleAssignments.length || scheduling.orderExecutionTrackings.length)) throw new Error("排单备份缺少 sales-orders 归属记录");
    } catch (error) { throw new LocalDataCorruptionError(schedulingKey, error); }
  }
  const closingKey = `${browserLocalDataStore.namespace}.${CLOSING_STORAGE_NAME}`;
  if (localRecords[closingKey]) {
    try {
      const parsed = JSON.parse(localRecords[closingKey]) as { data?: unknown };
      const orderIds = restoredOrders ? new Set(restoredOrders.map((item) => item.id)) : undefined;
      const schedulingRaw = localRecords[schedulingKey] ? JSON.parse(localRecords[schedulingKey]) as { data?: unknown } : null;
      const scheduling = schedulingRaw ? validateProductionSchedulingState(migrateProductionSchedulingV8ToV9(schedulingRaw.data ?? schedulingRaw)) : null;
      const assignmentIds = scheduling ? new Set(scheduling.scheduleAssignments.map((item) => item.id)) : undefined;
      const closing = validateClosingState(parsed?.data ?? parsed, { orderIds, assignmentIds });
      if (!restoredOrders && closing.allocations.length) throw new Error("关账备份缺少 sales-orders 归属记录");
    } catch (error) { throw new LocalDataCorruptionError(closingKey, error); }
  }
  const ainuokeKey = `${browserLocalDataStore.namespace}.${AINUOKE_STORAGE_NAME}`;
  if (localRecords[ainuokeKey]) {
    try {
      const parsed = JSON.parse(localRecords[ainuokeKey]) as { data?: unknown };
      validateAinuokeSyncState(parsed?.data ?? parsed);
    } catch (error) { throw new LocalDataCorruptionError(ainuokeKey, error); }
  }
  for (const entry of [...value.attachments, ...value.templates]) {
    if (!isRecord(entry) || !isRecord(entry.file) || typeof entry.file.base64 !== "string" || typeof entry.file.mimeType !== "string" || typeof entry.file.size !== "number") throw new Error("备份包含无效文件记录");
  }
  return { ...(value as unknown as LocalDataBackup), localRecords };
}

export function backupSummary(backup: LocalDataBackup): BackupSummary {
  return {
    createdAt: backup.createdAt,
    environment: backup.environment,
    localRecordCount: Object.keys(backup.localRecords).length,
    attachmentCount: backup.attachments.length,
    templateCount: backup.templates.length,
  };
}

export async function restoreLocalDataBackup(input: unknown): Promise<void> {
  const backup = validateLocalDataBackup(input);
  const nextAttachments: AttachmentBackupRecord[] = backup.attachments.map((entry) => ({ attachment: entry.attachment, blob: base64ToBlob(entry.file) }));
  const nextTemplates: TemplateBackupRecord[] = backup.templates.map((entry) => ({ definition: entry.definition, blob: base64ToBlob(entry.file) }));
  const previousLocalRecords = browserLocalDataStore.getRawRecords();
  const [previousAttachments, previousTemplates] = await Promise.all([exportStoredAttachments(), exportStoredTemplates()]);
  try {
    await replaceStoredAttachments(nextAttachments);
    await replaceStoredTemplates(nextTemplates);
    browserLocalDataStore.replaceRawRecords(backup.localRecords);
  } catch (error) {
    browserLocalDataStore.replaceRawRecords(previousLocalRecords);
    await Promise.all([replaceStoredAttachments(previousAttachments), replaceStoredTemplates(previousTemplates)]);
    throw error;
  }
}

function removeLegacyLocalStorageRecords(): void {
  if (typeof window === "undefined") return;
  const exactKeys = [
    ...LEGACY_LOCAL_DATA_KEYS.basicSettings,
    LEGACY_LOCAL_DATA_KEYS.globalQuoteSettings,
    LEGACY_LOCAL_DATA_KEYS.quotePreferences,
    LEGACY_LOCAL_DATA_KEYS.permissionState,
    LEGACY_LOCAL_DATA_KEYS.operationLogs,
    LEGACY_LOCAL_DATA_KEYS.recentSearch,
    LEGACY_LOCAL_DATA_KEYS.templateDefault,
  ];
  for (const key of exactKeys) window.localStorage.removeItem(key);
  const prefixed: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(`${LEGACY_LOCAL_DATA_KEYS.quotePreferencesPrefix}.`)) prefixed.push(key);
  }
  for (const key of prefixed) window.localStorage.removeItem(key);
  window.sessionStorage.removeItem(LEGACY_LOCAL_DATA_KEYS.quotes);
}

export async function resetAllLocalBusinessData(confirmation: string): Promise<void> {
  if (confirmation !== RESET_ALL_LOCAL_DATA_CONFIRMATION) throw new Error("重置全部本地业务数据需要输入完整确认文字");
  await Promise.all([replaceStoredAttachments([]), replaceStoredTemplates([])]);
  browserLocalDataStore.clearNamespace();
  removeLegacyLocalStorageRecords();
}

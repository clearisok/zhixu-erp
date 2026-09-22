import type { LocalDataBackup } from "../../data-management/model/data-backup";
import { LOCAL_DATA_BACKUP_VERSION } from "../../data-management/model/data-backup";
import { LOCAL_DATA_SCHEMA_VERSION, localDataKeys } from "../../data-management/repository/local-data-store";
import {
  previewMasterSettingsMigration,
  type MasterSettingsMigrationPreview,
  type MasterSettingsMigrationSource,
} from "./master-settings-migration-preview";

type UnknownRecord = Record<string, unknown>;

export const MASTER_SETTINGS_BACKUP_PREVIEW_CONTRACT = "quote-master-settings-backup-preview.v1" as const;

export type SourceRecordEvidence = {
  storageKey: string;
  format: "current-envelope" | "legacy-envelope" | "legacy-unwrapped";
  schemaVersion: number | null;
  rawEnvelopeHash: string;
};

export type MasterSettingsBackupPreviewReport = {
  contract: typeof MASTER_SETTINGS_BACKUP_PREVIEW_CONTRACT;
  capture: {
    timestamp: string;
    environment: string;
    origin: string;
    namespace: string;
    backupVersion: number;
    schemaVersion: number;
  };
  sourceRecords: {
    basicSettings: SourceRecordEvidence;
    globalQuoteSettings: SourceRecordEvidence;
  };
  sourceHash: string;
  excludedRecordCount: number;
  excludedRecordPolicy: "all non-master/settings records, including UI preferences";
  sensitiveFieldPaths: string[];
  databaseReads: 0;
  databaseWrites: 0;
  browserWrites: 0;
  preview: MasterSettingsMigrationPreview;
};

export class MasterSettingsBackupContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MasterSettingsBackupContractError";
  }
}

const record = (value: unknown): UnknownRecord => value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
const list = (value: unknown): UnknownRecord[] => Array.isArray(value) ? value.map(record) : [];

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as UnknownRecord)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requireString(owner: UnknownRecord, key: string): string {
  const value = owner[key];
  if (typeof value !== "string" || !value.trim()) throw new MasterSettingsBackupContractError(`Backup ${key} is missing or invalid`);
  return value;
}

function requireInteger(owner: UnknownRecord, key: string, maximum?: number): number {
  const value = owner[key];
  if (!Number.isInteger(value) || (value as number) < 0 || maximum !== undefined && (value as number) > maximum) {
    throw new MasterSettingsBackupContractError(`Backup ${key} is unsupported`);
  }
  return value as number;
}

type ParsedSourceRecord = SourceRecordEvidence & { data: UnknownRecord; hashInput: unknown };

async function parseSourceRecord(raw: unknown, storageKey: string, backupSchemaVersion: number): Promise<ParsedSourceRecord> {
  if (typeof raw !== "string") throw new MasterSettingsBackupContractError(`Backup record ${storageKey} is missing`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new MasterSettingsBackupContractError(`Backup record ${storageKey} is not valid JSON`);
  }
  const rawEnvelopeHash = await sha256(canonicalJson(parsed));
  const envelope = record(parsed);
  if (Object.prototype.hasOwnProperty.call(envelope, "schemaVersion") || Object.prototype.hasOwnProperty.call(envelope, "data")) {
    if (!Object.prototype.hasOwnProperty.call(envelope, "schemaVersion") || !Object.prototype.hasOwnProperty.call(envelope, "data")) {
      throw new MasterSettingsBackupContractError(`Backup record ${storageKey} is an incomplete envelope`);
    }
    const schemaVersion = requireInteger(envelope, "schemaVersion", LOCAL_DATA_SCHEMA_VERSION);
    if (schemaVersion > backupSchemaVersion) throw new MasterSettingsBackupContractError(`Backup record ${storageKey} is newer than the backup manifest`);
    const data = record(envelope.data);
    return {
      storageKey,
      format: schemaVersion === LOCAL_DATA_SCHEMA_VERSION ? "current-envelope" : "legacy-envelope",
      schemaVersion,
      rawEnvelopeHash,
      data,
      // Capture/envelope timestamps are evidence, not business identity.
      hashInput: { storageKey, schemaVersion, data },
    };
  }
  return {
    storageKey,
    format: "legacy-unwrapped",
    schemaVersion: null,
    rawEnvelopeHash,
    data: record(parsed),
    hashInput: { storageKey, schemaVersion: null, data: record(parsed) },
  };
}

function sensitivePaths(value: unknown, path = "source"): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => sensitivePaths(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as UnknownRecord).flatMap(([key, item]) => {
    const next = `${path}.${key}`;
    const own = /(?:password|credential|token|cookie|csrf|session)/iu.test(key) ? [next] : [];
    return [...own, ...sensitivePaths(item, next)];
  });
}

function toSource(basic: UnknownRecord, global: UnknownRecord): MasterSettingsMigrationSource {
  return {
    basicSettings: {
      brands: list(basic.brands),
      customerSalespeople: list(basic.customerSalespeople),
      fabricLibrary: list(basic.fabricLibrary),
      trimLibrary: list(basic.trimLibrary),
      systemDefaults: record(basic.systemDefaults),
    },
    globalQuoteSettings: global,
  };
}

/**
 * Reads an already-created standard LocalDataBackup value in memory and projects only
 * the two authoritative master/settings records. It has no storage or database access.
 */
export async function previewMasterSettingsBackup(value: unknown): Promise<MasterSettingsBackupPreviewReport> {
  const backup = record(value);
  if (backup.product !== "zhixu-erp" || backup.backupVersion !== LOCAL_DATA_BACKUP_VERSION) {
    throw new MasterSettingsBackupContractError("Not a supported Zhixu ERP backup");
  }
  const schemaVersion = requireInteger(backup, "schemaVersion", LOCAL_DATA_SCHEMA_VERSION);
  const timestamp = requireString(backup, "createdAt");
  if (Number.isNaN(Date.parse(timestamp))) throw new MasterSettingsBackupContractError("Backup createdAt is invalid");
  const environment = requireString(backup, "environment");
  const origin = requireString(backup, "origin");
  const namespace = requireString(backup, "namespace");
  const localRecords = record(backup.localRecords);
  if (!Array.isArray(backup.attachments) || !Array.isArray(backup.templates)) {
    throw new MasterSettingsBackupContractError("Backup is missing standard attachment/template containers");
  }
  const keys = localDataKeys(namespace);
  const [basic, global] = await Promise.all([
    parseSourceRecord(localRecords[keys.basicSettings], keys.basicSettings, schemaVersion),
    parseSourceRecord(localRecords[keys.globalQuoteSettings], keys.globalQuoteSettings, schemaVersion),
  ]);
  const source = toSource(basic.data, global.data);
  const preview = previewMasterSettingsMigration(source);
  const foundSensitivePaths = sensitivePaths(source);
  if (foundSensitivePaths.length) preview.blockingErrors.push("Master/settings source contains forbidden credential/session fields");
  const sourceHash = await sha256(canonicalJson({
    contract: MASTER_SETTINGS_BACKUP_PREVIEW_CONTRACT,
    namespace,
    records: [basic.hashInput, global.hashInput],
  }));
  return {
    contract: MASTER_SETTINGS_BACKUP_PREVIEW_CONTRACT,
    capture: {
      timestamp,
      environment,
      origin,
      namespace,
      backupVersion: backup.backupVersion as LocalDataBackup["backupVersion"],
      schemaVersion,
    },
    sourceRecords: {
      basicSettings: { storageKey: basic.storageKey, format: basic.format, schemaVersion: basic.schemaVersion, rawEnvelopeHash: basic.rawEnvelopeHash },
      globalQuoteSettings: { storageKey: global.storageKey, format: global.format, schemaVersion: global.schemaVersion, rawEnvelopeHash: global.rawEnvelopeHash },
    },
    sourceHash,
    excludedRecordCount: Math.max(0, Object.keys(localRecords).length - 2),
    excludedRecordPolicy: "all non-master/settings records, including UI preferences",
    sensitiveFieldPaths: foundSensitivePaths,
    databaseReads: 0,
    databaseWrites: 0,
    browserWrites: 0,
    preview,
  };
}

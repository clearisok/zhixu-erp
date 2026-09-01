"use client";

export const LOCAL_DATA_SCHEMA_VERSION = 11 as const;
export const DEFAULT_LOCAL_DATA_NAMESPACE = "zhixu.erp.local";
export const TEST_LOCAL_DATA_NAMESPACE = "zhixu.erp.test";

export type LocalDataEnvironment = "development" | "production" | "test" | "unknown";

export type LocalStorageLike = Pick<Storage, "getItem" | "setItem"> & Partial<Pick<Storage, "removeItem" | "key" | "length">>;

export type LocalDataManifest = {
  product: "zhixu-erp";
  schemaVersion: typeof LOCAL_DATA_SCHEMA_VERSION;
  environment: LocalDataEnvironment;
  initializedAt: string;
  updatedAt: string;
};

export type LocalDataEnvelope<T> = {
  schemaVersion: typeof LOCAL_DATA_SCHEMA_VERSION;
  initializedAt: string;
  updatedAt: string;
  data: T;
};

export type LegacyStorageSource = {
  key: string;
  storage: LocalStorageLike | null;
  deserialize?: (raw: string) => unknown;
};

export type InitializeLocalDataOptions<T> = {
  seed: () => T;
  legacySources?: LegacyStorageSource[];
  migrate?: (value: unknown) => T;
};

export type LocalDataStore = {
  namespace: string;
  environment: LocalDataEnvironment;
  key: (name: string) => string;
  initialize: <T>(name: string, options: InitializeLocalDataOptions<T>) => T;
  save: <T>(name: string, value: T) => T;
  getRawRecords: () => Record<string, string>;
  replaceRawRecords: (records: Record<string, string>) => void;
  clearNamespace: () => void;
};

export class LocalDataCorruptionError extends Error {
  readonly storageKey: string;

  constructor(storageKey: string, cause?: unknown) {
    super(`本地数据 ${storageKey} 无法解析。系统已保留原始内容，未写入 Seed 或覆盖数据。`, { cause });
    this.name = "LocalDataCorruptionError";
    this.storageKey = storageKey;
  }
}

export function localDataKeys(namespace = DEFAULT_LOCAL_DATA_NAMESPACE) {
  return {
    manifest: `${namespace}.manifest`,
    quotes: `${namespace}.quotes`,
    basicSettings: `${namespace}.basic-settings`,
    globalQuoteSettings: `${namespace}.quote-global-settings`,
    quotePreferencesPrefix: `${namespace}.quote-preferences`,
    tablePreferencesPrefix: `${namespace}.table-preferences`,
    permissionState: `${namespace}.permission-state`,
    operationLogs: `${namespace}.operation-logs`,
    operationsSettings: `${namespace}.operations-settings`,
    salesOrders: `${namespace}.sales-orders`,
    productionScheduling: `${namespace}.production-scheduling`,
    closingCenter: `${namespace}.closing-center`,
    ainuokeSync: `${namespace}.ainuoke-sync`,
    recentSearch: `${namespace}.recent-search`,
    templateDefault: `${namespace}.template-default`,
  } as const;
}

export const LEGACY_LOCAL_DATA_KEYS = {
  quotes: "zhixu.quote-center.slice-1.2",
  basicSettings: ["zhixu.basic-settings.v1.5", "zhixu.basic-settings.v1.3"],
  globalQuoteSettings: "zhixu.quote-center.global-settings.v1",
  quotePreferencesPrefix: "zhixu.quote-center.preferences.v1",
  quotePreferences: "zhixu.quote-center.settings.v1.2",
  permissionState: "zhixu.permission-state.v1",
  operationLogs: "zhixu.operation-logs.v1",
  recentSearch: "zhixu.global-search.recent.v1",
  templateDefault: "zhixu.template-settings.default.quote_customer",
} as const;

const clone = <T>(value: T): T => structuredClone(value);

function browserEnvironment(): LocalDataEnvironment {
  if (typeof window === "undefined") return "unknown";
  const location = window.location;
  if (!location) return "unknown";
  if (location.port === "3001") return "development";
  if (location.port === "3000") return "production";
  return location.hostname === "127.0.0.1" || location.hostname === "localhost" ? "development" : "production";
}

function browserStorage(): LocalStorageLike | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

function parseJson(raw: string, key: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new LocalDataCorruptionError(key, error);
  }
}

function isEnvelope(value: unknown): value is { schemaVersion: number; initializedAt?: string; updatedAt?: string; data: unknown } {
  return Boolean(value && typeof value === "object" && "schemaVersion" in value && "data" in value);
}

function validateEnvelopeVersion(value: { schemaVersion: number }, key: string): void {
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 0 || value.schemaVersion > LOCAL_DATA_SCHEMA_VERSION) {
    throw new LocalDataCorruptionError(key, new Error(`不支持的 schemaVersion: ${value.schemaVersion}`));
  }
}

export function createLocalDataStore(options: {
  storage?: LocalStorageLike | null;
  namespace?: string;
  environment?: LocalDataEnvironment;
  now?: () => string;
} = {}): LocalDataStore {
  const namespace = options.namespace ?? DEFAULT_LOCAL_DATA_NAMESPACE;
  const configuredEnvironment = options.environment ?? (namespace === TEST_LOCAL_DATA_NAMESPACE ? "test" : undefined);
  const resolveEnvironment = (): LocalDataEnvironment => configuredEnvironment ?? browserEnvironment();
  const now = options.now ?? (() => new Date().toISOString());
  const memory = new Map<string, string>();
  const target = () => options.storage === undefined ? browserStorage() : options.storage;
  const getItem = (key: string) => target()?.getItem(key) ?? memory.get(key) ?? null;
  const setItem = (key: string, value: string) => {
    const storage = target();
    if (storage) storage.setItem(key, value);
    else memory.set(key, value);
  };
  const removeItem = (key: string) => {
    const storage = target();
    if (storage?.removeItem) storage.removeItem(key);
    else memory.delete(key);
  };
  const stableKey = (name: string) => `${namespace}.${name}`;
  const manifestKey = stableKey("manifest");

  const ensureManifest = () => {
    const current = getItem(manifestKey);
    const timestamp = now();
    if (!current) {
      const manifest: LocalDataManifest = {
        product: "zhixu-erp",
        schemaVersion: LOCAL_DATA_SCHEMA_VERSION,
        environment: resolveEnvironment(),
        initializedAt: timestamp,
        updatedAt: timestamp,
      };
      setItem(manifestKey, JSON.stringify(manifest));
      return;
    }
    const parsed = parseJson(current, manifestKey) as Partial<LocalDataManifest>;
    if (parsed.product !== "zhixu-erp" || typeof parsed.schemaVersion !== "number") throw new LocalDataCorruptionError(manifestKey);
    validateEnvelopeVersion({ schemaVersion: parsed.schemaVersion }, manifestKey);
    if (parsed.schemaVersion < LOCAL_DATA_SCHEMA_VERSION) {
      setItem(manifestKey, JSON.stringify({
        ...parsed,
        product: "zhixu-erp",
        schemaVersion: LOCAL_DATA_SCHEMA_VERSION,
        environment: parsed.environment ?? resolveEnvironment(),
        initializedAt: parsed.initializedAt ?? timestamp,
        updatedAt: timestamp,
      } satisfies LocalDataManifest));
    }
  };

  const save = <T>(name: string, value: T): T => {
    ensureManifest();
    const key = stableKey(name);
    const current = getItem(key);
    const timestamp = now();
    let initializedAt = timestamp;
    if (current) {
      const parsed = parseJson(current, key);
      if (isEnvelope(parsed)) {
        validateEnvelopeVersion(parsed, key);
        initializedAt = typeof parsed.initializedAt === "string" ? parsed.initializedAt : timestamp;
      }
    }
    const envelope: LocalDataEnvelope<T> = {
      schemaVersion: LOCAL_DATA_SCHEMA_VERSION,
      initializedAt,
      updatedAt: timestamp,
      data: clone(value),
    };
    setItem(key, JSON.stringify(envelope));
    return clone(value);
  };

  const initialize = <T>(name: string, initOptions: InitializeLocalDataOptions<T>): T => {
    ensureManifest();
    const key = stableKey(name);
    const current = getItem(key);
    if (current) {
      const parsed = parseJson(current, key);
      if (isEnvelope(parsed)) {
        validateEnvelopeVersion(parsed, key);
        const migrated = initOptions.migrate ? initOptions.migrate(parsed.data) : parsed.data as T;
        if (parsed.schemaVersion < LOCAL_DATA_SCHEMA_VERSION) {
          // Infrastructure-only versions introduce independent records. Existing business
          // payloads are re-enveloped byte-for-byte so unknown user fields are not
          // discarded by a module normalizer during infrastructure migrations. v5 -> v6
          // is the first payload migration and therefore persists the module migrator result.
          const valueToPersist = parsed.schemaVersion === 3 || parsed.schemaVersion === 4 || parsed.schemaVersion === 6 || parsed.schemaVersion === 7 || parsed.schemaVersion === 10 ? parsed.data as T : migrated;
          save(name, valueToPersist);
        }
        return clone(migrated);
      }
      const migrated = initOptions.migrate ? initOptions.migrate(parsed) : parsed as T;
      save(name, migrated);
      return clone(migrated);
    }

    for (const source of initOptions.legacySources ?? []) {
      const legacyRaw = source.storage?.getItem(source.key);
      if (legacyRaw === null || legacyRaw === undefined) continue;
      let parsed: unknown;
      try {
        parsed = source.deserialize ? source.deserialize(legacyRaw) : parseJson(legacyRaw, source.key);
      } catch (error) {
        if (error instanceof LocalDataCorruptionError) throw error;
        throw new LocalDataCorruptionError(source.key, error);
      }
      const migrated = initOptions.migrate ? initOptions.migrate(parsed) : parsed as T;
      save(name, migrated);
      return clone(migrated);
    }

    return save(name, initOptions.seed());
  };

  const getRawRecords = (): Record<string, string> => {
    const records: Record<string, string> = {};
    const storage = target();
    if (storage && typeof storage.length === "number" && storage.key) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key?.startsWith(`${namespace}.`)) continue;
        const value = storage.getItem(key);
        if (value !== null) records[key] = value;
      }
      return records;
    }
    for (const [key, value] of memory) if (key.startsWith(`${namespace}.`)) records[key] = value;
    return records;
  };

  const replaceRawRecords = (records: Record<string, string>): void => {
    const entries = Object.entries(records);
    for (const [key, raw] of entries) {
      if (!key.startsWith(`${namespace}.`) || typeof raw !== "string") throw new LocalDataCorruptionError(key);
      parseJson(raw, key);
    }
    const previous = getRawRecords();
    try {
      for (const key of Object.keys(previous)) removeItem(key);
      for (const [key, raw] of entries) setItem(key, raw);
      ensureManifest();
    } catch (error) {
      for (const key of Object.keys(getRawRecords())) removeItem(key);
      for (const [key, raw] of Object.entries(previous)) setItem(key, raw);
      throw error;
    }
  };

  const clearNamespace = (): void => {
    for (const key of Object.keys(getRawRecords())) removeItem(key);
  };

  return { namespace, get environment() { return resolveEnvironment(); }, key: stableKey, initialize, save, getRawRecords, replaceRawRecords, clearNamespace };
}

export const browserLocalDataStore = createLocalDataStore();

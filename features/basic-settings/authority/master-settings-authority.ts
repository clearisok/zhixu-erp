/** Deployment-selected Q3 authority. An invalid value never selects Browser storage. */
export type MasterSettingsAuthority = "browser" | "frozen" | "server";

import { browserLocalDataStore, LOCAL_DATA_SCHEMA_VERSION } from "../../data-management/repository/local-data-store.ts";

declare const __ZHIXU_BUILD_INFO__: { masterSettingsAuthority: string };

export function parseMasterSettingsAuthority(value: string | undefined): MasterSettingsAuthority {
  if (value === undefined || value === "" || value === "browser") return "browser";
  if (value === "frozen" || value === "server") return value;
  throw new Error("Invalid Q3 master/settings authority configuration");
}

export function masterSettingsAuthority(): MasterSettingsAuthority {
  if (typeof __ZHIXU_BUILD_INFO__ !== "undefined") {
    return parseMasterSettingsAuthority(__ZHIXU_BUILD_INFO__.masterSettingsAuthority);
  }
  return parseMasterSettingsAuthority(process.env.NEXT_PUBLIC_ZHIXU_MASTER_SETTINGS_AUTHORITY);
}

export function assertBrowserMasterWrite(): void {
  if (masterSettingsAuthority() !== "browser") throw new Error("Q3 master/settings Browser writes are disabled");
}

export function assertBrowserMasterRead(): void {
  if (masterSettingsAuthority() === "server") throw new Error("Q3 master/settings Browser reads are disabled");
}

export async function dispatchMasterMutation<T>(
  authority: MasterSettingsAuthority,
  serverMutation: (() => Promise<T>) | undefined,
  browserMutation: () => Promise<T> | T,
): Promise<T> {
  if (authority === "frozen") throw new Error("Q3 master/settings writes are frozen");
  if (authority === "server") {
    if (!serverMutation) throw new Error("Q3 Server mutation channel is unavailable");
    return serverMutation();
  }
  if (authority === "browser") return browserMutation();
  throw new Error("Invalid Q3 master/settings authority configuration");
}

/** Frozen reads never invoke initialize(), which can seed or migrate localStorage. */
export function readFrozenBrowserMasterRecord(name: "basic-settings" | "quote-global-settings"): unknown {
  if (masterSettingsAuthority() !== "frozen") throw new Error("Frozen Q3 reader used outside maintenance mode");
  const key = browserLocalDataStore.key(name);
  const raw = browserLocalDataStore.getRawRecords()[key];
  if (!raw) throw new Error(`Frozen Q3 source record ${name} is missing`);
  let parsed: unknown;
  try { parsed = JSON.parse(raw) as unknown; } catch { throw new Error(`Frozen Q3 source record ${name} is invalid`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !("schemaVersion" in parsed) || !("data" in parsed)) {
    throw new Error(`Frozen Q3 source record ${name} is not an envelope`);
  }
  const record = parsed as { schemaVersion: unknown; data: unknown };
  if (!Number.isInteger(record.schemaVersion) || (record.schemaVersion as number) < 0 || (record.schemaVersion as number) > LOCAL_DATA_SCHEMA_VERSION) {
    throw new Error(`Frozen Q3 source record ${name} has an unsupported version`);
  }
  return record.data;
}

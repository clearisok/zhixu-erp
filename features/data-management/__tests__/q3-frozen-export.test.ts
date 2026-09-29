import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultBasicSettings } from "../../basic-settings/model/basic-settings.ts";
import { previewMasterSettingsBackup } from "../../basic-settings/server/master-settings-backup-preview.ts";
import { DEFAULT_PERMISSION_STATE } from "../../permissions/model/permissions.ts";
import { permissionRepository } from "../../permissions/repository/permission-repository.ts";
import { defaultGlobalQuoteSettings } from "../../quote-center/model/quote-settings.ts";
import { exportLocalDataBackup, initializeLocalDataLifecycle, resetAllLocalBusinessData,
  restoreValidatedLocalDataBackup, RESET_ALL_LOCAL_DATA_CONFIRMATION } from "../service/data-management-service.ts";
import { browserLocalDataStore, LOCAL_DATA_SCHEMA_VERSION } from "../repository/local-data-store.ts";

class TrackedStorage {
  private readonly values = new Map<string, string>();
  writes = 0;
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.writes++; this.values.set(key, value); }
  removeItem(key: string) { this.writes++; this.values.delete(key); }
}

test("frozen standard export preserves existing Q3 source without initialization or Browser writes", async () => {
  const priorWindow = globalThis.window;
  const priorInfo = (globalThis as typeof globalThis & { __ZHIXU_BUILD_INFO__?: unknown }).__ZHIXU_BUILD_INFO__;
  const storage = new TrackedStorage();
  const envelope = (data: unknown) => JSON.stringify({ schemaVersion: LOCAL_DATA_SCHEMA_VERSION,
    initializedAt: "2026-09-29T00:00:00.000Z", updatedAt: "2026-09-29T00:00:00.000Z", data });
  const basic = envelope(defaultBasicSettings);
  const global = envelope(defaultGlobalQuoteSettings);
  storage.setItem(browserLocalDataStore.key("basic-settings"), basic);
  storage.setItem(browserLocalDataStore.key("quote-global-settings"), global);
  storage.setItem(browserLocalDataStore.key("permission-state"), envelope(DEFAULT_PERMISSION_STATE));
  storage.writes = 0;
  (globalThis as typeof globalThis & { __ZHIXU_BUILD_INFO__?: unknown }).__ZHIXU_BUILD_INFO__ = { masterSettingsAuthority: "frozen" };
  Object.assign(globalThis, { window: { localStorage: storage, sessionStorage: new TrackedStorage(),
    indexedDB: globalThis.indexedDB, location: { origin: "http://127.0.0.1:3001", port: "3001", hostname: "127.0.0.1" } } });
  try {
    await initializeLocalDataLifecycle();
    assert.equal(storage.writes, 0);
    const permissions = permissionRepository.loadReadOnly();
    assert.equal(permissions.currentUserId, DEFAULT_PERMISSION_STATE.currentUserId);
    assert.equal(storage.writes, 0);
    const backup = await exportLocalDataBackup();
    assert.equal(backup.origin, "http://127.0.0.1:3001");
    assert.equal(backup.localRecords[browserLocalDataStore.key("basic-settings")], basic);
    assert.equal(backup.localRecords[browserLocalDataStore.key("quote-global-settings")], global);
    assert.equal(storage.writes, 0);
    const preview = await previewMasterSettingsBackup(backup);
    assert.equal(preview.preview.blockingErrors.length, 0);
    assert.equal(storage.writes, 0);
    await assert.rejects(restoreValidatedLocalDataBackup(backup), /Browser writes are disabled/u);
    await assert.rejects(resetAllLocalBusinessData(RESET_ALL_LOCAL_DATA_CONFIRMATION), /Browser writes are disabled/u);
    assert.equal(storage.writes, 0);
  } finally {
    Object.assign(globalThis, { window: priorWindow });
    (globalThis as typeof globalThis & { __ZHIXU_BUILD_INFO__?: unknown }).__ZHIXU_BUILD_INFO__ = priorInfo;
  }
});

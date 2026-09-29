import { DEFAULT_PERMISSION_STATE, PERMISSION_KEYS, type PermissionKey, type PermissionState } from "../model/permissions.ts";
import {
  browserLocalDataStore,
  LEGACY_LOCAL_DATA_KEYS,
  LOCAL_DATA_SCHEMA_VERSION,
  type LocalDataStore,
} from "../../data-management/repository/local-data-store.ts";

export const PERMISSION_STORAGE_NAME = "permission-state";
export const PERMISSION_RESET_CONFIRMATION = "RESET PERMISSIONS";

function normalize(input: unknown): PermissionState {
  if (!input || typeof input !== "object") return structuredClone(DEFAULT_PERMISSION_STATE);
  const candidate = input as Partial<PermissionState>;
  if (!Array.isArray(candidate.users) || !Array.isArray(candidate.roles)) return structuredClone(DEFAULT_PERMISSION_STATE);
  const knownPermissions = new Set<string>(PERMISSION_KEYS);
  const roles = candidate.roles.map((role) => ({
    ...role,
    permissions: role.id === "role-admin"
      ? [...PERMISSION_KEYS]
      : (role.permissions ?? []).filter((permission): permission is PermissionKey => knownPermissions.has(permission)),
  }));
  const fallbackUserId = candidate.users.some((user) => user.id === candidate.currentUserId) ? candidate.currentUserId! : DEFAULT_PERMISSION_STATE.currentUserId;
  return { schemaVersion: 1, currentUserId: fallbackUserId, users: candidate.users, roles };
}

export function createPermissionRepository(store: LocalDataStore = browserLocalDataStore) {
  return {
    loadReadOnly(): PermissionState {
      const key = store.key(PERMISSION_STORAGE_NAME);
      const raw = store.getRawRecords()[key];
      if (!raw) throw new Error("Frozen Browser permission record is missing");
      let parsed: unknown;
      try { parsed = JSON.parse(raw) as unknown; }
      catch { throw new Error("Frozen Browser permission record is invalid"); }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !("data" in parsed) || !("schemaVersion" in parsed) ||
        !Number.isInteger((parsed as { schemaVersion: unknown }).schemaVersion) ||
        (parsed as { schemaVersion: number }).schemaVersion < 0 ||
        (parsed as { schemaVersion: number }).schemaVersion > LOCAL_DATA_SCHEMA_VERSION) {
        throw new Error("Frozen Browser permission envelope is invalid");
      }
      const data = (parsed as { data: unknown }).data;
      if (!data || typeof data !== "object" || !Array.isArray((data as Partial<PermissionState>).users) ||
        !Array.isArray((data as Partial<PermissionState>).roles)) throw new Error("Frozen Browser permission data is invalid");
      return normalize(data);
    },
    load(): PermissionState {
      return normalize(store.initialize(PERMISSION_STORAGE_NAME, {
        seed: () => structuredClone(DEFAULT_PERMISSION_STATE),
        legacySources: typeof window === "undefined" ? [] : [{ key: LEGACY_LOCAL_DATA_KEYS.permissionState, storage: window.localStorage }],
        migrate: normalize,
      }));
    },
    save(state: PermissionState): PermissionState {
      const normalized = normalize(state);
      store.save(PERMISSION_STORAGE_NAME, normalized);
      return normalized;
    },
    reset(confirmation: string): PermissionState {
      if (confirmation !== PERMISSION_RESET_CONFIRMATION) throw new Error("恢复默认权限需要明确二次确认");
      const next = structuredClone(DEFAULT_PERMISSION_STATE);
      store.save(PERMISSION_STORAGE_NAME, next);
      return next;
    },
  };
}

export const permissionRepository = createPermissionRepository();

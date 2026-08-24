import { DEFAULT_PERMISSION_STATE, PERMISSION_KEYS, type PermissionKey, type PermissionState } from "../model/permissions";

const STORAGE_KEY = "zhixu.permission-state.v1";

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

export const permissionRepository = {
  load(): PermissionState {
    if (typeof window === "undefined") return structuredClone(DEFAULT_PERMISSION_STATE);
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? normalize(JSON.parse(raw)) : structuredClone(DEFAULT_PERMISSION_STATE);
    } catch {
      return structuredClone(DEFAULT_PERMISSION_STATE);
    }
  },
  save(state: PermissionState): PermissionState {
    const normalized = normalize(state);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  },
  reset(): PermissionState {
    const next = structuredClone(DEFAULT_PERMISSION_STATE);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  },
};

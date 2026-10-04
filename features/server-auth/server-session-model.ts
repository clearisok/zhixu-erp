import type { PermissionKey } from "../permissions/model/permissions";
import type { ServerSessionUser } from "./server-auth-client";
import type { BrowserIdentityMode } from "./identity-mode";

export type ServerSessionState =
  | { status: "checking"; user: null; permissions: readonly PermissionKey[]; error: null }
  | { status: "anonymous"; user: null; permissions: readonly PermissionKey[]; error: null }
  | { status: "authenticated"; user: ServerSessionUser; permissions: readonly PermissionKey[]; error: null }
  | { status: "error"; user: null; permissions: readonly PermissionKey[]; error: string };

export const checkingServerSession: ServerSessionState = {
  status: "checking",
  user: null,
  permissions: [],
  error: null,
};

export const anonymousServerSession: ServerSessionState = {
  status: "anonymous",
  user: null,
  permissions: [],
  error: null,
};

export function enforceIdentityMode(state: ServerSessionState, mode: BrowserIdentityMode): ServerSessionState {
  if (mode === "local-single-user" && state.status === "anonymous") {
    return { status: "error", user: null, permissions: [], error: "本地单用户身份不可用；请检查 Server 配置。" };
  }
  return state;
}

export function authenticatedServerSession(
  user: ServerSessionUser,
  permissions: readonly PermissionKey[],
): ServerSessionState {
  return { status: "authenticated", user, permissions: [...permissions], error: null };
}

export function serverSessionHasPermission(
  state: ServerSessionState,
  permission: PermissionKey,
): boolean {
  return state.status === "authenticated" && state.permissions.includes(permission);
}

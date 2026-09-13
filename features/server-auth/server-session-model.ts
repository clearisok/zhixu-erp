import type { PermissionKey } from "../permissions/model/permissions";
import type { ServerSessionUser } from "./server-auth-client";

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

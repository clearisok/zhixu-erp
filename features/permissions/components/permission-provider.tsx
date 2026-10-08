"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_PERMISSION_STATE, permissionsForUser, type PermissionKey, type PermissionState, type Role, type User } from "../model/permissions";
import { PERMISSION_RESET_CONFIRMATION, permissionRepository } from "../repository/permission-repository";
import { masterSettingsAuthority } from "../../basic-settings/authority/master-settings-authority";
import { browserIdentityMode } from "../../server-auth/identity-mode";
import { useServerSession } from "../../server-auth";

type PermissionContextValue = {
  state: PermissionState;
  currentUser: User;
  currentRole: Role;
  can: (permission: PermissionKey) => boolean;
  setCurrentUser: (userId: string) => void;
  saveState: (state: PermissionState) => void;
  resetState: () => void;
};

const PermissionContext = createContext<PermissionContextValue | null>(null);

export function TrustedPermissionProvider({ children }: { children: ReactNode }) {
  const session = useServerSession();
  const user: User = { id: session.user?.id ?? "anonymous", name: session.user?.name ?? "未登录", account: session.user?.username ?? "", roleId: "trusted-server", status: "active" };
  const role: Role = { id: "trusted-server", name: "Server", description: "Trusted permissions only", permissions: [...session.permissions] };
  const deny = () => { throw new Error("Browser permission writes disabled in Server Quote mode"); };
  return <PermissionContext.Provider value={{ state: { schemaVersion: 1, users: [user], roles: [role], currentUserId: user.id }, currentUser: user, currentRole: role, can: session.hasPermission, setCurrentUser: deny, saveState: deny, resetState: deny }}>{children}</PermissionContext.Provider>;
}

export function PermissionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PermissionState>(DEFAULT_PERMISSION_STATE);
  const [frozenPermissionsReady, setFrozenPermissionsReady] = useState(false);
  useEffect(() => { Promise.resolve().then(() => {
    setState(masterSettingsAuthority() === "frozen" || browserIdentityMode() === "local-single-user" ? permissionRepository.loadReadOnly() : permissionRepository.load());
    setFrozenPermissionsReady(true);
  }); }, []);
  const saveState = (next: PermissionState) => {
    if (browserIdentityMode() === "local-single-user") throw new Error("Browser user management is disabled in local single-user mode");
    if (masterSettingsAuthority() === "frozen") throw new Error("Frozen Browser permission writes are disabled");
    setState(permissionRepository.save(next));
  };
  const setCurrentUser = (userId: string) => {
    if (browserIdentityMode() === "local-single-user") return;
    if (!state.users.some((user) => user.id === userId && user.status === "active")) return;
    saveState({ ...state, currentUserId: userId });
  };
  const resetState = () => {
    if (browserIdentityMode() === "local-single-user") throw new Error("Browser user management is disabled in local single-user mode");
    if (masterSettingsAuthority() === "frozen") throw new Error("Frozen Browser permission writes are disabled");
    setState(permissionRepository.reset(PERMISSION_RESET_CONFIRMATION));
  };
  const currentUser = browserIdentityMode() === "local-single-user"
    ? DEFAULT_PERMISSION_STATE.users[0]
    : state.users.find((user) => user.id === state.currentUserId) ?? state.users[0] ?? DEFAULT_PERMISSION_STATE.users[0];
  const currentRole = state.roles.find((role) => role.id === currentUser.roleId) ?? state.roles[0] ?? DEFAULT_PERMISSION_STATE.roles[0];
  const permissionSet = useMemo(() => new Set(permissionsForUser(state, currentUser.id)), [currentUser.id, state]);
  return <PermissionContext.Provider value={{ state, currentUser, currentRole,
    can: (permission) => browserIdentityMode() === "local-single-user"
      ? (masterSettingsAuthority() !== "frozen" || frozenPermissionsReady)
      : (masterSettingsAuthority() !== "frozen" || frozenPermissionsReady) && permissionSet.has(permission),
    setCurrentUser, saveState, resetState }}>{children}</PermissionContext.Provider>;
}

export function usePermissions() {
  const context = useContext(PermissionContext);
  if (!context) throw new Error("usePermissions must be used within PermissionProvider");
  return context;
}

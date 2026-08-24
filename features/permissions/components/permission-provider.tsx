"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_PERMISSION_STATE, permissionsForUser, type PermissionKey, type PermissionState, type Role, type User } from "../model/permissions";
import { permissionRepository } from "../repository/permission-repository";

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

export function PermissionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PermissionState>(DEFAULT_PERMISSION_STATE);
  useEffect(() => { Promise.resolve().then(() => setState(permissionRepository.load())); }, []);
  const saveState = (next: PermissionState) => setState(permissionRepository.save(next));
  const setCurrentUser = (userId: string) => {
    if (!state.users.some((user) => user.id === userId && user.status === "active")) return;
    saveState({ ...state, currentUserId: userId });
  };
  const resetState = () => setState(permissionRepository.reset());
  const currentUser = state.users.find((user) => user.id === state.currentUserId) ?? state.users[0] ?? DEFAULT_PERMISSION_STATE.users[0];
  const currentRole = state.roles.find((role) => role.id === currentUser.roleId) ?? state.roles[0] ?? DEFAULT_PERMISSION_STATE.roles[0];
  const permissionSet = useMemo(() => new Set(permissionsForUser(state, currentUser.id)), [currentUser.id, state]);
  return <PermissionContext.Provider value={{ state, currentUser, currentRole, can: (permission) => permissionSet.has(permission), setCurrentUser, saveState, resetState }}>{children}</PermissionContext.Provider>;
}

export function usePermissions() {
  const context = useContext(PermissionContext);
  if (!context) throw new Error("usePermissions must be used within PermissionProvider");
  return context;
}

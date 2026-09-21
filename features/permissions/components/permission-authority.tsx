"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PermissionKey } from "../model/permissions";
import { usePermissions } from "./permission-provider";

type PermissionAuthority = (permission: PermissionKey) => boolean;

const ScopedPermissionAuthority = createContext<PermissionAuthority | null>(null);

/**
 * Overrides only permission decisions inside a bounded workspace. Legacy pages
 * keep the Browser PermissionProvider authority when no scoped provider exists.
 */
export function PermissionAuthorityProvider({ can, children }: { can: PermissionAuthority; children: ReactNode }) {
  return <ScopedPermissionAuthority.Provider value={can}>{children}</ScopedPermissionAuthority.Provider>;
}

export function usePermissionAuthority(): PermissionAuthority {
  const scoped = useContext(ScopedPermissionAuthority);
  const { can: browserCan } = usePermissions();
  return scoped ?? browserCan;
}

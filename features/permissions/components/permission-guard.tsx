"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/foundation";
import type { PermissionKey } from "../model/permissions";
import { usePermissions } from "./permission-provider";

export function PermissionGuard({ permission, children, fallback }: { permission: PermissionKey; children: ReactNode; fallback?: ReactNode }) {
  const { can } = usePermissions();
  if (can(permission)) return children;
  return fallback ?? <Card className="qc-permission-denied"><strong>暂无权限</strong><p>请联系管理员开通当前系统功能的访问权限。</p></Card>;
}

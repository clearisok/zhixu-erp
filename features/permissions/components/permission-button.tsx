"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/foundation/button";
import type { PermissionKey } from "../model/permissions";

export const PERMISSION_DENIED_MESSAGE = "暂无权限，请联系管理员";

export function PermissionButton({ permission, disabled, ...props }: ComponentProps<typeof Button> & { permission: PermissionKey }) {
  return <Button {...props} permission={permission} disabled={disabled} />;
}

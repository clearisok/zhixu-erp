import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormSubmitting } from "./form-shell";
import { usePermissions } from "@/features/permissions/components/permission-provider";
import type { PermissionKey } from "@/features/permissions/model/permissions";

export function Button({ variant = "primary", children, className = "", type = "button", disabled, permission, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "text" | "danger"; children: ReactNode; permission?: PermissionKey }) {
  const submitting = useFormSubmitting();
  const { can } = usePermissions();
  const denied = permission ? !can(permission) : false;
  const button = <button type={type} disabled={disabled || denied || (type === "submit" && submitting)} aria-disabled={disabled || denied || undefined} className={`qc-button qc-button-${variant} ${className}`.trim()} {...props}>{children}</button>;
  return denied ? <span className="qc-permission-disabled" title="暂无权限，请联系管理员" data-tooltip="暂无权限，请联系管理员">{button}</span> : button;
}

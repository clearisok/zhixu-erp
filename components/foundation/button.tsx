"use client";

import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useFormSubmitting } from "./form-shell";
import { Modal } from "./modal";
import { usePermissionAuthority } from "@/features/permissions/components/permission-authority";
import type { PermissionKey } from "@/features/permissions/model/permissions";

export function Button({ variant = "primary", size = "normal", iconOnly = false, children, className = "", type = "button", disabled, permission, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "tertiary" | "text" | "danger"; size?: "compact" | "normal" | "touch"; iconOnly?: boolean; children: ReactNode; permission?: PermissionKey }) {
  const submitting = useFormSubmitting();
  const can = usePermissionAuthority();
  const reasonId = useId();
  const [reasonOpen, setReasonOpen] = useState(false);
  const denied = permission ? !can(permission) : false;
  const describedBy = [props["aria-describedby"], denied ? reasonId : undefined].filter(Boolean).join(" ") || undefined;
  const button = <button type={type} disabled={disabled || denied || (type === "submit" && submitting)} aria-disabled={disabled || denied || undefined} className={`qc-button qc-button-${variant} qc-button-${size} ${iconOnly ? "qc-icon-button" : ""} ${className}`.trim()} {...props} aria-describedby={describedBy}>{children}</button>;
  return denied ? <span className="qc-permission-disabled" onClick={(event) => event.stopPropagation()}>
    {button}
    <span id={reasonId} className="sr-only">暂无权限，请联系管理员</span>
    <button type="button" className="qc-button qc-button-text qc-button-compact" aria-label="查看操作权限说明" aria-haspopup="dialog" aria-expanded={reasonOpen}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") event.stopPropagation(); }}
      onClick={(event) => { event.stopPropagation(); setReasonOpen(true); }}><span aria-hidden="true">ⓘ</span> 无权限</button>
    <Modal open={reasonOpen} title="操作权限" onClose={() => setReasonOpen(false)}><p>暂无权限，请联系管理员。</p></Modal>
  </span> : button;
}

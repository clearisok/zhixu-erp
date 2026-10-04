"use client";

import { Button } from "@/components/foundation";
import { browserIdentityMode } from "../identity-mode";

export function ServerLogoutAction({ onLogout, variant = "text" }: {
  onLogout: () => void;
  variant?: "text" | "secondary";
}) {
  if (browserIdentityMode() === "local-single-user") return null;
  return <Button variant={variant} onClick={onLogout}>退出 Server 会话</Button>;
}

"use client";

import { createPortal } from "react-dom";

export function Toast({ message }: { message: string }) {
  if (!message) return null;
  if (typeof document === "undefined") return null;
  return createPortal(<div className="qc-toast qc-foundation-portal" role="status" aria-live="polite"><span>✓</span>{message}</div>, document.body);
}

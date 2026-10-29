"use client";
import { quoteAuthority } from "@/features/quote-center/authority/quote-authority";
import { ClosingCenterPage } from "./closing-center-page";
import { ServerClosingAdjustmentPage } from "./server-closing-adjustment-page";
/** Select authority before mounting any legacy Browser repository hooks. */
export function ClosingAuthorityPage({ detail = false }: { detail?: boolean }) {
  return quoteAuthority() === "server" ? <ServerClosingAdjustmentPage /> : <ClosingCenterPage detail={detail} />;
}

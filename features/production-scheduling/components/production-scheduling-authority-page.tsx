"use client";
import { quoteAuthority } from "@/features/quote-center/authority/quote-authority";
import { ProductionSchedulingPage } from "./production-scheduling-page";
import { ServerProductionSchedulingPage } from "./server-production-scheduling-page";

/** Select the data owner before mounting; Server never mounts a Browser repository hook. */
export function ProductionSchedulingAuthorityPage() {
  return quoteAuthority() === "server" ? <ServerProductionSchedulingPage /> : <ProductionSchedulingPage />;
}

"use client";
import { quoteAuthority } from "@/features/quote-center/authority/quote-authority";
import { OutsourceFactorySettingsPage, ProductionGroupSettingsPage, ProductionInfrastructureSettingsPage } from "./operations-settings-pages";
import { ServerProductionInfrastructureSettingsPage, ServerProductionResourceSettingsPage } from "./server-production-resource-page";

/** Select the owner before mounting a page. Server never mounts the Browser repository hook. */
export function ProductionResourceSettingsPage({ kind }: { kind: "groups" | "factories" }) {
  if (quoteAuthority() === "server") return <ServerProductionResourceSettingsPage kind={kind} />;
  return kind === "groups" ? <ProductionGroupSettingsPage /> : <OutsourceFactorySettingsPage />;
}
export function ProductionInfrastructureAuthorityPage() {
  return quoteAuthority() === "server" ? <ServerProductionInfrastructureSettingsPage /> : <ProductionInfrastructureSettingsPage />;
}

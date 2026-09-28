"use client";

import type { ReactNode } from "react";
import { AlertBanner } from "@/components/foundation";
import { PermissionAuthorityProvider, usePermissionAuthority } from "@/features/permissions";
import type { PermissionKey } from "@/features/permissions/model/permissions";
import { masterSettingsAuthority } from "../authority/master-settings-authority";
import { BrandSettingsPage, CustomerSalespeopleSettingsPage, FabricLibraryPage, TrimLibraryPage } from "./basic-settings-pages";
import { ServerBasicSettingsCandidatePage, ServerGlobalQuoteSettingsCandidatePage } from "./server-basic-settings-candidate-page";
import type { BasicSettingsServerScope } from "../server/server-basic-settings-adapter";
import { GlobalQuoteSettingsPage } from "@/features/quote-center/components/global-quote-settings-page";

const q3WritePermissions = new Set<PermissionKey>([
  "settings.brand.edit", "settings.salesperson.edit", "settings.fabric.edit", "settings.trim.edit", "settings.global.edit",
]);

function FrozenAuthority({ children }: { children: ReactNode }) {
  const can = usePermissionAuthority();
  return <PermissionAuthorityProvider can={(permission) => !q3WritePermissions.has(permission) && can(permission)}>
    <AlertBanner tone="warning" title="迁移维护中 · 基础资料只读">当前 Browser 资料可查看，新增、编辑与保存已暂停。</AlertBanner>
    {children}
  </PermissionAuthorityProvider>;
}

function BrowserBasicSettings({ scope }: { scope: BasicSettingsServerScope }) {
  if (scope === "brands") return <BrandSettingsPage />;
  if (scope === "salespeople") return <CustomerSalespeopleSettingsPage />;
  if (scope === "fabrics") return <FabricLibraryPage />;
  return <TrimLibraryPage />;
}

export function ProductionBasicSettingsPage({ scope }: { scope: BasicSettingsServerScope }) {
  const authority = masterSettingsAuthority();
  if (authority === "server") return <ServerBasicSettingsCandidatePage scope={scope} />;
  if (authority === "frozen") return <FrozenAuthority><BrowserBasicSettings scope={scope} /></FrozenAuthority>;
  return <BrowserBasicSettings scope={scope} />;
}

export function ProductionGlobalQuoteSettingsPage() {
  const authority = masterSettingsAuthority();
  if (authority === "server") return <ServerGlobalQuoteSettingsCandidatePage />;
  if (authority === "frozen") return <FrozenAuthority><GlobalQuoteSettingsPage /></FrozenAuthority>;
  return <GlobalQuoteSettingsPage />;
}

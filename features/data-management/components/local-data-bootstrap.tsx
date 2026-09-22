"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { initializeLocalDataLifecycle } from "../service/data-management-service";

export function shouldInitializeBrowserLocalData(pathname: string): boolean {
  return pathname !== "/order-center"
    && pathname !== "/order-center/server-preview"
    && pathname !== "/order-center/server-detail"
    && pathname !== "/quote-center/server-preview"
    && pathname !== "/quote-center/server-detail"
    && pathname !== "/quote-center/server-edit"
    && pathname !== "/quote-center/server-new"
    && pathname !== "/basic-settings/server/brands"
    && pathname !== "/basic-settings/server/customer-salespeople"
    && pathname !== "/basic-settings/server/fabrics"
    && pathname !== "/basic-settings/server/trims"
    && pathname !== "/system-settings/server/quote-settings";
}

export function LocalDataBootstrap({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  useEffect(() => {
    if (!shouldInitializeBrowserLocalData(pathname)) return;
    void initializeLocalDataLifecycle().catch((error) => {
      console.error("织序 ERP 本地数据初始化失败。为保护现有数据，系统未执行 Seed 覆盖。", error);
    });
  }, [pathname]);
  return children;
}

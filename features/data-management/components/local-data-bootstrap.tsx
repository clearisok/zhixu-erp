"use client";

import { useEffect, type ReactNode } from "react";
import { initializeLocalDataLifecycle } from "../service/data-management-service";

export function LocalDataBootstrap({ children }: { children: ReactNode }) {
  useEffect(() => {
    void initializeLocalDataLifecycle().catch((error) => {
      console.error("织序 ERP 本地数据初始化失败。为保护现有数据，系统未执行 Seed 覆盖。", error);
    });
  }, []);
  return children;
}

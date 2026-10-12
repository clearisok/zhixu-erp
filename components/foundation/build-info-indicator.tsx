"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { buildInfo } from "../../features/runtime/build-info";

export function BuildInfoIndicator() {
  const path = usePathname();
  useEffect(() => {
    console.info([
      "织序ERP",
      `Environment: ${buildInfo.environment}`,
      `Build ID: ${buildInfo.buildId}`,
      `Git Commit: ${buildInfo.gitCommit}`,
      `Build Time: ${buildInfo.buildTime}`,
    ].join("\n"));
  }, []);

  if (path === "/login") return null;
  const environmentLabel = buildInfo.environment === "development" ? "DEV" : "PROD";
  return <output
    className="zhixu-build-indicator"
    aria-label={`当前运行版本：${environmentLabel}，提交 ${buildInfo.gitCommit}，构建 ${buildInfo.buildId}`}
    title={`${environmentLabel} · ${buildInfo.buildId} · ${buildInfo.buildTime}`}
  >
    {environmentLabel} · {buildInfo.gitCommit}
  </output>;
}

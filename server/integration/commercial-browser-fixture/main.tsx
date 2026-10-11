import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ServerSessionProvider, useServerSession } from "@/features/server-auth";
import { TrustedPermissionProvider } from "@/features/permissions/components/permission-provider";
import { ServerSalesOrderDetailPage } from "@/features/order-center/components/server-sales-order-detail-page";
import "@/app/globals.css";
import "@/app/quote-center/quote-center.css";
import "@/app/order-center/order-center.css";
import "@/app/order-center/style-progress/style-progress.css";
import "@/app/foundation.css";
declare global { interface Window { __commercialRegression?: { refresh: () => Promise<void> }; } }
// Isolated test bridge calls the real trusted session restore; never injects an identity or grant.
function SessionRegressionBridge() {
  const { refresh } = useServerSession();
  useEffect(() => { window.__commercialRegression = { refresh }; return () => { delete window.__commercialRegression; }; }, [refresh]);
  return null;
}
createRoot(document.getElementById("root")!).render(<ServerSessionProvider><TrustedPermissionProvider><SessionRegressionBridge/><ServerSalesOrderDetailPage/></TrustedPermissionProvider></ServerSessionProvider>);

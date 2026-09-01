import type { Metadata } from "next";
import { BuildInfoIndicator } from "../components/foundation/build-info-indicator";
import { buildInfo } from "../features/runtime/build-info";
import { PermissionProvider } from "../features/permissions";
import { LocalDataBootstrap } from "../features/data-management";
import "./globals.css";
import "./quote-center/quote-center.css";
import "./order-center/order-center.css";
import "./production-scheduling/production-scheduling.css";
import "./closing-center/closing-center.css";
import "./ainuoke-sync/ainuoke-sync.css";
import "./order-center/style-progress/style-progress.css";
import "./foundation.css";

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: "织序 ZHIXU｜成衣报价、订单协同与生产排单",
  description: "面向服装工厂的成衣报价、订单跟踪和产线排单协同系统。",
  openGraph: {
    title: "织序 ZHIXU｜工厂协同工作台",
    description: "成衣报价 · 订单协同 · 智能排单",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "织序工厂协同工作台" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "织序 ZHIXU｜工厂协同工作台",
    description: "成衣报价 · 订单协同 · 智能排单",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body data-build-id={buildInfo.buildId} data-environment={buildInfo.environment}><LocalDataBootstrap><PermissionProvider>{children}</PermissionProvider></LocalDataBootstrap><BuildInfoIndicator /></body></html>;
}

import { siteMetadata } from "../features/runtime/site-metadata";
import type { Metadata } from "next";
import Script from "next/script";
import { serverNavigationHistoryScript } from "../components/foundation/server-navigation-history";
import { BuildInfoIndicator } from "../components/foundation/build-info-indicator";
import { buildInfo } from "../features/runtime/build-info";
import { ServerSessionProvider } from "../features/server-auth";
import { LocalDataBootstrap } from "../features/data-management";
import { QuoteServerBoundary } from "../features/quote-center/components/quote-server-boundary";
import "./globals.css";
import "./quote-center/quote-center.css";
import "./order-center/order-center.css";
import "./production-scheduling/production-scheduling.css";
import "./closing-center/closing-center.css";
import "./ainuoke-sync/ainuoke-sync.css";
import "./order-center/style-progress/style-progress.css";
import "./foundation.css";

const site = siteMetadata(process.env.NEXT_PUBLIC_SITE_URL, process.env.NEXT_PUBLIC_SITE_ENV);

export const metadata: Metadata = {
  metadataBase: site.base,
  robots: site.robots,
  title: "织序 ZHIXU｜成衣报价、订单协同与生产排单",
  description: "面向服装工厂的成衣报价、订单跟踪和产线排单协同系统。",
  openGraph: {
    title: "织序 ZHIXU｜工厂协同工作台",
    description: "成衣报价 · 订单协同 · 智能排单",
    type: "website",
    images: site.image ? [{ url: site.image, width: 1200, height: 630, alt: "织序工厂协同工作台" }] : [],
  },
  twitter: {
    card: "summary_large_image",
    title: "织序 ZHIXU｜工厂协同工作台",
    description: "成衣报价 · 订单协同 · 智能排单",
    images: site.image ? [site.image] : [],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Keep the tab icon relative to the serving origin; metadataBase is not the runtime host.
  return <html lang="zh-CN"><head><link rel="icon" href="/branding/weaveops-mark-64.png" type="image/png" sizes="64x64" /></head><body data-build-id={buildInfo.buildId} data-environment={buildInfo.environment}>{buildInfo.quoteAuthority === "server" && <Script id="zhixu-workspace-history" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: serverNavigationHistoryScript }} />}<ServerSessionProvider><LocalDataBootstrap><QuoteServerBoundary>{children}</QuoteServerBoundary></LocalDataBootstrap></ServerSessionProvider><BuildInfoIndicator /></body></html>;
}

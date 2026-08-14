import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") || incoming.get("host") || "localhost:5173";
  const protocol = incoming.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  return {
    metadataBase: new URL(origin),
    title: "织序 ZHIXU｜成衣报价、订单协同与生产排单",
    description: "面向服装工厂的成衣报价、订单跟踪和产线排单协同系统。",
    openGraph: {
      title: "织序 ZHIXU｜工厂协同工作台",
      description: "成衣报价 · 订单协同 · 智能排单",
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1200, height: 630, alt: "织序工厂协同工作台" }],
    },
    twitter: { card: "summary_large_image", title: "织序 ZHIXU｜工厂协同工作台", description: "成衣报价 · 订单协同 · 智能排单", images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}

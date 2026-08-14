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
    title: "纫造 ERP｜服装报价工作台",
    description: "面向服装企业的专业成衣报价、成本核算与利润试算工作台。",
    openGraph: {
      title: "纫造 ERP｜服装报价工作台",
      description: "从物料用量、加工成本到目标毛利，一站式完成成衣报价。",
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1200, height: 630, alt: "纫造 ERP 服装报价工作台" }],
    },
    twitter: { card: "summary_large_image", title: "纫造 ERP｜服装报价工作台", description: "服装成本核算与智能报价", images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}

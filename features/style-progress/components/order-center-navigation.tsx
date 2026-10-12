"use client";
import { quoteAuthority, isEnabledServerRoute } from "@/features/quote-center/authority/quote-authority";

import { usePathname, useRouter } from "next/navigation";

const items = [
  { label: "订单列表", href: "/order-center", matches: (path: string) => path === "/order-center" || path === "/order-center/detail" || path === "/order-center/new" || path === "/order-center/server-detail" },
  { label: "款式进度", href: "/order-center/style-progress", matches: (path: string) => path.startsWith("/order-center/style-progress") },
  { label: "风险预警", href: "/order-center/risks", matches: (path: string) => path.startsWith("/order-center/risks") },
];

export function OrderCenterNavigation() {
  const pathname = usePathname(); const router = useRouter();
  return <nav className="sp-order-nav" aria-label="订单中心功能导航">{items.map((item) => <button key={item.href} type="button" disabled={quoteAuthority()==="server"&&!isEnabledServerRoute(item.href)} title={quoteAuthority()==="server"&&!isEnabledServerRoute(item.href)?"此功能尚未接通":undefined} className={item.matches(pathname) ? "active" : ""} aria-current={item.matches(pathname) ? "page" : undefined} onClick={() => router.push(item.href)}>{item.label}</button>)}</nav>;
}

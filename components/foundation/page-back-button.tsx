"use client";

import { useProtectedRouter as useRouter } from "./server-navigation-protection";

export function PageBackButton({ fallbackHref, label = "返回", onRequestNavigation }: { fallbackHref: string; label?: string; onRequestNavigation?: (target:string)=>void }) {
  const router = useRouter();
  return <button type="button" className="qc-page-back-button" aria-label={label} onClick={() => onRequestNavigation ? onRequestNavigation(fallbackHref) : router.push(fallbackHref)}><span aria-hidden="true">←</span><span>{label}</span></button>;
}

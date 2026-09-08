"use client";

import { useRouter } from "next/navigation";

export function PageBackButton({ fallbackHref, label = "返回" }: { fallbackHref: string; label?: string }) {
  const router = useRouter();
  return <button type="button" className="qc-page-back-button" aria-label={label} onClick={() => router.push(fallbackHref)}><span aria-hidden="true">←</span><span>{label}</span></button>;
}

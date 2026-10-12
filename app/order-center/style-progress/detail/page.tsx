"use client";
import { useSearchParams } from 'next/navigation';
import { StyleProgressDetailPage } from '@/features/style-progress/components/style-progress-pages';
import { ServerStyleProgressDetailPage } from '@/features/style-progress/components/style-progress-server-page';
import { quoteAuthority } from '@/features/quote-center/authority/quote-authority';
export default function Page() {
  const params=useSearchParams();
  if(quoteAuthority()==='server'||params.has('orderId')) {
    // Explicit build capability and trusted session gate own Server entry; no Browser fallback.
    if(quoteAuthority()!=='server') return <p>正式物料页面尚未开放；不会读取 Browser 订单。</p>;
    return <ServerStyleProgressDetailPage/>;
  }
  return <StyleProgressDetailPage/>;
}

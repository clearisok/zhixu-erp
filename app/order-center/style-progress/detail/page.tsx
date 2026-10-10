"use client";
import { useSearchParams } from 'next/navigation';
import { StyleProgressDetailPage } from '@/features/style-progress/components/style-progress-pages';
import { ServerStyleProgressDetailPage } from '@/features/style-progress/components/style-progress-server-page';
import { quoteAuthority } from '@/features/quote-center/authority/quote-authority';
export default function Page() {
  const params=useSearchParams();
  if(params.has('orderId')) {
    // Server Quote global route gate still blocks this route until separately approved.
    if(quoteAuthority()!=='server') return <p>正式物料页面尚未开放；不会读取 Browser 订单。</p>;
    return <ServerStyleProgressDetailPage/>;
  }
  return <StyleProgressDetailPage/>;
}

"use client";
import { useEffect, useRef, useState } from "react";
import type { ListImageLoader } from "../server/list-image-loader";
import type { QuoteServerListItem } from "../server/quote-server-client";

export function ServerListThumbnail({ row, loader }: { row: QuoteServerListItem; loader?: ListImageLoader }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [result, setResult] = useState<{ key: string; url: string | null } | null>(null);
  const image = row.styleImage;
  const key = JSON.stringify([row.id, row.defaultRevisionId, image?.attachmentId, image?.sha256]);
  useEffect(() => {
    if (!loader || !image || !ref.current) return;
    let release: (() => void) | undefined;
    const observer = new IntersectionObserver(items => {
      if (!release && items.some(item => item.isIntersecting)) {
        release = loader.acquire({ quoteId: row.id, revisionId: row.defaultRevisionId, image }, url => setResult({ key, url }));
        observer.disconnect();
      }
    });
    observer.observe(ref.current);
    return () => { observer.disconnect(); release?.(); };
  }, [loader, key, row.id, row.defaultRevisionId, image]);
  const url = result?.key === key ? result.url : null;
  const label = !image ? "未设置款式图" : result?.key === key && !url ? "款式图不可用" : "款式图加载中";
  // Authorized in-memory Blob, never a public image-proxy URL.
  // eslint-disable-next-line @next/next/no-img-element
  return <span ref={ref} className="qc-quote-list-thumbnail" title={url ? "款式图" : label}>{url ? <img src={url} alt="款式图" width={48} height={48} onError={() => setResult({ key, url: null })} /> : <span role="img" aria-label={label}>◇</span>}</span>;
}

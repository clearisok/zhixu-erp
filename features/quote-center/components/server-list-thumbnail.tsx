"use client";
import { useEffect, useRef, useState } from "react";
import type { ListImageLoader } from "../server/list-image-loader";
import type { ListImageFailure } from "../server/list-image-policy";
import type { QuoteServerListItem } from "../server/quote-server-client";

export function ServerListThumbnail({ row, loader }: { row: QuoteServerListItem; loader?: ListImageLoader }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [result, setResult] = useState<{ key: string; url: string | null; reason?: ListImageFailure } | null>(null);
  const image = row.styleImage;
  const key = JSON.stringify([row.id, row.defaultRevisionId, image?.attachmentId, image?.sha256]);
  useEffect(() => {
    if (!loader || !image || !ref.current) return;
    let release: (() => void) | undefined;
    const observer = new IntersectionObserver(items => {
      const visible = items.at(-1)?.isIntersecting === true && (items.at(-1)?.intersectionRatio ?? 0) > 0;
      if (visible && !release) {
        release = loader.acquire({ quoteId: row.id, revisionId: row.defaultRevisionId, image }, (url, reason) => setResult({ key, url, reason }));
      } else if (!visible && release) {
        release(); release = undefined;
        setResult(null);
      }
    });
    observer.observe(ref.current);
    return () => { observer.disconnect(); release?.(); };
  }, [loader, key, row.id, row.defaultRevisionId, image]);
  const url = result?.key === key ? result.url : null;
  const label = !image ? "未设置款式图" : result?.key === key && !url ? result.reason === "too_large" ? "原图较大，请在报价详情查看" : result.reason === "budget" ? "列表图片资源受限，请在报价详情查看" : "款式图不可用" : "款式图加载中";
  // Authorized in-memory Blob, never a public image-proxy URL.
  // eslint-disable-next-line @next/next/no-img-element
  return <span ref={ref} className="qc-quote-list-thumbnail" title={url ? "款式图" : label}>{url ? <img src={url} alt="款式图" width={48} height={48} onError={() => setResult({ key, url: null })} /> : <span role="img" aria-label={label}>◇</span>}</span>;
}

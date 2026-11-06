/** Public URL only; never infer a deployment origin from localhost. */
export function siteMetadata(siteUrl?: string, environment?: string) {
  let base: URL | undefined;
  if (siteUrl) {
    base = new URL(siteUrl);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") {
      throw new Error("NEXT_PUBLIC_SITE_URL must be an absolute HTTPS origin without credentials, path or query");
    }
  }
  const staging = !base || environment !== "production" || /(^|\.)staging\./i.test(base.hostname);
  return {
    base,
    image: base ? new URL("/og.png", base).href : undefined,
    robots: staging ? { index: false, follow: false } : { index: true, follow: true },
  };
}

/** Only return to an internal page; never an API, asset, or another login URL. */
export function safeLoginReturnTo(value: string | null | undefined): string {
  const fallback = "/quote-center";
  if (!value || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/u.test(value)) return fallback;
  try {
    const url = new URL(value, "https://zhixu.invalid");
    const decoded = decodeURIComponent(url.pathname);
    if (url.origin !== "https://zhixu.invalid" || /[\\\u0000-\u0020\u007f%]/u.test(decoded) || decoded.startsWith("//")) return fallback;
    if (/^\/(?:login|api|assets)(?:\/|$)/iu.test(decoded) || /\.[a-z0-9]+$/iu.test(decoded)) return fallback;
    return url.pathname + url.search + url.hash;
  } catch { return fallback; }
}

export function loginHref(returnTo: string): string {
  return "/login?returnTo=" + encodeURIComponent(safeLoginReturnTo(returnTo));
}

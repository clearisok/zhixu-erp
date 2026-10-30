/** Viewports reuse the user's unmodified logo, including its original wordmark. */
export function WeaveOpsBrand() {
  return <div className="ops-brand ops-weaveops-brand">
    <svg className="ops-brand-full" viewBox="84 188 1084 918" role="img" aria-label="WeaveOps 织序">
      <image href="/branding/weaveops-original.png" width="1254" height="1254" />
    </svg>
    <svg className="ops-brand-mark" viewBox="296 188 660 660" role="img" aria-label="WeaveOps 织序">
      <image href="/branding/weaveops-original.png" width="1254" height="1254" />
    </svg>
  </div>;
}

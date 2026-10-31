"use client";

import { useEffect, useState, type ComponentType } from "react";
import { Button } from "./button";
import { LoadingState } from "./states";

/** Only module loading is deferred; mounting and business commands remain feature-owned. */
export function DeferredModule<P extends object>({ load, componentProps, label, onCancel }: {
  load: () => Promise<{ default: ComponentType<P> }>;
  componentProps: P;
  label: string;
  onCancel?: () => void;
}) {
  const [result, setResult] = useState<{ load: typeof load; component?: ComponentType<P>; failed?: boolean }>();
  useEffect(() => {
    let active = true;
    void load().then(module => {
      if (active) setResult({ load, component: module.default });
    }, () => { if (active) setResult({ load, failed: true }); });
    return () => { active = false; };
  }, [load]);
  const Component = result?.load === load ? result.component : undefined;
  if (Component) return <Component {...componentProps} />;
  return <div role="status">
    {result?.load === load && result.failed
      ? <p>功能加载失败，请关闭后刷新页面再试。尚未打开操作窗口。</p>
      : <LoadingState label={label} />}
    {onCancel && <Button variant="secondary" onClick={onCancel}>取消打开</Button>}
  </div>;
}

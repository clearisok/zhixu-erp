"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/foundation";
import type { PermissionKey } from "@/features/permissions";
import { QuoteQuickNavigation, type QuoteQuickNavigationItem } from "./quote-quick-navigation";
import { resolveQuoteActionBarMode, type QuoteActionBarMode, type QuoteActionRequiredWidths } from "./quote-action-layout";

export type { QuoteActionBarMode } from "./quote-action-layout";

export type QuoteActionDescriptor = {
  id: string;
  label: ReactNode;
  onClick: () => void;
  permission?: PermissionKey;
  variant?: "primary" | "secondary" | "text" | "danger";
  menuVariant?: "primary" | "secondary" | "text" | "danger";
};

type QuoteActionBarProps = {
  leadingAction: QuoteActionDescriptor;
  actions: QuoteActionDescriptor[];
  primaryAction?: QuoteActionDescriptor;
  quickNavigationItems: QuoteQuickNavigationItem[];
  className?: string;
  onModeChange?: (mode: QuoteActionBarMode) => void;
};

function ActionButton({ action, inMenu = false, onAfterClick }: {
  action: QuoteActionDescriptor;
  inMenu?: boolean;
  onAfterClick?: () => void;
}) {
  const variant = inMenu ? action.menuVariant ?? (action.variant === "danger" ? "danger" : "text") : action.variant ?? "secondary";
  return <Button
    permission={action.permission}
    variant={variant}
    onClick={() => {
      onAfterClick?.();
      action.onClick();
    }}
  >{action.label}</Button>;
}

function ActionProbe({ action, variant = action.variant ?? "secondary" }: {
  action: QuoteActionDescriptor;
  variant?: QuoteActionDescriptor["variant"];
}) {
  return <span className={`qc-button qc-button-${variant}`} aria-hidden="true">{action.label}</span>;
}

export function QuoteActionBar({
  leadingAction,
  actions,
  primaryAction,
  quickNavigationItems,
  className = "",
  onModeChange,
}: QuoteActionBarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const probeRefs = useRef<Record<QuoteActionBarMode, HTMLDivElement | null>>({
    full: null,
    "compact-navigation": null,
    compact: null,
    minimal: null,
  });
  const [mode, setMode] = useState<QuoteActionBarMode>("compact");
  const [measured, setMeasured] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const measure = useCallback(() => {
    const availableWidth = rootRef.current?.getBoundingClientRect().width ?? 0;
    if (!availableWidth) return;
    const required = Object.fromEntries(
      (Object.keys(probeRefs.current) as QuoteActionBarMode[]).map((key) => [
        key,
        Math.ceil(probeRefs.current[key]?.getBoundingClientRect().width ?? Number.POSITIVE_INFINITY),
      ]),
    ) as QuoteActionRequiredWidths;
    const nextMode = resolveQuoteActionBarMode(availableWidth, required);
    setMode((current) => current === nextMode ? current : nextMode);
    setMeasured(true);
    onModeChange?.(nextMode);
  }, [onModeChange]);

  useLayoutEffect(() => {
    measure();
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    Object.values(probeRefs.current).forEach((probe) => { if (probe) observer.observe(probe); });
    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    if (!moreOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) detailsRef.current?.removeAttribute("open");
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") detailsRef.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreOpen]);

  const closeMore = () => detailsRef.current?.removeAttribute("open");
  const showNavigation = mode === "compact-navigation";
  const showPrimary = mode !== "minimal" && primaryAction;
  const hasMore = actions.length > 0;

  return <div
    ref={rootRef}
    className={`qc-quote-action-region ${measured ? "is-measured" : "is-measuring"} ${className}`.trim()}
    data-action-mode={mode}
  >
    <div className="qc-quote-action-visible">
      <ActionButton action={leadingAction} />
      {mode === "full" && actions.map((action) => <ActionButton key={action.id} action={action} />)}
      {mode !== "full" && hasMore && <details ref={detailsRef} className="qc-secondary-actions qc-quote-action-more" onToggle={(event) => setMoreOpen(event.currentTarget.open)}>
        <summary>更多</summary>
        <div>{actions.map((action) => <ActionButton key={action.id} action={action} inMenu onAfterClick={closeMore} />)}</div>
      </details>}
      {showPrimary && <ActionButton action={primaryAction} />}
      {showNavigation && <QuoteQuickNavigation items={quickNavigationItems} presentation="dropdown" />}
    </div>

    <div className="qc-quote-action-probes" aria-hidden="true">
      <div ref={(node) => { probeRefs.current.full = node; }} className="qc-quote-action-probe">
        <ActionProbe action={leadingAction} />
        {actions.map((action) => <ActionProbe key={action.id} action={action} />)}
        {primaryAction && <ActionProbe action={primaryAction} />}
      </div>
      <div ref={(node) => { probeRefs.current["compact-navigation"] = node; }} className="qc-quote-action-probe">
        <ActionProbe action={leadingAction} />
        {hasMore && <span className="qc-secondary-actions"><span className="qc-action-probe-summary">更多</span></span>}
        {primaryAction && <ActionProbe action={primaryAction} />}
        <span className="qc-action-probe-navigation">快速导航⌄</span>
      </div>
      <div ref={(node) => { probeRefs.current.compact = node; }} className="qc-quote-action-probe">
        <ActionProbe action={leadingAction} />
        {hasMore && <span className="qc-secondary-actions"><span className="qc-action-probe-summary">更多</span></span>}
        {primaryAction && <ActionProbe action={primaryAction} />}
      </div>
      <div ref={(node) => { probeRefs.current.minimal = node; }} className="qc-quote-action-probe">
        <ActionProbe action={leadingAction} />
        {hasMore && <span className="qc-secondary-actions"><span className="qc-action-probe-summary">更多</span></span>}
      </div>
    </div>
  </div>;
}

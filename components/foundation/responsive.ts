"use client";

import { useLayoutEffect, useState } from "react";

export const MOBILE_WIDTH = 600;
export const PRIMARY_WIDTH = 1100;
export const WIDE_WIDTH = 1440;

/** @deprecated Use PRIMARY_WIDTH. Kept for callers that still describe the touch range as tablet. */
export const TABLET_WIDTH = PRIMARY_WIDTH;
/** @deprecated Use WIDE_WIDTH. Kept to preserve the existing public Foundation API. */
export const COMPACT_WIDTH = WIDE_WIDTH;

export const HOVER_MEDIA = "(hover: hover)";
export const FINE_POINTER_MEDIA = "(pointer: fine)";
export const COARSE_POINTER_MEDIA = "(pointer: coarse)";

export type ResponsiveMode = "wide" | "primary" | "compact" | "tablet" | "mobile";

export interface ResponsiveEnvironment {
  width: number;
  hasHover: boolean;
  hasFinePointer: boolean;
  hasCoarsePointer: boolean;
}

export function isTrueMobile(environment: ResponsiveEnvironment) {
  return environment.width < MOBILE_WIDTH;
}

export function isTablet(environment: ResponsiveEnvironment) {
  return environment.width >= MOBILE_WIDTH
    && environment.width < PRIMARY_WIDTH
    && !environment.hasHover
    && environment.hasCoarsePointer;
}

export function isCompactDesktop(environment: ResponsiveEnvironment) {
  const isDesktopInteraction = environment.hasHover && environment.hasFinePointer;
  return environment.width >= MOBILE_WIDTH
    && environment.width < PRIMARY_WIDTH
    && (isDesktopInteraction || !isTablet(environment));
}

export function resolveResponsiveMode(environment: ResponsiveEnvironment): ResponsiveMode {
  if (isTrueMobile(environment)) return "mobile";
  if (isTablet(environment)) return "tablet";
  if (environment.width < PRIMARY_WIDTH) return "compact";
  if (environment.width < WIDE_WIDTH) return "primary";
  return "wide";
}

function readBrowserEnvironment(): ResponsiveEnvironment {
  const hover = window.matchMedia(HOVER_MEDIA);
  const finePointer = window.matchMedia(FINE_POINTER_MEDIA);
  const coarsePointer = window.matchMedia(COARSE_POINTER_MEDIA);
  return {
    width: window.innerWidth,
    hasHover: hover.matches,
    hasFinePointer: finePointer.matches,
    hasCoarsePointer: coarsePointer.matches,
  };
}

export function useResponsiveMode(): ResponsiveMode {
  const [mode, setMode] = useState<ResponsiveMode>("wide");

  // Resolve the client viewport before the browser paints. AppShell is mounted
  // again when moving between list/detail routes; a passive effect would expose
  // the server-safe desktop fallback for one frame and make the sidebar flash.
  useLayoutEffect(() => {
    const hover = window.matchMedia(HOVER_MEDIA);
    const finePointer = window.matchMedia(FINE_POINTER_MEDIA);
    const coarsePointer = window.matchMedia(COARSE_POINTER_MEDIA);
    const updateMode = () => setMode(resolveResponsiveMode(readBrowserEnvironment()));

    updateMode();
    window.addEventListener("resize", updateMode);
    hover.addEventListener("change", updateMode);
    finePointer.addEventListener("change", updateMode);
    coarsePointer.addEventListener("change", updateMode);
    return () => {
      window.removeEventListener("resize", updateMode);
      hover.removeEventListener("change", updateMode);
      finePointer.removeEventListener("change", updateMode);
      coarsePointer.removeEventListener("change", updateMode);
    };
  }, []);

  return mode;
}

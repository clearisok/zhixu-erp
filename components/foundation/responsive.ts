"use client";

import { useEffect, useState } from "react";

export const MOBILE_WIDTH = 768;
export const TABLET_WIDTH = 1024;
export const COMPACT_WIDTH = 1440;

export const HOVER_MEDIA = "(hover: hover)";
export const FINE_POINTER_MEDIA = "(pointer: fine)";
export const COARSE_POINTER_MEDIA = "(pointer: coarse)";

export type ResponsiveMode = "desktop" | "compact" | "tablet" | "mobile";

export interface ResponsiveEnvironment {
  width: number;
  hasHover: boolean;
  hasFinePointer: boolean;
  hasCoarsePointer: boolean;
}

export function isTrueMobile(environment: ResponsiveEnvironment) {
  return environment.width < MOBILE_WIDTH
    && !environment.hasHover
    && environment.hasCoarsePointer;
}

export function isTablet(environment: ResponsiveEnvironment) {
  return environment.width >= MOBILE_WIDTH
    && environment.width < TABLET_WIDTH
    && !environment.hasHover
    && environment.hasCoarsePointer;
}

export function isCompactDesktop(environment: ResponsiveEnvironment) {
  const isDesktopInteraction = environment.hasHover && environment.hasFinePointer;
  return environment.width < COMPACT_WIDTH
    && (isDesktopInteraction || (!isTrueMobile(environment) && !isTablet(environment)));
}

export function resolveResponsiveMode(environment: ResponsiveEnvironment): ResponsiveMode {
  if (environment.width >= COMPACT_WIDTH) return "desktop";
  if (isTrueMobile(environment)) return "mobile";
  if (isTablet(environment)) return "tablet";
  return "compact";
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
  const [mode, setMode] = useState<ResponsiveMode>("desktop");

  useEffect(() => {
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

"use client";

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

const VIEWPORT_GAP = 8;
const ANCHOR_GAP = 10;

type SidebarFloatingMenuProps = {
  anchorRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
  id?: string;
  label: string;
  onClose: () => void;
  open: boolean;
};

type MenuPosition = {
  left: number;
  placement: "left" | "right";
  top: number;
};

export function SidebarFloatingMenu(props: SidebarFloatingMenuProps) {
  if (!props.open) return null;
  return <SidebarFloatingMenuContent {...props} />;
}

function SidebarFloatingMenuContent({
  anchorRef,
  children,
  id,
  label,
  onClose,
}: SidebarFloatingMenuProps) {
  const generatedId = useId();
  const menuId = id ?? generatedId;
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  useEffect(() => {
    let frame = 0;
    const updatePosition = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const anchor = anchorRef.current;
        const menu = menuRef.current;
        if (!anchor || !menu) return;

        const anchorRect = anchor.getBoundingClientRect();
        if (anchorRect.bottom < VIEWPORT_GAP || anchorRect.top > window.innerHeight - VIEWPORT_GAP) {
          onClose();
          return;
        }

        const menuWidth = menu.offsetWidth || 204;
        const menuHeight = menu.offsetHeight;
        const rightLeft = anchorRect.right + ANCHOR_GAP;
        const leftLeft = anchorRect.left - menuWidth - ANCHOR_GAP;
        const canFitRight = rightLeft + menuWidth <= window.innerWidth - VIEWPORT_GAP;
        const canFitLeft = leftLeft >= VIEWPORT_GAP;
        const placement = canFitRight || !canFitLeft ? "right" : "left";
        const rawLeft = placement === "right" ? rightLeft : leftLeft;
        const maxLeft = Math.max(VIEWPORT_GAP, window.innerWidth - menuWidth - VIEWPORT_GAP);
        const left = Math.min(Math.max(rawLeft, VIEWPORT_GAP), maxLeft);

        const bottomAlignedTop = anchorRect.bottom - menuHeight;
        const rawTop = anchorRect.top + menuHeight <= window.innerHeight - VIEWPORT_GAP
          ? anchorRect.top
          : bottomAlignedTop;
        const maxTop = Math.max(VIEWPORT_GAP, window.innerHeight - menuHeight - VIEWPORT_GAP);
        const top = Math.min(Math.max(rawTop, VIEWPORT_GAP), maxTop);

        setPosition({ left, placement, top });
      });
    };

    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!anchorRef.current?.contains(target) && !menuRef.current?.contains(target)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      onClose();
      anchorRef.current?.focus();
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition);
    if (anchorRef.current) observer?.observe(anchorRef.current);
    if (menuRef.current) observer?.observe(menuRef.current);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [anchorRef, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      id={menuId}
      className="ops-sidebar-popover"
      data-placement={position?.placement ?? "right"}
      data-sidebar-floating-menu="true"
      role="menu"
      aria-label={label}
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

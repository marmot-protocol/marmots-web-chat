import { type ReactNode } from "react";
import { Outlet } from "react-router";

import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

interface DesktopShellProps {
  /** Section title shown in the sidebar header. */
  title: string;
  /** Content rendered inside the sidebar panel below the header. */
  sidebar?: ReactNode;
  /** Content rendered in the sidebar footer slot. */
  footer?: ReactNode;
  /**
   * Whether the main content area scrolls vertically.
   *
   * - `true` (default) — `overflow-y-auto`: the outlet content scrolls inside
   *   the inset. Use for pages with variable-height content (settings, contacts,
   *   key packages, etc.).
   * - `false` — `overflow-hidden`: the outlet child owns its own scroll box.
   *   Use when a child view (e.g. chat) manages scrolling internally.
   */
  scroll?: boolean;
  /**
   * Override the `<Outlet />` with explicit children.
   *
   * Used by pages (e.g. Profile) that render inline content rather than
   * delegating to a nested route.
   */
  children?: ReactNode;
}

/**
 * Root layout shell for desktop pages.
 *
 * Composes `AppSidebar` and `SidebarInset` with correct overflow/height
 * constraints so the viewport is always capped and only the designated
 * scroll box inside the main content area overflows.
 */
export function DesktopShell({
  title,
  sidebar,
  footer,
  scroll = true,
  children,
}: DesktopShellProps) {
  return (
    <>
      <AppSidebar title={title} footer={footer}>
        {sidebar}
      </AppSidebar>
      <SidebarInset
        className={cn(
          "flex flex-col flex-1 h-dvh",
          scroll ? "overflow-y-auto" : "overflow-hidden",
        )}
      >
        {children ?? <Outlet />}
      </SidebarInset>
    </>
  );
}

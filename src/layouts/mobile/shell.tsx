import { PropsWithChildren } from "react";
import { Outlet } from "react-router";

import { MobileBottomNav } from "@/layouts/mobile/bottom-nav";
import { MobileTopHeader } from "@/layouts/mobile/top-header";
import { cn } from "@/lib/utils";

interface MobileShellProps {
  /** Section title shown in the top header. */
  title: string;
  /** Whether the content area should be scrollable. */
  scroll?: boolean;
}

/**
 * Root layout shell for mobile general pages.
 *
 * Renders a fixed top header with the section title and avatar,
 * a scrollable content area via `<Outlet />`, and a fixed bottom
 * navigation bar with three tabs (Groups, Contacts, Settings).
 */
export function MobileShell({
  title,
  scroll = true,
  children,
}: PropsWithChildren<MobileShellProps>) {
  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-background w-full">
      <MobileTopHeader title={title} />
      <main
        className={cn(
          "flex-1",
          scroll ? "overflow-y-auto overflow-x-hidden" : "overflow-hidden",
        )}
      >
        {children ?? <Outlet />}
      </main>
      <MobileBottomNav />
    </div>
  );
}

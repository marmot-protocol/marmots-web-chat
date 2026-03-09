import { Outlet } from "react-router";

import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { MobileTopHeader } from "@/components/mobile-top-header";

interface MobileShellProps {
  /** Section title shown in the top header. */
  title: string;
}

/**
 * Root layout shell for mobile general pages.
 *
 * Renders a fixed top header with the section title and avatar,
 * a scrollable content area via `<Outlet />`, and a fixed bottom
 * navigation bar with three tabs (Groups, Contacts, Settings).
 *
 * @example
 * ```tsx
 * function MobileGroupsLayout() {
 *   return <MobileShell title="Groups" />;
 * }
 * ```
 */
export function MobileShell({ title }: MobileShellProps) {
  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-background">
      <MobileTopHeader title={title} />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <MobileBottomNav />
    </div>
  );
}

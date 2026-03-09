import { Link, useLocation, useParams } from "react-router";

import { cn } from "@/lib/utils";

/** A single tab definition used by both desktop and mobile tab bars. */
const GROUP_TABS = [
  { label: "Chat", path: "chat" },
  { label: "Members", path: "members" },
  { label: "Media", path: "media" },
  { label: "Admin", path: "admin", adminOnly: true },
  { label: "Ratchet Tree", path: "tree" },
  { label: "MLS Timeline", path: "timeline" },
] as const;

interface GroupTabLinksProps {
  /** Whether the current user is a group admin (shows the Admin tab when true). */
  isAdmin: boolean;
  /**
   * CSS classes applied to each tab link.
   * Receives `active` so callers can vary the active style independently.
   */
  tabClassName: (active: boolean) => string;
}

/**
 * Renders the set of group tab `<Link>` elements shared by both the desktop
 * tab bar and the mobile scrollable tab strip.
 *
 * Active state is determined from `useLocation` — no prop needed.
 *
 * @example
 * ```tsx
 * // Desktop
 * <div className="flex gap-1 px-4 border-b">
 *   <GroupTabLinks isAdmin={isAdmin} tabClassName={(a) => cn("px-4 py-2", a && "border-b-2 border-primary")} />
 * </div>
 *
 * // Mobile (scrollable)
 * <div className="overflow-x-auto flex no-scrollbar">
 *   <GroupTabLinks isAdmin={isAdmin} tabClassName={(a) => cn("px-4 py-2 whitespace-nowrap shrink-0", a && "border-b-2 border-primary")} />
 * </div>
 * ```
 */
export function GroupTabLinks({ isAdmin, tabClassName }: GroupTabLinksProps) {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();

  return (
    <>
      {GROUP_TABS.map((tab) => {
        if ("adminOnly" in tab && tab.adminOnly && !isAdmin) return null;

        const href = `/groups/${id}/${tab.path}`;
        const isActive =
          tab.path === "chat"
            ? location.pathname === `/groups/${id}` ||
              location.pathname === href
            : location.pathname === href;

        return (
          <Link key={tab.path} to={href} className={tabClassName(isActive)}>
            {tab.label}
          </Link>
        );
      })}
    </>
  );
}

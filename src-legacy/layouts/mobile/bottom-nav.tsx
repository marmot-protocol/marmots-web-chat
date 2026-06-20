import { use$ } from "applesauce-react/hooks";
import { MessageSquareIcon, Settings, UsersIcon } from "lucide-react";
import { Link, useLocation } from "react-router";

import { useGroupUnreadGroupIds$ } from "@/hooks/use-group-unread-groups";
import { cn } from "@/lib/utils";

const MOBILE_TABS = [
  {
    title: "Groups",
    url: "/groups",
    icon: MessageSquareIcon,
  },
  {
    title: "Contacts",
    url: "/contacts",
    icon: UsersIcon,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
] as const;

/**
 * Fixed bottom navigation bar for the mobile shell.
 *
 * Renders three tabs: Groups, Contacts, and Settings.
 * The Groups tab shows an unread badge when there are unread groups.
 * Active tab is determined by matching the current path prefix.
 *
 * @example
 * ```tsx
 * <MobileBottomNav />
 * ```
 */
export function MobileBottomNav() {
  const location = useLocation();
  const groupsUnread = use$(useGroupUnreadGroupIds$());

  return (
    <nav className="w-full h-14 border-t bg-background flex items-stretch">
      {MOBILE_TABS.map((tab) => {
        const isActive = location.pathname.startsWith(tab.url);
        const hasUnread =
          tab.url === "/groups" && (groupsUnread?.length ?? 0) > 0;

        return (
          <Link
            key={tab.url}
            to={tab.url}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors",
              isActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="relative">
              <tab.icon size={22} />
              {hasUnread && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive" />
              )}
            </span>
            <span>{tab.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}

import {
  HardDriveUploadIcon,
  KeyIcon,
  Network,
  User,
  Users,
} from "lucide-react";
import { IconChevronRight } from "@tabler/icons-react";
import { Navigate } from "react-router";
import { Link } from "react-router";

import { useIsMobile } from "@/hooks/use-mobile";

const settingsNavItems = [
  {
    title: "Accounts",
    description: "Manage your Nostr accounts",
    url: "/settings/accounts",
    icon: Users,
  },
  {
    title: "Account",
    description: "Edit your profile and identity",
    url: "/settings/account",
    icon: User,
  },
  {
    title: "Marmot",
    description: "Key packages and group relays",
    url: "/settings/marmot",
    icon: KeyIcon,
  },
  {
    title: "Relays",
    description: "Nostr relay configuration",
    url: "/settings/relays",
    icon: Network,
  },
  {
    title: "Media",
    description: "Blossom media upload servers",
    url: "/settings/blossom",
    icon: HardDriveUploadIcon,
  },
];

/**
 * Settings index page.
 *
 * On mobile, renders a list of all settings sections the user can navigate to.
 * On desktop, immediately redirects to /settings/accounts (the sidebar handles
 * navigation, so an index page is not needed).
 *
 * @example
 * ```tsx
 * <Route index element={<SettingsIndexPage />} />
 * ```
 */
export default function SettingsIndexPage() {
  const isMobile = useIsMobile();

  if (!isMobile) {
    return <Navigate to="/settings/accounts" replace />;
  }

  return (
    <div className="flex flex-col">
      <ul className="divide-y">
        {settingsNavItems.map((item) => (
          <li key={item.url}>
            <Link
              to={item.url}
              className="flex items-center gap-4 px-4 py-3.5 hover:bg-muted/50 transition-colors"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <item.icon size={18} />
              </span>
              <span className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-medium leading-tight">
                  {item.title}
                </span>
                <span className="text-xs text-muted-foreground mt-0.5">
                  {item.description}
                </span>
              </span>
              <IconChevronRight
                size={16}
                className="shrink-0 text-muted-foreground"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

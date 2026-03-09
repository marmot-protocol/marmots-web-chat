import { getDisplayName, getProfilePicture } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { useNavigate } from "react-router";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import accountManager from "@/lib/accounts";
import { eventStore } from "@/lib/nostr";

interface MobileTopHeaderProps {
  /** Section title displayed in the center of the header. */
  title: string;
}

/**
 * Fixed top header for the mobile shell.
 *
 * Displays the current section title on the left and a tappable
 * user avatar on the right that navigates to the profile page.
 *
 * @example
 * ```tsx
 * <MobileTopHeader title="Groups" />
 * ```
 */
export function MobileTopHeader({ title }: MobileTopHeaderProps) {
  const navigate = useNavigate();
  const active = use$(accountManager.active$);

  const activeProfile = use$(
    () => active && eventStore.profile(active.pubkey),
    [active?.pubkey],
  );

  const activeAvatar = active
    ? getProfilePicture(
        activeProfile ?? undefined,
        `https://api.dicebear.com/7.x/identicon/svg?seed=${active.pubkey}`,
      )
    : "";
  const activeName = active
    ? getDisplayName(activeProfile ?? undefined, active.pubkey.slice(0, 16))
    : "";

  return (
    <header className="w-full z-50 h-14 border-b bg-background flex items-center px-4 gap-3">
      <div className="flex-1 text-base font-medium truncate">{title}</div>
      <Button
        variant="ghost"
        size="sm"
        className="h-9 w-9 rounded-lg p-0 shrink-0"
        onClick={() => navigate("/profile")}
      >
        {active ? (
          <Avatar className="h-9 w-9 rounded-lg">
            <AvatarImage src={activeAvatar} alt={activeName} />
            <AvatarFallback className="rounded-lg text-xs">
              {activeName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ) : (
          <Avatar className="h-9 w-9 rounded-lg">
            <AvatarFallback className="rounded-lg text-xs">?</AvatarFallback>
          </Avatar>
        )}
      </Button>
    </header>
  );
}

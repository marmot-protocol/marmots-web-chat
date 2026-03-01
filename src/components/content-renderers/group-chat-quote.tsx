import type { Rumor } from "applesauce-common/helpers/gift-wrap";

import { UserAvatar, UserName } from "@/components/nostr-user";

interface GroupChatQuoteProps {
  rumor: Rumor;
}

/**
 * Renders a quoted kind-9 group chat message as an inline block quote.
 * Used when a reply message embeds a `nostr:nevent1…` reference that resolves
 * to a rumour already loaded from the group history.
 */
export function GroupChatQuote({ rumor }: GroupChatQuoteProps) {
  // Strip a leading nostr:nevent1… line from the quoted content so we don't
  // show recursive quote-in-quote prefixes.
  const displayContent = rumor.content
    .replace(/^nostr:nevent1[a-z0-9]+\n?/i, "")
    .trim();

  return (
    <div className="flex items-start gap-1.5 my-1 pl-2 border-l-2 border-muted-foreground/40 text-sm text-muted-foreground max-w-lg">
      <UserAvatar pubkey={rumor.pubkey} size="sm" />
      <div className="min-w-0">
        <span className="font-medium text-foreground">
          <UserName pubkey={rumor.pubkey} />
        </span>
        {displayContent && <p className="truncate">{displayContent}</p>}
      </div>
    </div>
  );
}

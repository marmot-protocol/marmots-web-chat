import { use$ } from "applesauce-react/hooks";
import { eventStore } from "@/lib/nostr";

interface UserMentionProps {
  pubkey: string;
  encoded: string;
}

/**
 * Renders a user mention with profile information
 * Shows display name or fallback to truncated npub
 */
export function UserMention({ pubkey, encoded }: UserMentionProps) {
  const profile = use$(() => eventStore.profile(pubkey), [pubkey]);

  const displayName = profile?.displayName || profile?.name;

  if (displayName) {
    return (
      <span
        className="text-blue-400 hover:underline cursor-pointer"
        title={encoded}
      >
        @{displayName}
      </span>
    );
  }

  // Fallback to truncated npub while loading
  return (
    <span className="text-blue-400" title={encoded}>
      @{encoded.slice(0, 8)}...
    </span>
  );
}

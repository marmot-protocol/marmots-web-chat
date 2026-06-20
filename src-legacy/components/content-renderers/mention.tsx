import type { Mention } from "applesauce-content/nast";
import { UserMention } from "./user-mention";
import { EventCard } from "./event-card";

/**
 * Renders Nostr mentions (npub, nevent, naddr, etc.)
 * - User mentions (npub/nprofile) show display name with profile
 * - Event mentions (note/nevent/naddr) show event cards with preview
 */
export const MentionRenderer = ({ node }: { node: Mention }) => {
  const { decoded, encoded } = node;

  // Handle user mentions (npub/nprofile)
  if (decoded.type === "npub") {
    return <UserMention pubkey={decoded.data} encoded={encoded} />;
  }

  if (decoded.type === "nprofile") {
    return <UserMention pubkey={decoded.data.pubkey} encoded={encoded} />;
  }

  // Handle event mentions (note/nevent)
  if (decoded.type === "note") {
    return <EventCard pointer={decoded.data} encoded={encoded} />;
  }

  if (decoded.type === "nevent") {
    return <EventCard pointer={decoded.data} encoded={encoded} />;
  }

  // Handle addressable event mentions (naddr)
  if (decoded.type === "naddr") {
    return <EventCard pointer={decoded.data} encoded={encoded} />;
  }

  // Fallback for unknown types (nsec, etc.)
  return (
    <span className="text-blue-400" title={`${decoded.type}: ${encoded}`}>
      @{encoded.slice(0, 8)}...
    </span>
  );
};

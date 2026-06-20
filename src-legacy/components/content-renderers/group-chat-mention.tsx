import type { Mention } from "applesauce-content/nast";
import { kinds } from "applesauce-core/helpers";

import { useGroupRumor } from "@/contexts/group-event-store-context";

import { GroupChatQuote } from "./group-chat-quote";
import { MentionRenderer } from "./mention";

/**
 * A mention renderer that is aware of the group message history.
 *
 * When a `nostr:nevent1…` (or `note1…`) reference is encountered and the
 * referenced event is a kind-9 chat message that already exists in the group
 * context, it renders a styled quote block instead of the generic EventCard
 * (which would try — and fail — to look up the private rumour from the public
 * Nostr relay network).
 *
 * Falls back to the default MentionRenderer for all other mention types.
 */
export function GroupChatMentionRenderer({ node }: { node: Mention }) {
  const { decoded } = node;

  // Determine the event ID from note1 or nevent1 mentions
  let eventId: string | undefined;
  if (decoded.type === "note") {
    eventId = decoded.data;
  } else if (decoded.type === "nevent") {
    eventId = decoded.data.id;
  }

  const rumor = useGroupRumor(eventId);

  // If we found a kind-9 rumour in the group history, render it as a quote
  if (rumor && rumor.kind === kinds.ChatMessage) {
    return <GroupChatQuote rumor={rumor} />;
  }

  // Fall through to the default renderer for all other cases
  return <MentionRenderer node={node} />;
}

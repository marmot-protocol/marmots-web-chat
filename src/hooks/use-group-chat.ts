import { useMemo } from "react";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { use$ } from "applesauce-react/hooks";

import { useController } from "./use-marmot";

const CHAT_KIND = 9;
const REACTION_KIND = 7;

/** Oldest-first chat messages (kind 9) for a group, reactive. */
export function useGroupMessages(groupId: string | undefined): NostrEvent[] {
  const controller = useController();
  const store = groupId ? controller?.getGroupStore(groupId) : undefined;
  const timeline = use$(
    () => (store ? store.timeline({ kinds: [CHAT_KIND] }) : undefined),
    [store],
  );
  return useMemo(
    () => (timeline ? [...timeline].sort((a, b) => a.created_at - b.created_at) : []),
    [timeline],
  );
}

/** The id of the message a chat rumor replies to (NIP-C7), if any. */
export function getReplyToId(message: NostrEvent): string | null {
  // NIP-C7 quotes the parent with a `q` tag.
  const q = message.tags.find((t) => t[0] === "q" && t[1]);
  if (q) return q[1];
  // Fallback for legacy messages that used NIP-10 `e`/marker tags.
  const tags = message.tags.filter((t) => t[0] === "e" && t[1]);
  if (tags.length === 0) return null;
  const reply = tags.find((t) => t[3] === "reply");
  const root = tags.find((t) => t[3] === "root");
  return (reply ?? root ?? tags[0])[1] ?? null;
}

/** Reactively resolve a single event by id from a group's store. */
export function useGroupEvent(
  groupId: string,
  eventId: string | null,
): NostrEvent | undefined {
  const controller = useController();
  const store = controller?.getGroupStore(groupId);
  return use$(
    () => (store && eventId ? store.event(eventId) : undefined),
    [store, eventId],
  );
}

/** Reactions (kind 7) targeting a specific message, reactive. */
export function useMessageReactions(
  groupId: string,
  messageId: string,
): NostrEvent[] {
  const controller = useController();
  const store = controller?.getGroupStore(groupId);
  const reactions = use$(
    () =>
      store
        ? store.timeline({ kinds: [REACTION_KIND], "#e": [messageId] })
        : undefined,
    [store, messageId],
  );
  return reactions ?? [];
}

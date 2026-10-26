import { getEventPointerFromQTag } from "applesauce-core/helpers/pointers";
import { getNip10References } from "applesauce-common/helpers/threading";
import { useMemo } from "react";
import { kinds, type Rumor } from "applesauce-core/helpers/event";
import { use$ } from "applesauce-react/hooks";

import { useGroupStore } from "./use-marmot";

/**
 * Read oldest-first private chat rumors for a group.
 * @param groupId - Group whose private store to observe.
 * @returns The loaded chat window, updated reactively.
 * @example const messages = useGroupMessages(groupId);
 */
export function useGroupMessages(groupId: string | undefined): Rumor[] {
  const store = useGroupStore(groupId);
  const timeline = use$(
    () => (store ? store.timeline({ kinds: [kinds.ChatMessage] }) : undefined),
    [store],
  );
  return useMemo(
    () =>
      timeline ? [...timeline].sort((a, b) => a.created_at - b.created_at) : [],
    [timeline],
  );
}

/**
 * Read the parent using Applesauce's NIP-C7 pointer and NIP-10 helpers.
 * @param message - Private chat rumor.
 * @returns The parent ID, or null for an unthreaded message.
 */
export function getReplyToId(message: Rumor): string | null {
  const quote = message.tags.find((tag) => tag[0] === "q");
  const thread = getNip10References(message);
  return (
    (quote && getEventPointerFromQTag(quote)?.id) ||
    thread.reply?.e?.id ||
    thread.root?.e?.id ||
    null
  );
}

/**
 * Reactively resolve a rumor from the private group store.
 * @param groupId - Owning group.
 * @param eventId - Canonical rumor ID, or null.
 * @returns The loaded rumor, when available.
 * @example const parent = useGroupEvent(groupId, replyToId);
 */
export function useGroupEvent(
  groupId: string,
  eventId: string | null,
): Rumor | undefined {
  const store = useGroupStore(groupId);
  return use$(
    () => (store && eventId ? store.event(eventId) : undefined),
    [store, eventId],
  );
}

/**
 * Read reactions to a message from the private group store.
 * @param groupId - Owning group.
 * @param messageId - Canonical target rumor ID.
 * @returns Matching reaction rumors.
 * @example const reactions = useMessageReactions(groupId, message.id);
 */
export function useMessageReactions(
  groupId: string,
  messageId: string,
): Rumor[] {
  const store = useGroupStore(groupId);
  const reactions = use$(
    () =>
      store
        ? store.timeline({ kinds: [kinds.Reaction], "#e": [messageId] })
        : undefined,
    [store, messageId],
  );
  return reactions ?? [];
}

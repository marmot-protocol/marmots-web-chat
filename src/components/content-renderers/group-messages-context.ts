import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import { createContext, useContext } from "react";

/**
 * React context that exposes the group's currently-loaded rumours to content
 * renderers deep in the component tree. This lets the mention renderer find
 * a kind-9 rumour by ID when rendering reply quotes without needing to hit
 * the public Nostr event store (group messages are private and never published
 * there).
 */
export const GroupMessagesContext = createContext<Rumor[]>([]);

/** Returns the group messages array from the nearest provider. */
export function useGroupMessages(): Rumor[] {
  return useContext(GroupMessagesContext);
}

/** Look up a single rumour by its event ID from the context. */
export function useGroupRumor(id: string | undefined): Rumor | undefined {
  const messages = useContext(GroupMessagesContext);
  if (!id) return undefined;
  return messages.find((r) => r.id === id);
}

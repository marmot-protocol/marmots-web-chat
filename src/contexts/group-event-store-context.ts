import { EventStore } from "applesauce-core";
import type { NostrEvent } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { createContext, useContext } from "react";

/**
 * React context that exposes the per-group {@link EventStore} to all
 * components within a group route. The store holds private MLS rumors
 * (kind 9 chat messages, kind 7 reactions, etc.) and allows any component
 * to run reactive queries without prop-drilling.
 *
 * The global `eventStore` (src/lib/nostr.ts) continues to serve public
 * Nostr data (profiles, relay lists, etc.) — this store is exclusively
 * for group-private content.
 */
export const GroupEventStoreContext = createContext<EventStore | null>(null);

/**
 * Returns the per-group {@link EventStore} from the nearest provider.
 * Throws if used outside a `GroupEventStoreContext.Provider`.
 */
export function useGroupEventStore(): EventStore {
  const store = useContext(GroupEventStoreContext);
  if (!store)
    throw new Error(
      "useGroupEventStore must be used within a GroupEventStoreContext.Provider",
    );
  return store;
}

/**
 * Reactively looks up a single rumor by its event ID from the group store.
 * Returns `undefined` when the id is not provided or the rumor is not yet
 * in the store. Replaces the linear-scan `useGroupRumor` from the old
 * `group-messages-context`.
 */
export function useGroupRumor(id: string | undefined): NostrEvent | undefined {
  const store = useGroupEventStore();
  return use$(() => {
    if (!id) return undefined;
    return store.event(id);
  }, [store, id]);
}

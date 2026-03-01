import {
  type GroupRumorHistory,
  type MarmotGroup,
} from "@internet-privacy/marmots";
import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import { EventStore } from "applesauce-core";
import type { NostrEvent } from "applesauce-core/helpers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Creates and populates a per-group {@link EventStore} from a group's
 * {@link GroupRumorHistory}. Rumors are unsigned so signature verification
 * is bypassed — the store is purely a reactive query layer over private
 * group content.
 *
 * Historical rumors are streamed in page-by-page from the paginated loader;
 * live rumors arrive via the history "rumor" event emitter.
 *
 * @returns The group-scoped EventStore plus loading state for the initial
 *   historical backfill (so the UI can show a "Load older messages" button).
 *
 * @example
 * ```tsx
 * const { groupEventStore, loadingMore, loadingDone } = useGroupEventStore(group);
 * const messages = use$(() => groupEventStore.timeline({ kinds: [9] }), [groupEventStore]);
 * ```
 */
export function useGroupEventStore(
  group: MarmotGroup<GroupRumorHistory> | null,
): {
  groupEventStore: EventStore;
  loadingMore: boolean;
  loadingDone: boolean;
  loadMore: () => Promise<void>;
} {
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingDone, setLoadingDone] = useState(false);

  // Create a fresh EventStore for each group. Memoized on the group object
  // itself so switching groups tears down and recreates the store.
  const groupEventStore = useMemo(() => {
    const store = new EventStore();
    // Rumors are unsigned — skip signature verification entirely
    store.verifyEvent = () => true;
    return store;
  }, [group]);

  // Keep a stable ref to the paginated loader so page loads are sequential
  const loader = useRef<AsyncGenerator<Rumor[], void> | null>(null);

  // Reset loader and loading state when group (and therefore store) changes
  useEffect(() => {
    if (!group?.history) {
      loader.current = null;
      return;
    }

    loader.current = group.history.createPaginatedLoader({
      limit: 200,
    });

    setLoadingDone(false);
    setLoadingMore(false);
  }, [group]);

  // Add a rumor to the group EventStore, casting it to NostrEvent since the
  // store API expects signed events but we've disabled verification above.
  const addRumorToStore = useCallback(
    (rumor: Rumor) => {
      groupEventStore.add(rumor as NostrEvent);
    },
    [groupEventStore],
  );

  // Load the next page of historical rumors from IndexedDB into the store
  const loadMore = useCallback(async () => {
    if (!loader.current) return;
    setLoadingMore(true);
    const page = await loader.current.next();
    if (page.value) {
      for (const rumor of page.value) {
        addRumorToStore(rumor);
      }
    }
    if (page.done) setLoadingDone(true);
    setLoadingMore(false);
  }, [addRumorToStore, setLoadingMore, setLoadingDone]);

  // Load the first page on mount / group change
  useEffect(() => {
    loadMore();
  }, [loadMore]);

  // Load first 500 events when group changes
  useEffect(() => {
    if (!group?.history) return;

    group.history
      .queryRumors({ limit: 500 })
      .then((rumors) => rumors.forEach((rumor) => addRumorToStore(rumor)));
  }, [addRumorToStore, group?.history]);

  // Subscribe to live rumors as they arrive (from ingest or optimistic sends)
  useEffect(() => {
    if (!group?.history) return;

    const listener = (rumor: Rumor) => {
      addRumorToStore(rumor);
    };

    group.history.addListener("rumor", listener);
    return () => {
      group.history?.removeListener("rumor", listener);
    };
  }, [group?.history, addRumorToStore]);

  return { groupEventStore, loadingMore, loadingDone, loadMore };
}

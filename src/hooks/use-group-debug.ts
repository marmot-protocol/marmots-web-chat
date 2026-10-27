import type { AppGroup as MarmotGroup } from "@/lib/marmot/types";
import { useCallback, useMemo, useSyncExternalStore } from "react";

import type { ForkTreeView } from "@internet-privacy/marmot-ts/client";
import type { NostrEvent } from "applesauce-core/helpers/event";

export interface GroupDebugSnapshot {
  /** Serializable fork-history tree: every observed state + the canonical path. */
  view: ForkTreeView;
  /** Events received but not yet decrypted into the tree (oldest-first). */
  pending: NostrEvent[];
  /** The canonical (live) MLS epoch the client currently operates on. */
  epoch: number;
  /** Derived convergence status (Syncing / Resolving / Settled / Blocked). */
  convergenceStatus: MarmotGroup["convergenceStatus"];
  /** Group lifecycle state (Stable / PendingPublish / Merging). */
  lifecycle: MarmotGroup["lifecycle"];
}

/**
 * Read debug projections when the library's unified group snapshot changes.
 * @param group - Loaded group to observe.
 * @returns Fork history, pending events, epoch and convergence diagnostics.
 * @example const debug = useGroupDebug(group);
 */
export function useGroupDebug(group: MarmotGroup): GroupDebugSnapshot {
  const subscribe = useCallback(
    (listener: () => void) => {
      group.on("changed", listener);
      return () => {
        group.off("changed", listener);
      };
    },
    [group],
  );
  const snapshot = useSyncExternalStore(subscribe, () => group.snapshot);

  return useMemo(
    () => ({
      view: group.forkTreeView(),
      pending: group.pendingEvents(),
      epoch: Number(snapshot.epoch),
      convergenceStatus: snapshot.convergenceStatus,
      lifecycle: snapshot.lifecycle,
    }),
    [group, snapshot],
  );
}

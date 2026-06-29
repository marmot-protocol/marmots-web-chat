import { useEffect, useMemo, useState } from "react";

import type {
  ForkTreeView,
  MarmotGroup,
} from "@internet-privacy/marmot-ts/client";
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
 * Live debug snapshot of a {@link MarmotGroup}'s fork-history tree and ingestion
 * pool. The fork tree grows on inbound commits / newly-observed forks
 * (`historyChanged`) and the canonical tip moves on `stateChanged`, so we
 * recompute the view from those two events. `forkTreeView()` and
 * `pendingEvents()` allocate fresh objects each call, so they are computed only
 * when one of those events bumps the version (never every render).
 */
export function useGroupDebug(group: MarmotGroup): GroupDebugSnapshot {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    group.on("historyChanged", bump);
    group.on("stateChanged", bump);
    return () => {
      group.off("historyChanged", bump);
      group.off("stateChanged", bump);
    };
  }, [group]);

  return useMemo(
    () => ({
      view: group.forkTreeView(),
      pending: group.pendingEvents(),
      epoch: Number(group.state.groupContext.epoch),
      convergenceStatus: group.convergenceStatus,
      lifecycle: group.lifecycle,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [group, version],
  );
}

import {
  getMarmotGroupData,
  getNostrGroupIdHex,
  unixNow,
} from "@internet-privacy/marmot-ts";
import { use$ } from "applesauce-react/hooks";
import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { from, of, switchMap } from "rxjs";
import { catchError } from "rxjs/operators";

import { useGroupEventStore } from "@/hooks/use-group-event-store";
import { accounts } from "@/lib/accounts";
import { marmotClient$ } from "@/lib/marmot-client";
import { getGroupSubscriptionManager } from "@/lib/runtime";

/**
 * Shared data hook for the group detail layouts (desktop and mobile).
 *
 * Handles:
 * - Loading the group from `marmotClient$`
 * - Building the per-group `groupEventStore`
 * - Marking the group as seen
 * - Redirecting to `/groups` when the group no longer exists
 * - Deriving `groupName` and `isAdmin`
 *
 * @returns All state needed to render either the desktop or mobile group layout.
 *
 * @example
 * ```tsx
 * const { id, group, groupName, isAdmin, groupEventStore, ... } = useGroupDetail();
 * if (group === undefined) return <LoadingState />;
 * if (group === null) return null;
 * ```
 */
export function useGroupDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const account = use$(accounts.active$);

  const group = use$(
    () =>
      marmotClient$.pipe(
        switchMap((client) => {
          if (!client || !id) return of(null);
          return from(client.getGroup(id)).pipe(catchError(() => of(null)));
        }),
      ),
    [id],
  );

  const {
    groupEventStore,
    loadingMore,
    loadingDone,
    loadMore: loadMoreMessages,
  } = useGroupEventStore(group ?? null);

  const groupIdHex = useMemo(() => {
    if (!group) return null;
    return getNostrGroupIdHex(group.state);
  }, [group]);

  // Mark group as seen when viewing it
  useEffect(() => {
    if (!groupIdHex) return;
    const subscriptionManager = getGroupSubscriptionManager();
    if (!subscriptionManager) return;
    subscriptionManager.markGroupSeen(groupIdHex, unixNow());
  }, [groupIdHex]);

  // Redirect to groups list when the group is no longer available
  useEffect(() => {
    if (!id) return;
    if (group === null) navigate("/groups");
  }, [id, group, navigate]);

  const groupName = group
    ? getMarmotGroupData(group.state)?.name || "Unnamed Group"
    : "Loading...";

  const isAdmin = useMemo(() => {
    if (!group || !account?.pubkey) return false;
    const data = getMarmotGroupData(group.state);
    return data?.adminPubkeys?.includes(account.pubkey) ?? false;
  }, [group, account?.pubkey]);

  return {
    id,
    group,
    groupName,
    isAdmin,
    groupEventStore,
    loadingMore,
    loadingDone,
    loadMoreMessages,
    navigate,
  };
}

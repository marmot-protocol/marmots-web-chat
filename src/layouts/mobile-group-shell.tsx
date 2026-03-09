import {
  getMarmotGroupData,
  getNostrGroupIdHex,
  unixNow,
} from "@internet-privacy/marmot-ts";
import { use$ } from "applesauce-react/hooks";
import { ArrowLeftIcon, Loader2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import { from, of, switchMap } from "rxjs";
import { catchError } from "rxjs/operators";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { withActiveAccount } from "@/components/with-active-account";
import { GroupContext } from "@/contexts/group-context";
import { GroupEventStoreContext } from "@/contexts/group-event-store-context";
import { useGroupEventStore } from "@/hooks/use-group-event-store";
import { accounts } from "@/lib/accounts";
import { marmotClient$ } from "@/lib/marmot-client";
import { getGroupSubscriptionManager } from "@/lib/runtime";
import { cn } from "@/lib/utils";

/**
 * Full-screen mobile layout for group detail pages.
 *
 * Replaces the desktop `GroupDetailPage` layout on mobile. Renders:
 * - A fixed header with a back-to-groups button and the group name
 * - A horizontally scrollable tab strip (Chat, Members, Media, Admin, Ratchet Tree, MLS Timeline)
 * - A full-screen `<Outlet />` for the active tab's content
 *
 * Provides `GroupContext` and `GroupEventStoreContext` to all child routes,
 * identical to the desktop layout.
 *
 * No bottom navigation bar — the group view is full-screen by design.
 *
 * @example
 * ```tsx
 * // In mobile routes (wrapped by withActiveAccount):
 * <Route path=":id" element={<MobileGroupShell />}>
 *   <Route index element={<GroupChatPage />} />
 *   ...
 * </Route>
 * ```
 */
function MobileGroupShell() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [_detailsOpen, setDetailsOpen] = useState(false);
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

  useEffect(() => {
    if (!groupIdHex) return;
    const subscriptionManager = getGroupSubscriptionManager();
    if (!subscriptionManager) return;
    subscriptionManager.markGroupSeen(groupIdHex, unixNow());
  }, [groupIdHex]);

  useEffect(() => {
    if (!id) return;
    if (group === null) {
      navigate("/groups");
    }
  }, [id, group, navigate]);

  const groupName = group
    ? getMarmotGroupData(group.state)?.name || "Unnamed Group"
    : "Loading...";

  const isAdmin = useMemo(() => {
    if (!group || !account?.pubkey) return false;
    const data = getMarmotGroupData(group.state);
    return data?.adminPubkeys?.includes(account?.pubkey) ?? false;
  }, [group, account?.pubkey]);

  const currentPath = location.pathname;
  const isOnChatTab =
    currentPath === `/groups/${id}` || currentPath === `/groups/${id}/chat`;
  const isOnMembersTab = currentPath === `/groups/${id}/members`;
  const isOnAdminTab = currentPath === `/groups/${id}/admin`;
  const isOnTreeTab = currentPath === `/groups/${id}/tree`;
  const isOnEventsTab = currentPath === `/groups/${id}/timeline`;
  const isOnMediaTab = currentPath === `/groups/${id}/media`;

  if (!id) {
    return (
      <div className="flex flex-col min-h-dvh bg-background">
        <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b bg-background flex items-center px-4 gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => navigate("/groups")}
          >
            <ArrowLeftIcon size={20} />
          </Button>
          <span className="flex-1 text-base font-medium truncate">
            Invalid Group
          </span>
        </header>
        <div className="flex items-center justify-center flex-1 p-4 mt-14">
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>Invalid group ID</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (group === undefined) {
    return (
      <div className="flex flex-col min-h-dvh bg-background">
        <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b bg-background flex items-center px-4 gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => navigate("/groups")}
          >
            <ArrowLeftIcon size={20} />
          </Button>
          <span className="flex-1 text-base font-medium truncate">
            Loading...
          </span>
        </header>
        <div className="flex items-center justify-center flex-1 p-4 mt-14">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading group...</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/groups")}
            >
              Back to Groups
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (group === null) {
    return null;
  }

  const tabLinkClass = (active: boolean) =>
    cn(
      "px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors shrink-0",
      "hover:text-foreground",
      active
        ? "text-foreground border-b-2 border-primary"
        : "text-muted-foreground",
    );

  return (
    <div className="flex flex-col min-h-dvh bg-background">
      {/* Fixed header: back button + group name + optional actions */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b bg-background flex items-center px-2 gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => navigate("/groups")}
        >
          <ArrowLeftIcon size={20} />
        </Button>
        <span className="flex-1 text-base font-medium truncate">
          {groupName}
        </span>
        {/* Details drawer trigger — reuse same pattern as desktop */}
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => setDetailsOpen(true)}
        >
          {/* Three-dot menu placeholder — GroupDetailsDrawer wired below */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </Button>
      </header>

      {/* Horizontally scrollable tab strip */}
      <div className="fixed top-14 left-0 right-0 z-40 border-b bg-background overflow-x-auto flex no-scrollbar">
        <Link to={`/groups/${id}/chat`} className={tabLinkClass(isOnChatTab)}>
          Chat
        </Link>
        <Link
          to={`/groups/${id}/members`}
          className={tabLinkClass(isOnMembersTab)}
        >
          Members
        </Link>
        <Link to={`/groups/${id}/media`} className={tabLinkClass(isOnMediaTab)}>
          Media
        </Link>
        {isAdmin && (
          <Link
            to={`/groups/${id}/admin`}
            className={tabLinkClass(isOnAdminTab)}
          >
            Admin
          </Link>
        )}
        <Link to={`/groups/${id}/tree`} className={tabLinkClass(isOnTreeTab)}>
          Ratchet Tree
        </Link>
        <Link
          to={`/groups/${id}/timeline`}
          className={tabLinkClass(isOnEventsTab)}
        >
          MLS Timeline
        </Link>
      </div>

      {/* Scrollable content area: offset by header (56px) + tab strip (41px) */}
      <main className="flex-1 overflow-y-auto pt-[calc(56px+41px)]">
        <GroupEventStoreContext.Provider value={groupEventStore}>
          <GroupContext.Provider
            value={{
              group,
              isAdmin,
              loadingMore,
              loadingDone,
              loadMoreMessages,
            }}
          >
            <Outlet />
          </GroupContext.Provider>
        </GroupEventStoreContext.Provider>
      </main>
    </div>
  );
}

export default withActiveAccount(MobileGroupShell);

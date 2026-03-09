import {
  getMarmotGroupData,
  getNostrGroupIdHex,
  unixNow,
} from "@internet-privacy/marmot-ts";
import { use$ } from "applesauce-react/hooks";
import { Loader2, Menu, XCircle } from "lucide-react";
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

import { PageHeader } from "@/components/page-header";
import { SubscriptionStatusButton } from "@/components/subscription-status-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { withActiveAccount } from "@/components/with-active-account";
import { GroupContext } from "@/contexts/group-context";
import { GroupEventStoreContext } from "@/contexts/group-event-store-context";
import { useGroupEventStore } from "@/hooks/use-group-event-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { accounts } from "@/lib/accounts";
import { marmotClient$ } from "@/lib/marmot-client";
import { getGroupSubscriptionManager } from "@/lib/runtime";
import { cn } from "@/lib/utils";
import MobileGroupShell from "@/layouts/mobile-group-shell";
import { GroupDetailsDrawer } from "./components/group-details-drawer";

function DesktopGroupDetailLayout() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const account = use$(accounts.active$);

  // Get the selected group from marmotClient$
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

  // Build and populate the per-group EventStore from the group's rumor history.
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

  // If the group doesn't exist locally, go back to the groups list.
  useEffect(() => {
    if (!id) return;
    if (group === null) {
      navigate("/groups");
    }
  }, [id, group, navigate]);

  // Get group name
  const groupName = group
    ? getMarmotGroupData(group.state)?.name || "Unnamed Group"
    : "Loading...";

  const isAdmin = useMemo(() => {
    if (!group || !account?.pubkey) return false;
    const data = getMarmotGroupData(group.state);
    return data?.adminPubkeys?.includes(account?.pubkey) ?? false;
  }, [group, account?.pubkey]);

  // Determine active tab from current path
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
      <>
        <PageHeader
          items={[
            { label: "Home", to: "/" },
            { label: "Groups", to: "/groups" },
            { label: "Invalid Group" },
          ]}
        />
        <div className="flex items-center justify-center h-full p-4">
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>Invalid group ID</AlertDescription>
          </Alert>
        </div>
      </>
    );
  }

  if (group === undefined) {
    return (
      <>
        <PageHeader
          items={[
            { label: "Home", to: "/" },
            { label: "Groups", to: "/groups" },
            { label: "Loading..." },
          ]}
        />
        <div className="flex items-center justify-center h-full p-4">
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
      </>
    );
  }

  if (group === null) {
    return null;
  }

  return (
    <>
      <PageHeader
        items={[
          { label: "Home", to: "/" },
          { label: "Groups", to: "/groups" },
          { label: groupName },
        ]}
        actions={
          <div className="flex gap-2">
            {group.relays && <SubscriptionStatusButton relays={group.relays} />}
            <GroupDetailsDrawer
              open={detailsOpen}
              onOpenChange={setDetailsOpen}
              group={group}
              trigger={
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              }
            />
          </div>
        }
      />

      {/* Tabs Navigation */}
      <div className="flex gap-1 px-4 border-b">
        <Link
          to={`/groups/${id}/chat`}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors",
            "hover:text-foreground",
            isOnChatTab
              ? "text-foreground border-b-2 border-primary"
              : "text-muted-foreground",
          )}
        >
          Chat
        </Link>
        <Link
          to={`/groups/${id}/members`}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors",
            "hover:text-foreground",
            isOnMembersTab
              ? "text-foreground border-b-2 border-primary"
              : "text-muted-foreground",
          )}
        >
          Members
        </Link>
        <Link
          to={`/groups/${id}/media`}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors",
            "hover:text-foreground",
            isOnMediaTab
              ? "text-foreground border-b-2 border-primary"
              : "text-muted-foreground",
          )}
        >
          Media
        </Link>
        {isAdmin && (
          <Link
            to={`/groups/${id}/admin`}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              "hover:text-foreground",
              isOnAdminTab
                ? "text-foreground border-b-2 border-primary"
                : "text-muted-foreground",
            )}
          >
            Admin
          </Link>
        )}
        <Link
          to={`/groups/${id}/tree`}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors",
            "hover:text-foreground",
            isOnTreeTab
              ? "text-foreground border-b-2 border-primary"
              : "text-muted-foreground",
          )}
        >
          Ratchet Tree
        </Link>
        <Link
          to={`/groups/${id}/timeline`}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors",
            "hover:text-foreground",
            isOnEventsTab
              ? "text-foreground border-b-2 border-primary"
              : "text-muted-foreground",
          )}
        >
          MLS Timeline
        </Link>
      </div>

      {/* Both contexts provided so all child routes can access the group
          instance and query group-private events reactively without
          prop-drilling or outlet context typing. */}
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
    </>
  );
}

function GroupDetailPage() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileGroupShell /> : <DesktopGroupDetailLayout />;
}

export default withActiveAccount(GroupDetailPage);

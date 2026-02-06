import { use$ } from "applesauce-react/hooks";
import { Loader2, Menu, XCircle } from "lucide-react";
import {
  extractMarmotGroupData,
  getGroupMembers,
  getNostrGroupIdHex,
  unixNow,
} from "marmot-ts";
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

import { GroupDetailsDrawer } from "@/components/group/group-details-drawer";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { accounts } from "@/lib/accounts";
import { marmotClient$ } from "@/lib/marmot-client";
import { getGroupSubscriptionManager } from "@/lib/runtime";
import { cn } from "@/lib/utils";
import { withActiveAccount } from "../../components/with-active-account";

function GroupDetailPage() {
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
    ? extractMarmotGroupData(group.state)?.name || "Unnamed Group"
    : "Loading...";

  const groupDetails = useMemo(() => {
    if (!group) return null;

    const data = extractMarmotGroupData(group.state);
    const allMembers = getGroupMembers(group.state);
    const adminPubkeys = data?.adminPubkeys || [];

    // Filter out admins from members list to avoid duplication
    const members = allMembers.filter((pk) => !adminPubkeys.includes(pk));

    return {
      name: data?.name || "Unnamed Group",
      epoch: group.state.groupContext.epoch,
      members,
      admins: adminPubkeys,
    };
  }, [group]);

  const isAdmin = useMemo(() => {
    if (!group || !account?.pubkey) return false;
    const data = extractMarmotGroupData(group.state);
    return data?.adminPubkeys?.includes(account?.pubkey) ?? false;
  }, [group, account?.pubkey]);

  // Determine active tab from current path
  const currentPath = location.pathname;
  const isOnChatTab =
    currentPath === `/groups/${id}` || currentPath === `/groups/${id}/chat`;
  const isOnMembersTab = currentPath === `/groups/${id}/members`;
  const isOnAdminTab = currentPath === `/groups/${id}/admin`;

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
          <GroupDetailsDrawer
            open={detailsOpen}
            onOpenChange={setDetailsOpen}
            groupDetails={groupDetails}
            isAdmin={isAdmin}
            group={group}
            trigger={
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            }
          />
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
      </div>

      {/* Tab Content */}
      <Outlet context={{ group, groupDetails, isAdmin }} />
    </>
  );
}

export default withActiveAccount(GroupDetailPage);

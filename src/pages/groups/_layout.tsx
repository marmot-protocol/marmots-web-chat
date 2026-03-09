import type { AppGroup } from "@/lib/marmot-client";
import { getGroupMembers } from "@internet-privacy/marmot-ts";
import { castUser } from "applesauce-common/casts/user";
import { kinds } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { from, map } from "rxjs";

import { UserAvatar, UserName } from "@/components/nostr-user";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DesktopShell } from "@/layouts/desktop/shell";
import { MobileShell } from "@/layouts/mobile/shell";
import accounts from "@/lib/accounts";
import { liveGroups$, marmotClient$ } from "@/lib/marmot-client";
import { getGroupSubscriptionManager } from "@/lib/runtime";
import { eventStore } from "@/lib/nostr";
import { useIsMobile } from "@/hooks/use-mobile";

const MAX_AVATARS = 3;

/** Returns true if the group is a 1:1 direct message (exactly 2 members). */
function isDirect(group: AppGroup, selfPubkey: string | undefined): boolean {
  const members = getGroupMembers(group.state);
  if (members.length !== 2) return false;
  return selfPubkey ? members.includes(selfPubkey) : true;
}

function GroupItem({ group }: { group: AppGroup }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = location.pathname.startsWith(`/groups/${group.idStr}`);
  const marmotData = group.groupData;
  const name = marmotData?.name || "Unnamed Group";
  const description = marmotData?.description || "";

  const account = use$(accounts.active$);
  const selfPubkey = account?.pubkey;
  const client = use$(marmotClient$);

  const groupMgr = getGroupSubscriptionManager();
  const unreadGroups = use$(groupMgr?.unreadGroupIds$ ?? undefined);
  const hasUnread = Array.isArray(unreadGroups)
    ? unreadGroups.includes(group.idStr)
    : false;

  const allMembers = getGroupMembers(group.state);
  const otherMembers = selfPubkey
    ? allMembers.filter((pk) => pk !== selfPubkey)
    : allMembers;

  const visibleAvatars = otherMembers.slice(0, MAX_AVATARS);
  const overflowCount = otherMembers.length - visibleAvatars.length;

  const isDM = isDirect(group, selfPubkey);
  const otherPubkey =
    isDM && otherMembers.length > 0 ? otherMembers[0] : undefined;

  // Subscribe to the last chat message
  const last = use$(
    () =>
      from(
        group.history.subscribe({ kinds: [kinds.ChatMessage], limit: 1 }),
      ).pipe(map((rumors) => rumors[0])),
    [group],
  );
  const lastMessageSender = useMemo(
    () => last && castUser(last.pubkey, eventStore),
    [last],
  );
  const lastSenderName = use$(lastMessageSender?.profile$.displayName);

  const subtitle = last
    ? lastSenderName
      ? `${lastSenderName}: ${last.content}`
      : last.content
    : description ||
      `${allMembers.length} ${allMembers.length === 1 ? "member" : "members"}`;

  const [showLeave, setShowLeave] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const handleLeave = async () => {
    if (!client) return;
    try {
      setIsLeaving(true);
      await client.leaveGroup(group.id);
      navigate("/groups", { replace: true });
    } catch (error) {
      console.error("Failed to leave group:", error);
    } finally {
      setIsLeaving(false);
      setShowLeave(false);
    }
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <Link
            to={`/groups/${group.idStr}`}
            className={`hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center gap-3 border-b text-sm leading-tight last:border-b-0 p-4 ${
              isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""
            }`}
          >
            {/* Avatar stack */}
            <AvatarGroup className="shrink-0">
              {visibleAvatars.map((pk) => (
                <UserAvatar
                  key={pk}
                  pubkey={pk}
                  size="sm"
                  className="ring-background ring-2"
                />
              ))}
              {overflowCount > 0 && (
                <AvatarGroupCount>+{overflowCount}</AvatarGroupCount>
              )}
            </AvatarGroup>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate flex items-center gap-2">
                <span className="truncate">
                  {otherPubkey ? <UserName pubkey={otherPubkey} /> : name}
                </span>
                {hasUnread && (
                  <span
                    className="h-2 w-2 rounded-full bg-destructive shrink-0"
                    aria-label="Unread messages"
                    title="Unread messages"
                  />
                )}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {subtitle}
              </div>
            </div>
          </Link>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            variant="destructive"
            onSelect={() => setShowLeave(true)}
          >
            Leave group
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Leave confirmation */}
      <AlertDialog open={showLeave} onOpenChange={setShowLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Leave &ldquo;
              {otherPubkey ? <UserName pubkey={otherPubkey} /> : name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will publish a self-remove proposal to the group relays.
              Other members will see that you left. Your local data for this
              group will also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLeaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLeave} disabled={isLeaving}>
              {isLeaving ? "Leaving…" : "Leave group"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function GroupList({ groups }: { groups: AppGroup[] | undefined }) {
  if (groups === undefined) {
    return (
      <div className="p-4 text-sm text-muted-foreground text-center">
        Loading...
      </div>
    );
  }
  if (groups.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground text-center">
        No groups yet
      </div>
    );
  }
  return (
    <>
      {groups.map((group) => (
        <GroupItem key={group.idStr} group={group} />
      ))}
    </>
  );
}

function AllGroupsList() {
  const groups = use$(liveGroups$);
  return <GroupList groups={groups} />;
}

function DirectGroupsList() {
  const groups = use$(liveGroups$);
  const account = use$(accounts.active$);
  const dms = groups?.filter((g) => isDirect(g, account?.pubkey));
  return <GroupList groups={dms} />;
}

function MultiGroupsList() {
  const groups = use$(liveGroups$);
  const account = use$(accounts.active$);
  const multi = groups?.filter((g) => !isDirect(g, account?.pubkey));
  return <GroupList groups={multi} />;
}

function DesktopGroupsLayout() {
  return (
    <DesktopShell
      title="Groups"
      sidebar={<GroupsListContent />}
      scroll={false}
    />
  );
}

function MobileGroupsLayout() {
  return <Outlet />;
}

/** Group list with Create button and All/1:1/Groups tabs. Exported for mobile index. */
export function GroupsListContent() {
  return (
    <div className="flex flex-col">
      <Link
        to="/groups/create"
        className="m-2 bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-9 px-4 py-2"
      >
        Create Group
      </Link>
      <Tabs defaultValue="all" className="w-full">
        <TabsList variant="line" className="w-full px-2 border-b rounded-none">
          <TabsTrigger value="all" className="flex-1">
            All
          </TabsTrigger>
          <TabsTrigger value="dm" className="flex-1">
            1:1
          </TabsTrigger>
          <TabsTrigger value="group" className="flex-1">
            Groups
          </TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <AllGroupsList />
        </TabsContent>
        <TabsContent value="dm">
          <DirectGroupsList />
        </TabsContent>
        <TabsContent value="group">
          <MultiGroupsList />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function GroupsPage() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileGroupsLayout /> : <DesktopGroupsLayout />;
}

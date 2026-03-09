import { use$ } from "applesauce-react/hooks";
import { getGroupMembers } from "@internet-privacy/marmot-ts";
import type { AppGroup } from "@/lib/marmot-client";
import { Link, Outlet, useLocation } from "react-router";

import { AppSidebar } from "@/components/app-sidebar";
import { UserAvatar } from "@/components/nostr-user";
import { AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { SidebarInset } from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import accounts from "@/lib/accounts";
import { liveGroups$ } from "@/lib/marmot-client";
import { getGroupSubscriptionManager } from "@/lib/runtime";

const MAX_AVATARS = 3;

/** Returns true if the group is a 1:1 direct message (exactly 2 members). */
function isDirect(group: AppGroup, selfPubkey: string | undefined): boolean {
  const members = getGroupMembers(group.state);
  if (members.length !== 2) return false;
  return selfPubkey ? members.includes(selfPubkey) : true;
}

function GroupItem({ group }: { group: AppGroup }) {
  const location = useLocation();
  const isActive = location.pathname.startsWith(`/groups/${group.idStr}`);
  const marmotData = group.groupData;
  const name = marmotData?.name || "Unnamed Group";
  const description = marmotData?.description || "";

  const account = use$(accounts.active$);
  const selfPubkey = account?.pubkey;

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

  const subtitle =
    description ||
    `${allMembers.length} ${allMembers.length === 1 ? "member" : "members"}`;

  return (
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
          <span className="truncate">{name}</span>
          {hasUnread && (
            <span
              className="h-2 w-2 rounded-full bg-destructive shrink-0"
              aria-label="Unread messages"
              title="Unread messages"
            />
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
      </div>
    </Link>
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

export default function GroupsPage() {
  return (
    <>
      <AppSidebar title="Groups">
        <div className="flex flex-col">
          <Link
            to="/groups/create"
            className="m-2 bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-9 px-4 py-2"
          >
            Create Group
          </Link>
          <Tabs defaultValue="all" className="w-full">
            <TabsList
              variant="line"
              className="w-full px-2 border-b rounded-none"
            >
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
      </AppSidebar>
      <SidebarInset>
        {/* Detail sub-pages */}
        <Outlet />
      </SidebarInset>
    </>
  );
}

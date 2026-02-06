import { use$ } from "applesauce-react/hooks";
import { GroupRumorHistory, MarmotGroup } from "marmot-ts";
import { Link, Outlet, useLocation } from "react-router";

import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import { getGroupSubscriptionManager } from "@/lib/runtime";
import { liveGroups$ } from "../lib/marmot-client";

function GroupItem({ group }: { group: MarmotGroup<GroupRumorHistory> }) {
  const location = useLocation();
  const isActive = location.pathname === `/groups/${group.idStr}`;
  const marmotData = group.groupData;
  const name = marmotData?.name || "Unnamed Group";

  const groupMgr = getGroupSubscriptionManager();
  const unreadGroups = use$(groupMgr?.unreadGroupIds$ ?? undefined);
  const hasUnread = Array.isArray(unreadGroups)
    ? unreadGroups.includes(group.idStr)
    : false;

  return (
    <Link
      to={`/groups/${group.idStr}`}
      className={`hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center gap-3 border-b text-sm leading-tight last:border-b-0 p-4 ${
        isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""
      }`}
    >
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
        <div className="text-xs text-muted-foreground truncate font-mono">
          {group.idStr.slice(0, 16)}...
        </div>
      </div>
    </Link>
  );
}

export default function GroupsPage() {
  const groups = use$(liveGroups$);

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
          {groups && groups.length > 0 ? (
            groups.map((group) => <GroupItem key={group.idStr} group={group} />)
          ) : (
            <div className="p-4 text-sm text-muted-foreground text-center">
              {groups === undefined ? "Loading..." : "No groups yet"}
            </div>
          )}
        </div>
      </AppSidebar>
      <SidebarInset>
        {/* Detail sub-pages */}
        <Outlet />
      </SidebarInset>
    </>
  );
}

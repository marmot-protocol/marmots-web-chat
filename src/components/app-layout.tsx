import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { Plus, QrCode, Settings } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { MyQrDialog } from "@/components/marmot/my-qr-dialog";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Jdenticon } from "@/components/jdenticon";
import { UserAvatar, UserName } from "@/components/user";
import { useChat, useWatchedGroups } from "@/hooks/use-marmot";
import { NewGroupDialog } from "@/components/marmot/new-group-dialog";
import { InvitesPanel } from "@/components/marmot/invites-panel";

function GroupList() {
  const groups = useWatchedGroups();
  // Subscribe to snapshot so renames (stateChanged) re-render the list.
  useChat();

  if (groups.length === 0) {
    return (
      <p className="px-2 py-4 text-center text-sm text-muted-foreground">
        No groups yet. Create one to start chatting.
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {groups.map((group) => (
        <NavLink
          key={group.idStr}
          to={`/groups/${group.idStr}`}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
              isActive ? "bg-accent" : "hover:bg-accent/50",
            )
          }
        >
          <span className="size-8 shrink-0 overflow-hidden rounded-md bg-muted">
            <Jdenticon value={group.idStr} size={32} />
          </span>
          <span className="truncate">
            {group.groupData?.name || group.idStr.slice(0, 8)}
          </span>
        </NavLink>
      ))}
    </div>
  );
}

export function AppLayout() {
  const snapshot = useChat();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const location = useLocation();
  const [newGroup, setNewGroup] = useState(false);
  const [showQr, setShowQr] = useState(false);

  // On mobile, show the sidebar OR the detail pane, never both. The list lives
  // at /groups; everything else (a group chat, settings) is a detail view.
  const onListRoute = location.pathname === "/groups";
  const showSidebar = !isMobile || onListRoute;
  const showMain = !isMobile || !onListRoute;

  return (
    <div className="flex h-dvh">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r",
          isMobile ? "w-full" : "w-80",
          !showSidebar && "hidden",
        )}
      >
        <div className="flex items-center justify-between border-b p-3">
          <span className="font-semibold">Marmot Chat</span>
          <Button size="icon" variant="ghost" onClick={() => setNewGroup(true)}>
            <Plus className="size-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-2">
          <InvitesPanel />
          <GroupList />
        </div>

        <div className="flex items-center gap-2 border-t p-2">
          {snapshot && (
            <>
              <UserAvatar pubkey={snapshot.me.pubkey} size={32} />
              <div className="min-w-0 flex-1">
                <UserName
                  pubkey={snapshot.me.pubkey}
                  className="block truncate text-sm font-medium"
                />
                <span className="text-xs text-muted-foreground">
                  {snapshot.keyPackages.unused} key package(s)
                </span>
              </div>
            </>
          )}
          <Button
            size="icon"
            variant="ghost"
            title="Show my invite QR"
            onClick={() => setShowQr(true)}
          >
            <QrCode className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => navigate("/settings")}>
            <Settings className="size-4" />
          </Button>
        </div>
      </aside>

      <main className={cn("flex-1 overflow-hidden", !showMain && "hidden")}>
        <Outlet />
      </main>

      <NewGroupDialog open={newGroup} onOpenChange={setNewGroup} />
      {snapshot && (
        <MyQrDialog
          npub={snapshot.me.npub}
          open={showQr}
          onOpenChange={setShowQr}
        />
      )}
    </div>
  );
}

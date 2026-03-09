import { ArrowLeftIcon, Loader2, Menu, XCircle } from "lucide-react";
import { useState } from "react";
import { Outlet } from "react-router";

import { PageHeader } from "@/components/page-header";
import { SubscriptionStatusButton } from "@/components/subscription-status-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { withActiveAccount } from "@/components/with-active-account";
import { GroupContext } from "@/contexts/group-context";
import { GroupEventStoreContext } from "@/contexts/group-event-store-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

import { GroupDetailsDrawer } from "./components/group-details-drawer";
import { GroupTabLinks } from "./components/group-tab-links";
import { useGroupDetail } from "./components/use-group-detail";

// ─── Shared context wrapper ────────────────────────────────────────────────────

/**
 * Wraps both desktop and mobile layouts' `<Outlet />` with the two group
 * contexts so all child routes can access group state without prop-drilling.
 */
function GroupContextProviders({
  data,
  children,
}: {
  data: ReturnType<typeof useGroupDetail>;
  children: React.ReactNode;
}) {
  const {
    groupEventStore,
    group,
    isAdmin,
    loadingMore,
    loadingDone,
    loadMoreMessages,
  } = data;
  if (!group) return null;
  return (
    <GroupEventStoreContext.Provider value={groupEventStore}>
      <GroupContext.Provider
        value={{ group, isAdmin, loadingMore, loadingDone, loadMoreMessages }}
      >
        {children}
      </GroupContext.Provider>
    </GroupEventStoreContext.Provider>
  );
}

// ─── Desktop layout ────────────────────────────────────────────────────────────

function DesktopGroupDetailLayout() {
  const data = useGroupDetail();
  const { id, group, groupName, isAdmin, navigate } = data;
  const [detailsOpen, setDetailsOpen] = useState(false);

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

  if (group === null) return null;

  const tabClass = (active: boolean) =>
    cn(
      "px-4 py-2 text-sm font-medium transition-colors hover:text-foreground",
      active
        ? "text-foreground border-b-2 border-primary"
        : "text-muted-foreground",
    );

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

      <div className="flex gap-1 px-4 border-b">
        <GroupTabLinks isAdmin={isAdmin} tabClassName={tabClass} />
      </div>

      <GroupContextProviders data={data}>
        <Outlet />
      </GroupContextProviders>
    </>
  );
}

// ─── Mobile layout ─────────────────────────────────────────────────────────────

function MobileGroupDetailLayout() {
  const data = useGroupDetail();
  const { id, group, groupName, isAdmin, navigate } = data;
  const [detailsOpen, setDetailsOpen] = useState(false);

  const backHeader = (title: string) => (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b bg-background flex items-center px-4 gap-3">
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0"
        onClick={() => navigate("/groups")}
      >
        <ArrowLeftIcon size={20} />
      </Button>
      <span className="flex-1 text-base font-medium truncate">{title}</span>
    </header>
  );

  if (!id) {
    return (
      <div className="flex flex-col h-dvh overflow-hidden bg-background">
        {backHeader("Invalid Group")}
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
      <div className="flex flex-col h-dvh overflow-hidden bg-background">
        {backHeader("Loading...")}
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

  if (group === null) return null;

  const tabClass = (active: boolean) =>
    cn(
      "px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors shrink-0 hover:text-foreground",
      active
        ? "text-foreground border-b-2 border-primary"
        : "text-muted-foreground",
    );

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-background">
      {/* Fixed header: back button + group name + kebab */}
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
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => setDetailsOpen(true)}
        >
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
        <GroupTabLinks isAdmin={isAdmin} tabClassName={tabClass} />
      </div>

      {/* Content: offset past fixed header (56px) + tab strip (41px) */}
      <main className="flex flex-col flex-1 overflow-hidden pt-[calc(56px+41px)]">
        <GroupContextProviders data={data}>
          <Outlet />
        </GroupContextProviders>
      </main>

      {/* Details drawer — mobile only, triggered by kebab */}
      <GroupDetailsDrawer
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        group={group}
      />
    </div>
  );
}

// ─── Switch ────────────────────────────────────────────────────────────────────

function GroupDetailPage() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileGroupDetailLayout /> : <DesktopGroupDetailLayout />;
}

export default withActiveAccount(GroupDetailPage);

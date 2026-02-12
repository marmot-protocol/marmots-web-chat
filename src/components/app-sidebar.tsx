import { getDisplayName, getProfilePicture } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  GripVerticalIcon,
  InboxIcon,
  KeyIcon,
  MenuIcon,
  MessageSquareIcon,
  PinIcon,
  PinOffIcon,
  Settings,
  ToolCaseIcon,
  UsersIcon,
} from "lucide-react";
import * as React from "react";
import { type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import accountManager from "@/lib/accounts";
import { liveUnreadInvites$ } from "@/lib/marmot-client";
import { eventStore } from "@/lib/nostr";
import { getGroupSubscriptionManager } from "@/lib/runtime";
import { pinnedTabs$ } from "@/lib/settings";

export const TOP_TABS = [
  {
    title: "Groups",
    url: "/groups",
    icon: MessageSquareIcon,
  },
  {
    title: "Invites",
    url: "/invites",
    icon: InboxIcon,
  },
  {
    title: "Contacts",
    url: "/contacts",
    icon: UsersIcon,
  },
  {
    title: "Key Packages",
    url: "/key-packages",
    icon: KeyIcon,
  },
  {
    title: "Tools",
    url: "/tools",
    icon: ToolCaseIcon,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

function TabManager() {
  const pinned = use$(pinnedTabs$);
  const [draggedItem, setDraggedItem] = React.useState<string | null>(null);
  const [dragOverZone, setDragOverZone] = React.useState<
    "pinned" | "available" | null
  >(null);
  const [dragOverIndex, setDragOverIndex] = React.useState<number | null>(null);

  const pinnedTabs = pinned
    .map((url) => TOP_TABS.find((t) => t.url === url))
    .filter((t) => t !== undefined);
  const availableTabs = TOP_TABS.filter((t) => !pinned.includes(t.url));

  const handleDragStart = (url: string) => {
    setDraggedItem(url);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverZone(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (
    e: React.DragEvent,
    zone: "pinned" | "available",
    index?: number,
  ) => {
    e.preventDefault();
    setDragOverZone(zone);
    setDragOverIndex(index ?? null);
  };

  const handleDrop = (
    e: React.DragEvent,
    zone: "pinned" | "available",
    dropIndex?: number,
  ) => {
    e.preventDefault();
    if (!draggedItem) return;

    if (zone === "pinned") {
      const newPinned = pinned.filter((url) => url !== draggedItem);
      if (dropIndex !== undefined) {
        newPinned.splice(dropIndex, 0, draggedItem);
      } else {
        newPinned.push(draggedItem);
      }
      pinnedTabs$.next(newPinned);
    } else {
      pinnedTabs$.next(pinned.filter((url) => url !== draggedItem));
    }

    handleDragEnd();
  };

  const moveUp = (url: string) => {
    const index = pinned.indexOf(url);
    if (index > 0) {
      const newPinned = [...pinned];
      [newPinned[index - 1], newPinned[index]] = [
        newPinned[index],
        newPinned[index - 1],
      ];
      pinnedTabs$.next(newPinned);
    }
  };

  const moveDown = (url: string) => {
    const index = pinned.indexOf(url);
    if (index < pinned.length - 1) {
      const newPinned = [...pinned];
      [newPinned[index], newPinned[index + 1]] = [
        newPinned[index + 1],
        newPinned[index],
      ];
      pinnedTabs$.next(newPinned);
    }
  };

  const pinTab = (url: string) => {
    pinnedTabs$.next([...pinned, url]);
  };

  const unpinTab = (url: string) => {
    pinnedTabs$.next(pinned.filter((t) => t !== url));
  };

  return (
    <div className="flex flex-col gap-4 p-2">
      {/* Pinned Section */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground mb-2 px-2">
          Pinned Tabs
        </div>
        <div
          className={`min-h-12 rounded-lg border-2 border-dashed p-2 space-y-1 ${
            dragOverZone === "pinned"
              ? "border-primary bg-accent/50"
              : "border-border"
          }`}
          onDragOver={(e) => handleDragOver(e, "pinned")}
          onDrop={(e) => handleDrop(e, "pinned")}
        >
          {pinnedTabs.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-2">
              Drag tabs here to pin them
            </div>
          ) : (
            pinnedTabs.map((tab, index) => (
              <div
                key={tab.url}
                draggable
                onDragStart={() => handleDragStart(tab.url)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, "pinned", index)}
                onDrop={(e) => handleDrop(e, "pinned", index)}
                className={`flex items-center gap-2 px-3 py-2 rounded-md bg-secondary hover:bg-secondary/80 cursor-move ${
                  draggedItem === tab.url ? "opacity-50" : ""
                } ${dragOverIndex === index && dragOverZone === "pinned" ? "border-t-2 border-primary" : ""}`}
              >
                <GripVerticalIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <tab.icon className="h-4 w-4 shrink-0" />
                <span className="text-sm flex-1">{tab.title}</span>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => moveUp(tab.url)}
                    disabled={index === 0}
                  >
                    <ChevronUpIcon className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => moveDown(tab.url)}
                    disabled={index === pinnedTabs.length - 1}
                  >
                    <ChevronDownIcon className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => unpinTab(tab.url)}
                  >
                    <PinOffIcon className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Available Section */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground mb-2 px-2">
          Available Tabs
        </div>
        <div
          className={`min-h-12 rounded-lg border-2 border-dashed p-2 space-y-1 ${
            dragOverZone === "available"
              ? "border-primary bg-accent/50"
              : "border-border"
          }`}
          onDragOver={(e) => handleDragOver(e, "available")}
          onDrop={(e) => handleDrop(e, "available")}
        >
          {availableTabs.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-2">
              All tabs are pinned
            </div>
          ) : (
            availableTabs.map((tab) => (
              <div
                key={tab.url}
                draggable
                onDragStart={() => handleDragStart(tab.url)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent cursor-move ${
                  draggedItem === tab.url ? "opacity-50" : ""
                }`}
              >
                <GripVerticalIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <tab.icon className="h-4 w-4 shrink-0" />
                <span className="text-sm flex-1">{tab.title}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => pinTab(tab.url)}
                >
                  <PinIcon className="h-3 w-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function AppSwitcher() {
  const location = useLocation();
  const navigate = useNavigate();
  const unreadInvites = use$(liveUnreadInvites$);
  const groupsUnread = use$(
    getGroupSubscriptionManager()?.unreadGroupIds$ ?? undefined,
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Quick Navigation Grid */}
      <div className="grid grid-cols-3 gap-2 p-2">
        {TOP_TABS.map((item) => {
          const isActive = location.pathname.startsWith(item.url);
          const hasNotification =
            (item.url === "/groups" && (groupsUnread?.length ?? 0) > 0) ||
            (item.url === "/invites" && (unreadInvites?.length ?? 0) > 0);

          return (
            <Button
              key={item.title}
              variant={isActive ? "secondary" : "ghost"}
              className="h-20 flex-col gap-2 relative"
              onClick={() => navigate(item.url)}
            >
              {hasNotification && (
                <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive" />
              )}
              <item.icon className="h-6 w-6" />
              <span className="text-xs">{item.title}</span>
            </Button>
          );
        })}
      </div>

      <hr />

      {/* Tab Manager */}
      <TabManager />
    </div>
  );
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  children?: ReactNode;
  title?: string;
  footer?: ReactNode;
}

export function AppSidebar({
  children,
  title,
  footer,
  ...props
}: AppSidebarProps) {
  const navigate = useNavigate();
  const active = use$(accountManager.active$);

  const pinnedTabs = use$(pinnedTabs$)
    .map((tab) => TOP_TABS.find((t) => t.url === tab))
    .filter((t) => t !== undefined);

  const [showAppSwitcher, setShowAppSwitcher] = React.useState(false);

  const activeProfile = use$(
    () => active && eventStore.profile(active.pubkey),
    [active?.pubkey],
  );
  const activeAvatar = active
    ? getProfilePicture(
        activeProfile ?? undefined,
        `https://api.dicebear.com/7.x/identicon/svg?seed=${active.pubkey}`,
      )
    : "";
  const activeName = active
    ? getDisplayName(activeProfile ?? undefined, active.pubkey.slice(0, 16))
    : "";

  return (
    <Sidebar collapsible="icon" className="overflow-hidden" {...props}>
      <SidebarHeader className="border-b p-3">
        <div className="flex w-full items-center gap-3">
          {/* Left side: User avatar/account */}
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-10 rounded-lg p-0"
            onClick={() => navigate("/profile")}
          >
            {active ? (
              <Avatar className="h-10 w-10 rounded-lg">
                <AvatarImage src={activeAvatar} alt={activeName} />
                <AvatarFallback className="rounded-lg">
                  {activeName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ) : (
              <Avatar className="h-10 w-10 rounded-lg">
                <AvatarFallback className="rounded-lg">?</AvatarFallback>
              </Avatar>
            )}
          </Button>

          {/* Center: Page title */}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <div className="text-foreground text-base font-medium truncate">
              {title}
            </div>
          </div>

          {/* Right side: App switcher button */}
          <Button
            variant={showAppSwitcher ? "secondary" : "ghost"}
            size="sm"
            className="h-10 w-10 rounded-lg p-0 shrink-0"
            onClick={() => setShowAppSwitcher(!showAppSwitcher)}
          >
            <MenuIcon />
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {pinnedTabs.length > 0 && !showAppSwitcher && (
          <SidebarGroup>
            <SidebarGroupContent>
              {pinnedTabs.map((tab) => (
                <Button key={tab.url} variant="ghost" asChild>
                  <Link to={tab.url}>
                    <tab.icon />
                    <span>{tab.title}</span>
                  </Link>
                </Button>
              ))}
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            {showAppSwitcher ? <AppSwitcher /> : children}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {footer && <SidebarFooter>{footer}</SidebarFooter>}
    </Sidebar>
  );
}

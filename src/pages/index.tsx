import { getGroupMembers } from "@internet-privacy/marmot-ts";
import { IconLoader2, IconUserOff } from "@tabler/icons-react";
import { type User } from "applesauce-common/casts/user";
import { use$ } from "applesauce-react/hooks";
import {
  InboxIcon,
  KeyIcon,
  MessageSquareIcon,
  Server,
  Settings,
  UsersIcon,
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";

import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SidebarInset } from "@/components/ui/sidebar";
import accounts, { user$ } from "@/lib/accounts";
import { liveGroups$ } from "@/lib/marmot-client";
import {
  StartChatDialog,
  useOnlineContactsKeyPackages,
  useStartChat,
} from "@/pages/contacts/components/online-contacts";
import { RecentKeyPackageCard } from "./contacts/components/recent-key-packages";

// ============================================================================
// QuickActionCard
// ============================================================================

function QuickActionCard({
  title,
  description,
  icon: Icon,
  to,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  to: string;
}) {
  return (
    <Link to={to} className="block group">
      <Card className="h-full transition-colors hover:bg-accent/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {title}
          </CardTitle>
          <CardDescription className="text-xs">{description}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}

// ============================================================================
// OnlineContactsSection
// ============================================================================

/**
 * Renders the "Who's Online" grid section.
 * Handles loading, empty-no-contacts, and empty-none-online states.
 */
function OnlineContactsSection() {
  const contacts = use$(user$.contacts$);
  const groups = use$(liveGroups$);
  const account = accounts.active;
  const chat = useStartChat();

  // Build a Set of contact pubkeys that already share a 1:1 group with me
  const existingDmPubkeys = useMemo(() => {
    if (!groups || !account?.pubkey) return new Set<string>();
    const myPubkey = account.pubkey;
    const dmSet = new Set<string>();
    for (const group of groups) {
      const members = getGroupMembers(group.state);
      if (members.length === 2 && members.includes(myPubkey)) {
        for (const pk of members) {
          if (pk !== myPubkey) dmSet.add(pk);
        }
      }
    }
    return dmSet;
  }, [groups, account?.pubkey]);

  // Exclude contacts that already have a DM group
  const contactList = useMemo(
    () =>
      (contacts ?? []).filter((c: User) => !existingDmPubkeys.has(c.pubkey)),
    [contacts, existingDmPubkeys],
  );

  const isLoading = contacts === undefined || groups === undefined;

  const onlineContacts = useOnlineContactsKeyPackages();

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Who's Online</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Contacts with a key package published in the last 24 hours
          </p>
        </div>
        {!isLoading && contactList.length > 0 && (
          <Badge variant="secondary" className="shrink-0 text-xs">
            {contactList.length} to check
          </Badge>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <IconLoader2 className="h-4 w-4 animate-spin" />
          Loading contacts…
        </div>
      )}

      {/* No Nostr contacts at all */}
      {!isLoading && contacts?.length === 0 && (
        <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
          <IconUserOff className="h-5 w-5 shrink-0" />
          <span>
            Follow people on Nostr and they'll appear here when they're ready to
            chat.
          </span>
        </div>
      )}

      {/* Contact grid — cards self-hide when not online */}
      {onlineContacts && onlineContacts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {onlineContacts.map((kp) => (
            <RecentKeyPackageCard
              key={kp.pubkey}
              event={kp}
              onStartChat={chat.startChat}
              isCreating={chat.isCreating}
            />
          ))}
        </div>
      )}

      {/* Progress dialog */}
      <StartChatDialog {...chat} />
    </div>
  );
}

// ============================================================================
// HomePage
// ============================================================================

export default function HomePage() {
  return (
    <>
      <AppSidebar title="marmot-ts Chat" />
      <SidebarInset>
        <PageHeader items={[{ label: "Home" }]} />

        <div className="container mx-auto p-4 space-y-8 max-w-4xl">
          {/* Welcome */}
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">
              Welcome to marmot-ts
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Secure, end-to-end encrypted group chat on Nostr using the MLS
              protocol.
            </p>
          </div>

          {/* Who's Online */}
          <OnlineContactsSection />

          {/* Quick navigation */}
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Navigate
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <QuickActionCard
                title="Groups"
                description="View and manage your encrypted group chats"
                icon={MessageSquareIcon}
                to="/groups"
              />
              <QuickActionCard
                title="Invites"
                description="Check pending group invitations"
                icon={InboxIcon}
                to="/invites"
              />
              <QuickActionCard
                title="Contacts"
                description="Browse contacts and view key packages"
                icon={UsersIcon}
                to="/contacts"
              />
              <QuickActionCard
                title="Key Packages"
                description="Manage your MLS key packages"
                icon={KeyIcon}
                to="/key-packages"
              />
              <QuickActionCard
                title="Relays"
                description="Configure Nostr relay connections"
                icon={Server}
                to="/settings/relays"
              />
              <QuickActionCard
                title="Settings"
                description="Accounts and app preferences"
                icon={Settings}
                to="/settings"
              />
            </div>
          </div>

          {/* Getting started — shown compactly below nav */}
          <Card className="bg-muted/40 border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Getting Started</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1">
              <p>1. Add a Nostr account in Settings</p>
              <p>2. Configure at least one relay in Settings → Relays</p>
              <p>3. Publish a Key Package so contacts can invite you</p>
              <p>4. Start chatting — anyone online will appear above</p>
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </>
  );
}

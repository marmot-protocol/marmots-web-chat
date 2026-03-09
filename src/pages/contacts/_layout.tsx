import { KEY_PACKAGE_RELAY_LIST_KIND } from "@internet-privacy/marmot-ts";
import { IconLock, IconMailbox, IconUsersGroup } from "@tabler/icons-react";
import { castUser, User } from "applesauce-common/casts/user";
import { normalizeToProfilePointer } from "applesauce-core/helpers";
import { npubEncode } from "applesauce-core/helpers/pointers";
import { use$ } from "applesauce-react/hooks";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation } from "react-router";
import { BehaviorSubject } from "rxjs";

import { UserAvatar, UserName } from "@/components/nostr-user";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SidebarInput } from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDebounce } from "@/hooks/use-debounce";
import { useIsMobile } from "@/hooks/use-mobile";
import { user$ } from "@/lib/accounts";
import { liveUnreadInvites$ } from "@/lib/marmot-client";
import { eventLoader, eventStore } from "@/lib/nostr";
import { profileSearch } from "@/lib/search";
import { persist } from "@/lib/settings";
import { withActiveAccount } from "@/components/with-active-account";
import { DesktopShell } from "@/layouts/desktop/shell";
import { MobileShell } from "@/layouts/mobile/shell";

const hasKeyPackageRelays$ = new BehaviorSubject<boolean>(false);
persist("contacts:has-key-package-relays", hasKeyPackageRelays$);

// ============================================================================
// Contacts context
// ============================================================================

export interface ContactsContextValue {
  filteredContacts: User[] | undefined;
  query: string;
  setQuery: (value: string) => void;
  hasKeyPackageRelays: boolean;
  setHasKeyPackageRelays: (value: boolean) => void;
}

const ContactsContext = createContext<ContactsContextValue | null>(null);

/**
 * Hook to access contacts list data (search, filter, MLS toggle).
 * Must be used within ContactsProvider.
 */
export function useContacts() {
  const ctx = useContext(ContactsContext);
  if (!ctx) throw new Error("useContacts must be used within ContactsProvider");
  return ctx;
}

// ============================================================================
// ContactItem — sidebar link row to /contacts/:npub
// ============================================================================

function ContactItem({ user }: { user: User }) {
  const location = useLocation();
  const isActive = location.pathname === `/contacts/${user.npub}`;
  const outboxes = use$(user$.outboxes$);
  const keyPackageRelayList = use$(
    () => user.replaceable(KEY_PACKAGE_RELAY_LIST_KIND, undefined, outboxes),
    [user.pubkey, outboxes?.join(",")],
  );

  const hasKeyPackageRelays = use$(hasKeyPackageRelays$);
  if (hasKeyPackageRelays && !keyPackageRelayList) return null;

  return (
    <Link
      to={`/contacts/${user.npub}`}
      className={`hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex items-center gap-3 border-b p-4 text-sm leading-tight last:border-b-0 relative ${
        isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""
      }`}
    >
      <UserAvatar pubkey={user.pubkey} />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          <UserName pubkey={user.pubkey} />
        </div>
        <div className="text-xs text-muted-foreground truncate font-mono">
          {user.npub.slice(0, 8)}...{user.npub.slice(-8)}
        </div>
      </div>
      {keyPackageRelayList && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="absolute top-2 right-2">
              <IconLock className="size-4 text-green-600 dark:text-green-400" />
            </div>
          </TooltipTrigger>
          <TooltipContent>Can be messaged using MarmotTS</TooltipContent>
        </Tooltip>
      )}
    </Link>
  );
}

// ============================================================================
// Contacts provider (owns search/filter state and provides context)
// ============================================================================

function useContactsData(): ContactsContextValue {
  const contacts = use$(user$.contacts$);
  const [query, setQuery] = useState("");

  const user = use$(user$);
  const outboxes = use$(user$.outboxes$);
  use$(
    () =>
      user &&
      eventLoader({
        kind: 3,
        pubkey: user.pubkey,
        // @ts-ignore
        cache: false,
        relays: outboxes,
      }),
    [user, outboxes],
  );

  const debouncedQuery = useDebounce(query, 500);

  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    if (!debouncedQuery.trim()) return contacts;

    const trimmed = debouncedQuery.trim();

    let directPubkey: string | null = null;
    try {
      const pointer = normalizeToProfilePointer(trimmed);
      directPubkey = pointer?.pubkey ?? null;
    } catch {
      directPubkey = null;
    }

    const searchResults = profileSearch
      .search(trimmed.toLowerCase())
      .map((r) => castUser(r.item.pubkey, eventStore));

    if (!directPubkey) return searchResults;

    const directUser = castUser(directPubkey, eventStore);
    const directNpub = npubEncode(directPubkey);
    return [directUser, ...searchResults.filter((u) => u.npub !== directNpub)];
  }, [contacts, debouncedQuery]);

  const hasKeyPackageRelays = use$(hasKeyPackageRelays$);

  return {
    filteredContacts,
    query,
    setQuery,
    hasKeyPackageRelays,
    setHasKeyPackageRelays: (v: boolean) => hasKeyPackageRelays$.next(v),
  };
}

export function ContactsProvider({ children }: { children: ReactNode }) {
  const value = useContactsData();
  return (
    <ContactsContext.Provider value={value}>
      {children}
    </ContactsContext.Provider>
  );
}

// ============================================================================
// Composable components (use within ContactsProvider)
// ============================================================================

/** Search input and MLS filter toggle. */
export function ContactListSearchForm() {
  const { query, setQuery, hasKeyPackageRelays, setHasKeyPackageRelays } =
    useContacts();
  return (
    <div className="p-2 border-b flex gap-2">
      <SidebarInput
        placeholder="Search contacts..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <Label className="flex items-center gap-2 text-sm shrink-0">
        <span>MLS</span>
        <Switch
          className="shadow-none"
          checked={hasKeyPackageRelays}
          onCheckedChange={setHasKeyPackageRelays}
        />
      </Label>
    </div>
  );
}

/** List of contact items or empty state. */
export function ContactList() {
  const { filteredContacts, query } = useContacts();
  return (
    <>
      {filteredContacts && filteredContacts.length > 0 ? (
        filteredContacts.map((contact) => (
          <ContactItem key={contact.pubkey} user={contact} />
        ))
      ) : (
        <div className="p-4 text-sm text-muted-foreground text-center">
          {query.trim()
            ? "No contacts found matching your search"
            : "No contacts yet"}
        </div>
      )}
    </>
  );
}

/** Desktop: search form at top, then list. Use in sidebar. */
export function ContactListContent() {
  return (
    <div className="flex flex-col">
      <ContactListSearchForm />
      <ContactList />
    </div>
  );
}

// ============================================================================
// Layouts
// ============================================================================

function DesktopContactsLayout() {
  return <DesktopShell title="Contacts" sidebar={<ContactListContent />} />;
}

function MobileContactsLayout() {
  return <MobileShell title="Contacts" />;
}

function ContactsPage() {
  const isMobile = useIsMobile();
  return (
    <ContactsProvider>
      {isMobile ? <MobileContactsLayout /> : <DesktopContactsLayout />}
    </ContactsProvider>
  );
}

export default withActiveAccount(ContactsPage);

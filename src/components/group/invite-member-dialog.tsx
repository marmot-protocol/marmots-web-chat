import { IconLock } from "@tabler/icons-react";
import { castUser, User } from "applesauce-common/casts/user";
import { mapEventsToTimeline } from "applesauce-core";
import { normalizeToProfilePointer, npubEncode } from "applesauce-core/helpers";
import type { NostrEvent } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { Loader2, XCircle } from "lucide-react";
import type { MarmotGroup } from "marmot-ts";
import {
  getKeyPackageCipherSuiteId,
  getKeyPackageClient,
  getKeyPackageRelayList,
  KEY_PACKAGE_RELAY_LIST_KIND,
} from "marmot-ts";
import { useEffect, useMemo, useState } from "react";
import { map } from "rxjs/operators";
import { ciphersuites, type CiphersuiteId } from "ts-mls/crypto/ciphersuite.js";

import { UserAvatar, UserName } from "@/components/nostr-user";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { user$ } from "@/lib/accounts";
import { eventStore, pool } from "@/lib/nostr";
import { profileSearch } from "@/lib/search";
import { formatTimeAgo } from "@/lib/time";

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: MarmotGroup<any>;
  isAdmin: boolean;
}

interface UserSelectionStepProps {
  onSelectPubkey: (pubkey: string) => void;
}

// User item component that checks MLS capability
function UserItem({
  user,
  onSelect,
}: {
  user: User;
  onSelect: (pubkey: string) => void;
}) {
  const outboxes = use$(user$.outboxes$);
  const keyPackageRelayList = use$(
    () => user.replaceable(KEY_PACKAGE_RELAY_LIST_KIND, undefined, outboxes),
    [user.pubkey, outboxes?.join(",")],
  );

  // Only show users with MLS capability
  if (!keyPackageRelayList) return null;

  return (
    <button
      onClick={() => onSelect(user.pubkey)}
      className="w-full flex items-center gap-3 p-4 text-left hover:bg-sidebar-accent transition-colors"
    >
      <UserAvatar pubkey={user.pubkey} size="md" />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          <UserName pubkey={user.pubkey} />
        </div>
        <div className="text-xs text-muted-foreground truncate font-mono">
          {user.npub.slice(0, 8)}...{user.npub.slice(-8)}
        </div>
      </div>
      <IconLock className="size-4 text-green-600 dark:text-green-400 shrink-0" />
    </button>
  );
}

function UserSelectionStep({ onSelectPubkey }: UserSelectionStepProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebounce(searchQuery, 500);
  const contacts = use$(user$.contacts$);

  // Filter contacts based on search query (MLS filtering happens in UserItem)
  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    if (!debouncedQuery.trim()) return contacts;

    const trimmed = debouncedQuery.trim();

    // Support direct pubkey/npub paste
    let directPubkey: string | null = null;
    try {
      const pointer = normalizeToProfilePointer(trimmed);
      directPubkey = pointer?.pubkey ?? null;
    } catch {
      directPubkey = null;
    }

    // Search using profileSearch
    const searchResults = profileSearch
      .search(trimmed.toLowerCase())
      .map((r) => castUser(r.item.pubkey, eventStore));

    if (!directPubkey) return searchResults;

    const directUser = castUser(directPubkey, eventStore);
    const directNpub = npubEncode(directPubkey);
    return [directUser, ...searchResults.filter((u) => u.npub !== directNpub)];
  }, [contacts, debouncedQuery]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Input
          placeholder="Search contacts or paste npub..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="h-[300px] border rounded-lg overflow-y-auto">
        {filteredContacts && filteredContacts.length > 0 ? (
          <div className="divide-y">
            {filteredContacts.map((contact) => (
              <UserItem
                key={contact.pubkey}
                user={contact}
                onSelect={onSelectPubkey}
              />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-muted-foreground">
            {searchQuery.trim()
              ? "No MLS-capable contacts found matching your search"
              : "No contacts with MLS capability found. Ask your contacts to set up MarmotTS."}
          </div>
        )}
      </div>
    </div>
  );
}

interface KeyPackageSelectionStepProps {
  selectedPubkey: string;
  groupCipherSuite: CiphersuiteId;
  selectedKeyPackageEventId: string;
  onSelectKeyPackage: (eventId: string) => void;
}

function KeyPackageSelectionStep({
  selectedPubkey,
  groupCipherSuite,
  selectedKeyPackageEventId,
  onSelectKeyPackage,
}: KeyPackageSelectionStepProps) {
  const selectedUser = useMemo(
    () => castUser(selectedPubkey, eventStore),
    [selectedPubkey],
  );
  const outboxes = use$(user$.outboxes$);

  // Get key package relay list for the selected user
  const keyPackageRelayList = use$(
    () =>
      selectedUser.replaceable(
        KEY_PACKAGE_RELAY_LIST_KIND,
        undefined,
        outboxes,
      ),
    [selectedPubkey, outboxes?.join(",")],
  );

  const keyPackageRelays = useMemo(() => {
    return keyPackageRelayList && getKeyPackageRelayList(keyPackageRelayList);
  }, [keyPackageRelayList]);

  // Fetch key packages for the selected user
  const keyPackages = use$(() => {
    if (!selectedPubkey || !keyPackageRelays) return;

    return pool
      .request(keyPackageRelays, {
        kinds: [443],
        authors: [selectedPubkey],
        limit: 50,
      })
      .pipe(
        mapEventsToTimeline(),
        map((arr) => [...arr] as NostrEvent[]),
      );
  }, [selectedPubkey, keyPackageRelays?.join(",")]);

  // Filter and sort key packages
  const compatibleKeyPackages = useMemo(() => {
    if (!keyPackages) return [];

    return keyPackages
      .filter((event) => {
        const cipherSuiteId = getKeyPackageCipherSuiteId(event);
        return cipherSuiteId === groupCipherSuite;
      })
      .sort((a, b) => b.created_at - a.created_at); // Most recent first
  }, [keyPackages, groupCipherSuite]);

  if (!keyPackageRelays) {
    return (
      <Alert>
        <AlertDescription>
          Loading key package relay list for this user...
        </AlertDescription>
      </Alert>
    );
  }

  if (!keyPackages) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (compatibleKeyPackages.length === 0) {
    return (
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertDescription>
          No compatible key packages found for this user. The user needs to
          publish a key package with a cipher suite matching the group's cipher
          suite.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Select a key package to send the invite. Showing{" "}
        {compatibleKeyPackages.length} compatible key package
        {compatibleKeyPackages.length === 1 ? "" : "s"}.
      </div>

      <div className="h-[300px] overflow-y-auto">
        <div className="space-y-3">
          {compatibleKeyPackages.map((event, index) => {
            const client = getKeyPackageClient(event);
            const timeAgo = formatTimeAgo(event.created_at);
            const isRecommended = index === 0; // First one is newest

            return (
              <button
                key={event.id}
                onClick={() => onSelectKeyPackage(event.id)}
                className={`w-full text-left border rounded-lg p-4 hover:border-primary transition-colors ${
                  selectedKeyPackageEventId === event.id
                    ? "border-primary bg-primary/5"
                    : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground font-mono truncate">
                      {event.id.slice(0, 16)}...
                    </div>
                  </div>
                  {isRecommended && (
                    <Badge variant="default" className="shrink-0">
                      Recommended
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{timeAgo}</span>
                  <span className="text-xs text-muted-foreground">
                    {client?.name || "Unknown client"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedKeyPackageEventId && (
        <div className="p-3 border rounded-lg bg-muted/50">
          <div className="text-xs text-muted-foreground mb-1">
            Selected key package
          </div>
          <div className="text-sm font-mono truncate">
            {selectedKeyPackageEventId.slice(0, 32)}...
          </div>
        </div>
      )}
    </div>
  );
}

export function InviteMemberDialog({
  open,
  onOpenChange,
  group,
  isAdmin,
}: InviteMemberDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedPubkey, setSelectedPubkey] = useState("");
  const [selectedKeyPackageEventId, setSelectedKeyPackageEventId] =
    useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Get group's cipher suite
  const groupCipherSuite: CiphersuiteId =
    ciphersuites[group.state.groupContext.cipherSuite];

  // Fetch key packages for validation in invite handler
  const selectedUser = useMemo(
    () => (selectedPubkey ? castUser(selectedPubkey, eventStore) : null),
    [selectedPubkey],
  );
  const outboxes = use$(user$.outboxes$);

  const keyPackageRelayList = use$(
    () =>
      selectedUser?.replaceable(
        KEY_PACKAGE_RELAY_LIST_KIND,
        undefined,
        outboxes,
      ),
    [selectedPubkey, outboxes?.join(",")],
  );

  const keyPackageRelays = useMemo(() => {
    return keyPackageRelayList && getKeyPackageRelayList(keyPackageRelayList);
  }, [keyPackageRelayList]);

  const contactKeyPackages = use$(() => {
    if (!selectedPubkey || !keyPackageRelays) return;
    return pool
      .request(keyPackageRelays, {
        kinds: [443],
        authors: [selectedPubkey],
        limit: 50,
      })
      .pipe(
        mapEventsToTimeline(),
        map((arr) => [...arr] as NostrEvent[]),
      );
  }, [selectedPubkey, keyPackageRelays?.join(",")]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStep(1);
      setSelectedPubkey("");
      setSelectedKeyPackageEventId("");
      setInviteError(null);
    }
  }, [open]);

  const handleInvite = async () => {
    if (!group) return;

    setInviteError(null);

    if (!isAdmin) {
      setInviteError("Only group admins can invite members");
      return;
    }

    const selectedEvent =
      contactKeyPackages?.find(
        (e: NostrEvent) => e.id === selectedKeyPackageEventId,
      ) ?? null;
    if (!selectedEvent) {
      setInviteError("Select a KeyPackage event to invite");
      return;
    }

    try {
      setIsInviting(true);
      await group.inviteByKeyPackageEvent(selectedEvent);
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to invite member:", err);
      setInviteError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? "Select User" : "Select Key Package"}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Search for a contact or paste their npub to invite"
              : "Choose a key package to send the invite"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isAdmin && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                Only group admins can invite members.
              </AlertDescription>
            </Alert>
          )}

          {step === 1 ? (
            <UserSelectionStep
              onSelectPubkey={(pubkey) => {
                setSelectedPubkey(pubkey);
                setStep(2);
              }}
            />
          ) : (
            <KeyPackageSelectionStep
              selectedPubkey={selectedPubkey}
              groupCipherSuite={groupCipherSuite}
              selectedKeyPackageEventId={selectedKeyPackageEventId}
              onSelectKeyPackage={setSelectedKeyPackageEventId}
            />
          )}

          {inviteError && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{inviteError}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          {step === 2 && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setStep(1);
                  setSelectedKeyPackageEventId("");
                  setInviteError(null);
                }}
              >
                Back
              </Button>
              <Button
                onClick={handleInvite}
                disabled={!selectedKeyPackageEventId || !isAdmin || isInviting}
              >
                {isInviting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Inviting...
                  </>
                ) : (
                  "Send invite"
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import {
  getGroupMembers,
  getKeyPackageCipherSuiteId,
  getKeyPackageClient,
  getKeyPackageRelayList,
  KEY_PACKAGE_KIND,
  KEY_PACKAGE_RELAY_LIST_KIND,
} from "@internet-privacy/marmot-ts";
import { castUser } from "applesauce-common/casts/user";
import { mapEventsToStore } from "applesauce-core";
import type { NostrEvent } from "applesauce-core/helpers";
import { bytesToHex, relaySet, unixNow } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { Loader2, Plus, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { CiphersuiteId } from "ts-mls/crypto/ciphersuite.js";

import { RelayListCreator } from "@/components/form/relay-list-creator";
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
import { Label } from "@/components/ui/label";
import { user$ } from "@/lib/accounts";
import { liveGroups$, marmotClient$ } from "@/lib/marmot-client";
import { eventStore, pool } from "@/lib/nostr";
import { extraRelays$, lookupRelays$ } from "@/lib/settings";
import { formatTimeAgo } from "@/lib/time";

// ============================================================================
// Step 1: Key Package Selection
// ============================================================================

interface KeyPackageSelectionStepProps {
  pubkey: string;
  onSelectKeyPackage: (eventId: string, cipherSuiteId: CiphersuiteId) => void;
}

function KeyPackageSelectionStep({
  pubkey,
  onSelectKeyPackage,
}: KeyPackageSelectionStepProps) {
  const selectedUser = useMemo(() => castUser(pubkey, eventStore), [pubkey]);
  const outboxes = use$(user$.outboxes$);
  const extraRelays = use$(extraRelays$);
  const lookupRelays = use$(lookupRelays$);

  const keyPackageRelayList = use$(
    () =>
      selectedUser.replaceable(
        KEY_PACKAGE_RELAY_LIST_KIND,
        undefined,
        relaySet(outboxes, lookupRelays),
      ),
    [pubkey, outboxes?.join(","), lookupRelays?.join(",")],
  );

  const keyPackageRelays = useMemo(() => {
    return keyPackageRelayList && getKeyPackageRelayList(keyPackageRelayList);
  }, [keyPackageRelayList]);

  const keyPackageFilter = useMemo(
    () => ({ kinds: [KEY_PACKAGE_KIND], authors: [pubkey] }),
    [pubkey],
  );

  // Start a live subscription to populate the event store (fire-and-forget side-effect)
  use$(() => {
    const relays = relaySet(keyPackageRelays, extraRelays);
    if (relays.length === 0) return;

    return pool
      .subscription(relays, {
        ...keyPackageFilter,
        since: unixNow() - 60 * 60 * 24 * 7,
      })
      .pipe(mapEventsToStore(eventStore));
  }, [keyPackageRelays?.join(","), extraRelays.join(","), keyPackageFilter]);

  // Read current and future state reactively from the event store
  const keyPackages = use$(
    () => eventStore.timeline(keyPackageFilter),
    [keyPackageFilter],
  );

  if (!keyPackages) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (keyPackages.length === 0) {
    return (
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertDescription>
          No key packages found for this contact. They need to publish at least
          one key package before they can be invited.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Select which key package to use for the invite. {keyPackages.length}{" "}
        package
        {keyPackages.length === 1 ? "" : "s"} available.
      </p>

      <div className="h-[300px] overflow-y-auto space-y-2 pr-1">
        {keyPackages.map((event, index) => {
          const client = getKeyPackageClient(event);
          const timeAgo = formatTimeAgo(event.created_at);
          const isRecommended = index === 0;

          return (
            <button
              key={event.id}
              onClick={() => {
                const cipherSuiteId = getKeyPackageCipherSuiteId(
                  event,
                ) as CiphersuiteId;
                onSelectKeyPackage(event.id, cipherSuiteId);
              }}
              className="w-full text-left border rounded-lg p-4 hover:border-primary transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="text-xs text-muted-foreground font-mono truncate flex-1">
                  {event.id.slice(0, 16)}...
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
                  {client?.name ?? "Unknown client"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Step 2: Group Selection
// ============================================================================

interface NewGroupFormProps {
  contactPubkey: string;
  selectedKeyPackageEvent: NostrEvent;
  onCancel: () => void;
}

function NewGroupForm({
  contactPubkey,
  selectedKeyPackageEvent,
  onCancel,
}: NewGroupFormProps) {
  const navigate = useNavigate();
  const client = use$(marmotClient$);
  const extraRelays = use$(extraRelays$);

  const contactProfile = use$(
    () => castUser(contactPubkey, eventStore).profile$,
    [contactPubkey],
  );
  const defaultName = contactProfile?.displayName
    ? `Chat with ${contactProfile.displayName}`
    : "New Group";

  const [groupName, setGroupName] = useState(defaultName);
  const [relays, setRelays] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Populate relays from extraRelays$ on mount
  useEffect(() => {
    if (extraRelays && relays.length === 0) {
      setRelays(extraRelays);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraRelays?.join(",")]);

  // Keep group name in sync with profile once it loads
  useEffect(() => {
    if (contactProfile?.displayName) {
      setGroupName(`Chat with ${contactProfile.displayName}`);
    }
  }, [contactProfile?.displayName]);

  const handleCreateAndInvite = async () => {
    if (!client) {
      setError("Marmot client not available");
      return;
    }
    if (!groupName.trim()) {
      setError("Group name is required");
      return;
    }

    const effectiveRelays = relays.length > 0 ? relays : (extraRelays ?? []);
    if (effectiveRelays.length === 0) {
      setError("At least one relay is required");
      return;
    }

    try {
      setIsCreating(true);
      setError(null);

      const group = await client.createGroup(groupName.trim(), {
        relays: effectiveRelays,
      });

      await group.inviteByKeyPackageEvent(selectedKeyPackageEvent);

      navigate(`/groups/${bytesToHex(group.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsCreating(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
      <div className="space-y-2">
        <Label htmlFor="new-group-name">Group Name</Label>
        <Input
          id="new-group-name"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="Enter group name"
          disabled={isCreating}
        />
      </div>

      <RelayListCreator
        relays={relays}
        label="Relays"
        disabled={isCreating}
        emptyMessage="No relays configured. Add relays or your defaults will be used."
        onRelaysChange={setRelays}
      />

      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel} disabled={isCreating}>
          Cancel
        </Button>
        <Button
          onClick={handleCreateAndInvite}
          disabled={isCreating || !groupName.trim()}
        >
          {isCreating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            "Create & Invite"
          )}
        </Button>
      </div>
    </div>
  );
}

interface GroupSelectionStepProps {
  selectedKeyPackageEvent: NostrEvent;
  selectedCipherSuiteId: CiphersuiteId;
  contactPubkey: string;
  onInvited: () => void;
}

function GroupSelectionStep({
  selectedKeyPackageEvent,
  selectedCipherSuiteId,
  contactPubkey,
  onInvited,
}: GroupSelectionStepProps) {
  const client = use$(marmotClient$);
  const groups = use$(liveGroups$);
  const [showNewGroupForm, setShowNewGroupForm] = useState(false);
  const [isInviting, setIsInviting] = useState<string | null>(null); // groupId being invited to
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Filter groups to those compatible with the selected key package's cipher suite
  const compatibleGroups = useMemo(() => {
    if (!groups) return [];
    return groups.filter(
      (g) =>
        (g.state.groupContext.cipherSuite as CiphersuiteId) ===
        selectedCipherSuiteId,
    );
  }, [groups, selectedCipherSuiteId]);

  const handleInviteToGroup = async (groupId: string) => {
    if (!client) return;

    try {
      setInviteError(null);
      setIsInviting(groupId);
      const group = await client.getGroup(groupId);
      await group.inviteByKeyPackageEvent(selectedKeyPackageEvent);
      onInvited();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsInviting(null);
    }
  };

  if (showNewGroupForm) {
    return (
      <NewGroupForm
        contactPubkey={contactPubkey}
        selectedKeyPackageEvent={selectedKeyPackageEvent}
        onCancel={() => setShowNewGroupForm(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {compatibleGroups.length > 0 ? (
        <div className="max-h-[240px] overflow-y-auto border rounded-lg divide-y">
          {compatibleGroups.map((group) => {
            const name = group.groupData?.name ?? "Unnamed Group";
            const memberCount = getGroupMembers(group.state).length;
            const groupId = group.idStr;
            const isBusy = isInviting === groupId;

            return (
              <div
                key={groupId}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{name}</div>
                  <div className="text-xs text-muted-foreground">
                    {memberCount} member{memberCount === 1 ? "" : "s"}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleInviteToGroup(groupId)}
                  disabled={!!isInviting}
                >
                  {isBusy ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Inviting...
                    </>
                  ) : (
                    "Invite"
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No compatible groups.</p>
      )}

      {inviteError && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{inviteError}</AlertDescription>
        </Alert>
      )}

      <button
        onClick={() => setShowNewGroupForm(true)}
        className="w-full flex items-center gap-3 p-4 border border-dashed rounded-lg hover:border-primary hover:bg-primary/5 transition-colors text-left"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background">
          <Plus className="h-4 w-4" />
        </div>
        <div>
          <div className="font-medium">New group</div>
          <div className="text-xs text-muted-foreground">
            Start a new private group with just the two of you
          </div>
        </div>
      </button>
    </div>
  );
}

// ============================================================================
// Main Dialog
// ============================================================================

export interface InviteToGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pubkey: string;
}

export function InviteToGroupDialog({
  open,
  onOpenChange,
  pubkey,
}: InviteToGroupDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedKeyPackageEventId, setSelectedKeyPackageEventId] =
    useState("");
  const [selectedCipherSuiteId, setSelectedCipherSuiteId] =
    useState<CiphersuiteId | null>(null);

  // Resolve the selected key package event from the store for step 2.
  // The store is already populated by the live subscription in KeyPackageSelectionStep.
  const selectedKeyPackageEvent = useMemo(
    () =>
      selectedKeyPackageEventId
        ? (eventStore.getEvent(selectedKeyPackageEventId) ?? null)
        : null,
    [selectedKeyPackageEventId],
  );

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setStep(1);
      setSelectedKeyPackageEventId("");
      setSelectedCipherSuiteId(null);
    }
  }, [open]);

  const handleKeyPackageSelect = (
    eventId: string,
    cipherSuiteId: CiphersuiteId,
  ) => {
    setSelectedKeyPackageEventId(eventId);
    setSelectedCipherSuiteId(cipherSuiteId);
    setStep(2);
  };

  const stepTitles: Record<1 | 2, string> = {
    1: "Select Key Package",
    2: "Select Group",
  };

  const stepDescriptions: Record<1 | 2, string> = {
    1: "Choose which key package to use for the invite",
    2: "Pick an existing group or create a new one",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <UserAvatar pubkey={pubkey} size="sm" />
            <UserName pubkey={pubkey} />
          </div>
          <DialogTitle>{stepTitles[step]}</DialogTitle>
          <DialogDescription>{stepDescriptions[step]}</DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={
              step === 1
                ? "text-foreground font-medium"
                : "text-muted-foreground"
            }
          >
            1. Key Package
          </span>
          <span>›</span>
          <span
            className={
              step === 2
                ? "text-foreground font-medium"
                : "text-muted-foreground"
            }
          >
            2. Group
          </span>
        </div>

        {step === 1 ? (
          <KeyPackageSelectionStep
            pubkey={pubkey}
            onSelectKeyPackage={handleKeyPackageSelect}
          />
        ) : (
          selectedKeyPackageEvent &&
          selectedCipherSuiteId !== null && (
            <GroupSelectionStep
              selectedKeyPackageEvent={selectedKeyPackageEvent}
              selectedCipherSuiteId={selectedCipherSuiteId}
              contactPubkey={pubkey}
              onInvited={() => onOpenChange(false)}
            />
          )
        )}

        {step === 2 && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

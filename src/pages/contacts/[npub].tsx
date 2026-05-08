import {
  ADDRESSABLE_KEY_PACKAGE_KIND,
  getGroupMembers,
  getKeyPackage,
  getKeyPackageCipherSuiteId,
  getKeyPackageClient,
  getKeyPackageExtensions,
  getKeyPackageIdentifier,
  getKeyPackageMLSVersion,
  getKeyPackageRelayList,
  getKeyPackageRelays,
  KEY_PACKAGE_RELAY_LIST_KIND,
} from "@internet-privacy/marmot-ts";
import { type KeyPackage } from "@internet-privacy/marmot-ts/mls";
import {
  IconChevronRight,
  IconMessage,
  IconMessagePlus,
  IconPackage,
  IconUsers,
  IconWorld,
} from "@tabler/icons-react";
import { castUser, type User } from "applesauce-common/casts/user";
import {
  defined,
  mapEventsToStore,
  mapEventsToTimeline,
} from "applesauce-core";
import {
  normalizeToProfilePointer,
  relaySet,
  type NostrEvent,
} from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { map } from "rxjs/operators";

import DataView from "@/components/data-view";
import KeyPackageDataView from "@/components/data-view/key-package";
import FollowButton from "@/components/follow-button";
import { InviteToGroupDialog } from "@/components/group/invite-to-group-dialog";
import { UserAvatar, UserName } from "@/components/nostr-user";
import { PageHeader } from "@/components/page-header";
import QRButton from "@/components/qr-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import accountManager from "@/lib/accounts";
import { liveGroups$ } from "@/lib/marmot-client";
import { eventStore, pool } from "@/lib/nostr";
import { extraRelays$, lookupRelays$ } from "@/lib/settings";
import {
  StartChatDialog,
  useStartChat,
} from "@/pages/contacts/components/start-chat-dialog";
import JsonBlock from "../../components/json-block";

function KeyPackageCard({ event }: { event: NostrEvent }) {
  const mlsVersion = getKeyPackageMLSVersion(event);
  const cipherSuiteId = getKeyPackageCipherSuiteId(event);
  const extensions = getKeyPackageExtensions(event);
  const relays = getKeyPackageRelays(event);
  const client = getKeyPackageClient(event);

  // Parse the key package
  let keyPackage: KeyPackage | null = null;
  let keyPackageError: Error | null = null;
  try {
    keyPackage = getKeyPackage(event);
  } catch (error) {
    keyPackageError = error as Error;
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const clientName = client?.name || "Unknown client";
  const identifier = getKeyPackageIdentifier(event) ?? "";
  const avatarUrl = `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(identifier)}`;

  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <img
        src={avatarUrl}
        title={identifier}
        alt={`Identicon for key package ${identifier}`}
        className="h-10 w-10 shrink-0 bg-muted"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{clientName}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {formatDate(event.created_at)}
        </div>
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">Details</Button>
        </DialogTrigger>

        <DialogContent className="max-h-[80vh] max-w-3xl overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Key Package Details</DialogTitle>
            <DialogDescription>
              {clientName} published {formatDate(event.created_at)}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <div className="text-xs text-muted-foreground">Event ID</div>
                <code className="block break-all text-xs">{event.id}</code>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">MLS Version</div>
                <div>{mlsVersion || "Not specified"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  Cipher Suite
                </div>
                <div>{cipherSuiteId ?? "Unknown"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Client</div>
                <div>{clientName}</div>
              </div>
              {keyPackageError && (
                <div className="sm:col-span-2">
                  <div className="text-xs text-muted-foreground">
                    Parse Error
                  </div>
                  <div className="text-destructive">
                    {keyPackageError.message}
                  </div>
                </div>
              )}
              {relays && relays.length > 0 && (
                <div className="sm:col-span-2">
                  <div className="text-xs text-muted-foreground">
                    Relays ({relays.length})
                  </div>
                  <div className="break-all">{relays.join(", ")}</div>
                </div>
              )}
              {extensions && extensions.length > 0 && (
                <div className="sm:col-span-2">
                  <div className="text-xs text-muted-foreground">
                    Extensions ({extensions.length})
                  </div>
                  <div className="break-all">{extensions.join(", ")}</div>
                </div>
              )}
            </div>

            <details className="border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Raw Nostr Event
              </summary>
              <div className="mt-3 overflow-x-auto">
                <JsonBlock value={event} />
              </div>
            </details>

            {keyPackage && (
              <details className="border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Raw Key Package
                </summary>
                <div className="mt-3 overflow-x-auto">
                  <KeyPackageDataView keyPackage={keyPackage} />
                </div>
              </details>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContactKeyPackagesList({
  keyPackages,
}: {
  keyPackages: NostrEvent[] | null | undefined;
}) {
  if (keyPackages && keyPackages.length > 0) {
    return (
      <div className="divide-y">
        {keyPackages.map((event) => (
          <KeyPackageCard key={event.id} event={event as NostrEvent} />
        ))}
      </div>
    );
  }

  if (keyPackages && keyPackages.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-sm text-muted-foreground">
        No key packages found for this user.
      </div>
    );
  }

  return (
    <div className="px-5 py-6 text-sm text-muted-foreground">Loading...</div>
  );
}

function ContactRelaysSection({
  user,
  relays,
}: {
  user: User;
  relays: string[] | undefined;
}) {
  const list = use$(
    () => user.replaceable(KEY_PACKAGE_RELAY_LIST_KIND),
    [user],
  );

  return (
    <div className="border rounded-lg">
      <div className="flex items-center gap-2 px-5 py-3 border-b text-sm font-semibold">
        <IconWorld size={16} className="text-muted-foreground" />
        Key Package Relays ({relays?.length ?? 0})
      </div>

      {!list ? (
        <div className="px-5 py-6 text-sm text-muted-foreground">
          No relay list published. This user may not have configured their key
          package relays yet.
        </div>
      ) : !relays || relays.length === 0 ? (
        <div className="px-5 py-6 text-sm text-muted-foreground">
          Relay list event found but contains no valid relays.
        </div>
      ) : (
        <div className="divide-y">
          {relays.map((relay) => (
            <div key={relay} className="px-5 py-2 text-sm font-mono break-all">
              {relay}
            </div>
          ))}
        </div>
      )}

      {list && (
        <div className="px-5 py-2 border-t text-xs text-muted-foreground">
          Last updated {new Date(list.created_at * 1000).toLocaleString()}
        </div>
      )}
    </div>
  );
}

function ContactDetailContent({ user }: { user: User }) {
  const profile = use$(user.profile$);
  const displayName = profile?.displayName;
  const outboxes = use$(user.outboxes$);
  const extraRelays = use$(extraRelays$);
  const lookupRelays = use$(lookupRelays$);
  const activeAccount = use$(accountManager.active$);
  const allGroups = use$(liveGroups$);

  const sharedGroups = useMemo(() => {
    if (!allGroups || !activeAccount) return [];
    return allGroups.filter((group) => {
      const members = getGroupMembers(group.state);
      return (
        members.includes(user.pubkey) && members.includes(activeAccount.pubkey)
      );
    });
  }, [allGroups, user.pubkey, activeAccount]);

  // Existing 1:1 group with this user, if any. Used by the chat action button.
  const existingDmGroupId = useMemo(() => {
    if (!activeAccount) return null;
    for (const group of sharedGroups) {
      const members = getGroupMembers(group.state);
      if (members.length === 2) return group.idStr;
    }
    return null;
  }, [sharedGroups, activeAccount]);

  const [inviteOpen, setInviteOpen] = useState(false);
  const chat = useStartChat();

  // Get the users key package relays
  const keyPackageRelays = use$(
    () =>
      user
        .replaceable(
          KEY_PACKAGE_RELAY_LIST_KIND,
          undefined,
          relaySet(outboxes, lookupRelays),
        )
        .pipe(defined(), map(getKeyPackageRelayList)),
    [user.pubkey, outboxes?.join(","), lookupRelays?.join(",")],
  );

  // Fetch key packages from merged relay set
  const keyPackages = use$(() => {
    const relays = relaySet(keyPackageRelays, extraRelays, outboxes);
    if (relays.length === 0) return;

    return pool
      .request(relays, {
        kinds: [ADDRESSABLE_KEY_PACKAGE_KIND],
        authors: [user.pubkey],
        limit: 20,
      })
      .pipe(mapEventsToStore(eventStore), mapEventsToTimeline());
  }, [
    user.pubkey,
    keyPackageRelays?.join(","),
    extraRelays.join(","),
    outboxes?.join(","),
  ]);

  // Latest key package (newest by created_at) for the Start chat action.
  const latestKeyPackage = useMemo(() => {
    if (!keyPackages || keyPackages.length === 0) return null;
    return keyPackages.reduce((latest, kp) =>
      kp.created_at > latest.created_at ? kp : latest,
    );
  }, [keyPackages]);

  const isSelf = activeAccount?.pubkey === user.pubkey;

  return (
    <>
      <PageHeader
        items={[
          { label: "Home", to: "/" },
          { label: "Contacts", to: "/contacts" },
          { label: displayName ?? "" },
        ]}
      />

      <div className="container mx-auto p-4 space-y-6">
        {/* User Header */}
        <div className="flex items-start gap-4 p-6 border rounded-lg">
          <UserAvatar pubkey={user.pubkey} size="xl" />
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-semibold">
              <UserName pubkey={user.pubkey} />
            </h2>
            <code className="text-xs text-muted-foreground block break-all mt-1">
              {user.pubkey}
            </code>
            {profile?.about && (
              <p className="text-sm text-muted-foreground mt-3">
                {profile.about}
              </p>
            )}
            {profile?.website && (
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline inline-block mt-2 break-all"
              >
                {profile.website}
              </a>
            )}
          </div>

          <div className="flex shrink-0">
            <QRButton data={user.npub} size="lg" label="NPUB" />
            <FollowButton pubkey={user.pubkey} size="lg" />
            {!isSelf &&
              (existingDmGroupId ? (
                <Button asChild variant="outline" size="lg">
                  <Link to={`/groups/${existingDmGroupId}`}>
                    <IconMessage size={18} />
                    Open chat
                  </Link>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="lg"
                  disabled={!latestKeyPackage || chat.isCreating}
                  onClick={() => {
                    if (latestKeyPackage)
                      chat.startChat(user, latestKeyPackage);
                  }}
                  title={
                    latestKeyPackage
                      ? undefined
                      : "No key package available — this user can't be invited yet"
                  }
                >
                  <IconMessagePlus size={18} />
                  Start chat
                </Button>
              ))}
            <Button
              variant="outline"
              size="lg"
              onClick={() => setInviteOpen(true)}
            >
              Invite to group
            </Button>
            <InviteToGroupDialog
              open={inviteOpen}
              onOpenChange={setInviteOpen}
              pubkey={user.pubkey}
            />
          </div>
        </div>

        {/* Key Package Relays */}
        <ContactRelaysSection user={user} relays={keyPackageRelays} />

        {/* Shared Groups */}
        <div className="border rounded-lg">
          <div className="flex items-center justify-between px-5 py-3 border-b">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <IconUsers size={16} className="text-muted-foreground" />
              Shared Groups
            </div>
            {sharedGroups.length > 0 && (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground h-auto py-1"
              >
                <Link to="/groups">View all</Link>
              </Button>
            )}
          </div>

          {allGroups === undefined ? (
            <div className="px-5 py-6 text-sm text-muted-foreground">
              Loading...
            </div>
          ) : sharedGroups.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-5 py-8 text-center">
              <IconMessage size={32} className="text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                You are not in any groups together yet.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setInviteOpen(true)}
              >
                Invite to a Group
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {sharedGroups.map((group) => {
                const name = group.groupData?.name || "Unnamed Group";
                const description = group.groupData?.description || "";
                const memberCount = getGroupMembers(group.state).length;

                return (
                  <Link
                    key={group.idStr}
                    to={`/groups/${group.idStr}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-accent transition-colors"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <IconMessage
                        size={16}
                        className="text-muted-foreground"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{name}</div>
                      {description ? (
                        <div className="text-xs text-muted-foreground truncate">
                          {description}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <IconUsers size={11} />
                          <span>
                            {memberCount}{" "}
                            {memberCount === 1 ? "member" : "members"}
                          </span>
                        </div>
                      )}
                    </div>
                    <IconChevronRight
                      size={16}
                      className="shrink-0 text-muted-foreground"
                    />
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Key Packages */}
        <div className="border rounded-lg">
          <div className="flex items-center gap-2 px-5 py-3 border-b text-sm font-semibold">
            <IconPackage size={16} className="text-muted-foreground" />
            Key Packages ({keyPackages?.length ?? 0})
          </div>
          <ContactKeyPackagesList keyPackages={keyPackages} />
        </div>
      </div>

      <StartChatDialog {...chat} />
    </>
  );
}

export default function ContactDetailPage() {
  const { npub } = useParams<{ npub: string }>();

  if (!npub) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center text-muted-foreground">
          <p>Invalid contact identifier</p>
        </div>
      </div>
    );
  }

  let user: User;
  try {
    const pointer = normalizeToProfilePointer(npub);
    if (!pointer) throw new Error("Invalid user pointer");
    user = castUser(pointer, eventStore);
  } catch (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center text-muted-foreground">
          <p>Invalid contact identifier</p>
        </div>
      </div>
    );
  }

  return <ContactDetailContent user={user} />;
}

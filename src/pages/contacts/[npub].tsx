import {
  ADDRESSABLE_KEY_PACKAGE_KIND,
  getCredentialPubkey,
  getKeyPackage,
  getKeyPackageCipherSuiteId,
  getKeyPackageClient,
  getKeyPackageExtensions,
  getKeyPackageIdentifier,
  getKeyPackageMLSVersion,
  getKeyPackageRelayList,
  getKeyPackageRelays,
  getGroupMembers,
  KEY_PACKAGE_RELAY_LIST_KIND,
} from "@internet-privacy/marmot-ts";
import { castUser, User } from "applesauce-common/casts/user";
import {
  defined,
  mapEventsToStore,
  mapEventsToTimeline,
} from "applesauce-core";
import {
  bytesToHex,
  normalizeToProfilePointer,
  NostrEvent,
  relaySet,
} from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { map } from "rxjs/operators";
import { defaultCredentialTypes, KeyPackage } from "ts-mls";

import CipherSuiteBadge from "@/components/cipher-suite-badge";
import FollowButton from "@/components/follow-button";
import { InviteToGroupDialog } from "@/components/group/invite-to-group-dialog";
import { UserAvatar, UserName } from "@/components/nostr-user";
import { PageHeader } from "@/components/page-header";
import QRButton from "@/components/qr-button";
import { Button } from "@/components/ui/button";
import { eventStore, pool } from "@/lib/nostr";
import accountManager from "@/lib/accounts";
import { liveGroups$ } from "@/lib/marmot-client";
import { extraRelays$, lookupRelays$ } from "@/lib/settings";
import {
  StartChatDialog,
  useStartChat,
} from "@/pages/contacts/components/start-chat-dialog";
import {
  IconChevronRight,
  IconMessagePlus,
  IconUsers,
  IconMessage,
  IconPackage,
  IconWorld,
} from "@tabler/icons-react";
import { Link } from "react-router";

function KeyPackageCard({ event }: { event: NostrEvent }) {
  const [expanded, setExpanded] = useState(false);

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

  return (
    <div className="px-5 py-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground font-mono truncate">
            {event.id}
          </div>
          <div className="text-xs text-muted-foreground/60 mt-1">
            {formatDate(event.created_at)}
          </div>
        </div>
        {keyPackage && !keyPackageError && (
          <span className="px-2 py-1 text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded">
            Valid
          </span>
        )}
        {keyPackageError && (
          <span className="px-2 py-1 text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded">
            Parse Error
          </span>
        )}
      </div>

      {/* Quick Info Grid */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground mb-1">MLS Version</div>
          <span className="px-2 py-1 text-xs bg-muted rounded">
            {mlsVersion || "Not specified"}
          </span>
        </div>

        <div>
          <div className="text-xs text-muted-foreground mb-1">Cipher Suite</div>
          {cipherSuiteId !== undefined ? (
            <CipherSuiteBadge cipherSuite={cipherSuiteId} />
          ) : (
            <span className="px-2 py-1 text-xs bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 rounded">
              Unknown
            </span>
          )}
        </div>

        {client && (
          <div className="col-span-2">
            <div className="text-xs text-muted-foreground mb-1">Client</div>
            <span className="px-2 py-1 text-xs bg-muted rounded">
              {client.name}
            </span>
          </div>
        )}

        {relays && relays.length > 0 && (
          <div className="col-span-2">
            <div className="text-xs text-muted-foreground mb-1">
              Relays ({relays.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {relays.map((relay) => (
                <span key={relay} className="px-2 py-1 text-xs bg-muted rounded">
                  {relay}
                </span>
              ))}
            </div>
          </div>
        )}

        {extensions && extensions.length > 0 && (
          <div className="col-span-2">
            <div className="text-xs text-muted-foreground mb-1">
              Extensions ({extensions.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {extensions.map((ext) => (
                <span key={ext} className="px-2 py-1 text-xs bg-muted rounded">
                  {ext}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error Display */}
      {keyPackageError && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded text-sm">
          <strong>Parse Error:</strong> {keyPackageError.message}
        </div>
      )}

      {/* Expandable Details */}
      {keyPackage && (
        <button
          className="text-sm text-primary hover:underline"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Hide" : "Show"} Details
        </button>
      )}

      {expanded && keyPackage && (
        <div className="space-y-2 border-t pt-3">
          {/* Credential Info */}
          {keyPackage.leafNode.credential.credentialType ===
            defaultCredentialTypes.basic && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Credential Pubkey
              </div>
              <code className="text-xs break-all block bg-muted p-2 rounded">
                {getCredentialPubkey(keyPackage.leafNode.credential)}
              </code>
            </div>
          )}

          {/* Public Keys */}
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              HPKE Public Key
            </div>
            <code className="text-xs break-all block bg-muted p-2 rounded">
              {bytesToHex(keyPackage.leafNode.hpkePublicKey)}
            </code>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">
              Signature Public Key
            </div>
            <code className="text-xs break-all block bg-muted p-2 rounded">
              {bytesToHex(keyPackage.leafNode.signaturePublicKey)}
            </code>
          </div>
        </div>
      )}
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
            <div
              key={relay}
              className="px-5 py-2 text-sm font-mono break-all"
            >
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

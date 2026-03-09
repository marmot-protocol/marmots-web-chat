import {
  getCredentialPubkey,
  getKeyPackage,
  getKeyPackageCipherSuiteId,
  getKeyPackageClient,
  getKeyPackageExtensions,
  getKeyPackageMLSVersion,
  getKeyPackageRelayList,
  getKeyPackageRelays,
  getGroupMembers,
  KEY_PACKAGE_KIND,
  KEY_PACKAGE_RELAY_LIST_KIND,
} from "@internet-privacy/marmot-ts";
import { castUser, User } from "applesauce-common/casts/user";
import { mapEventsToStore, mapEventsToTimeline } from "applesauce-core";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { eventStore, pool } from "@/lib/nostr";
import accountManager from "@/lib/accounts";
import { liveGroups$ } from "@/lib/marmot-client";
import { extraRelays$, lookupRelays$ } from "@/lib/settings";
import { IconChevronRight, IconUsers, IconMessage } from "@tabler/icons-react";
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
    <div className="border rounded-lg p-4 space-y-3">
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
          <span className="px-2 py-1 text-xs border rounded">
            {mlsVersion || "Not specified"}
          </span>
        </div>

        <div>
          <div className="text-xs text-muted-foreground mb-1">Cipher Suite</div>
          {cipherSuiteId !== undefined ? (
            <CipherSuiteBadge cipherSuite={cipherSuiteId} />
          ) : (
            <span className="px-2 py-1 text-xs border border-red-500 text-red-600 rounded">
              Unknown
            </span>
          )}
        </div>

        {client && (
          <div className="col-span-2">
            <div className="text-xs text-muted-foreground mb-1">Client</div>
            <span className="px-2 py-1 text-xs border rounded">
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
                <span key={relay} className="px-2 py-1 text-xs border rounded">
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
                <span key={ext} className="px-2 py-1 text-xs border rounded">
                  {ext}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error Display */}
      {keyPackageError && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
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

function ContactKeyPackagesTab({
  keyPackages,
}: {
  keyPackages: NostrEvent[] | null | undefined;
}) {
  if (keyPackages && keyPackages.length > 0) {
    return (
      <div className="space-y-3">
        {keyPackages.map((event) => (
          <KeyPackageCard key={event.id} event={event as NostrEvent} />
        ))}
      </div>
    );
  }

  if (keyPackages && keyPackages.length === 0) {
    return (
      <div className="border rounded-lg p-8 text-center text-muted-foreground">
        No key packages found for this user.
      </div>
    );
  }

  return (
    <div className="flex justify-center p-8">
      <span className="text-muted-foreground">Loading...</span>
    </div>
  );
}

function ContactProfileTab({ user }: { user: User }) {
  const profile = use$(user.profile$);
  const displayName = profile?.displayName;
  const picture =
    profile?.picture ||
    `https://api.dicebear.com/7.x/identicon/svg?seed=${user.pubkey}`;

  return (
    <div className="border rounded-lg p-6 space-y-4">
      <div className="flex items-center gap-4">
        <div className="h-24 w-24 rounded-full overflow-hidden">
          <img
            src={picture}
            alt={displayName}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-semibold">{displayName}</h3>
          {profile?.about && (
            <p className="text-sm text-muted-foreground mt-2">
              {profile.about}
            </p>
          )}
        </div>
      </div>

      {profile?.website && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">Website</div>
          <a
            href={profile.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            {profile.website}
          </a>
        </div>
      )}

      <div>
        <div className="text-xs text-muted-foreground mb-1">Public Key</div>
        <code className="text-xs break-all block bg-muted p-2 rounded">
          {user.pubkey}
        </code>
      </div>
    </div>
  );
}

function ContactRelaysTab({
  keyPackageRelayList,
  keyPackageRelays,
}: {
  keyPackageRelayList: NostrEvent | null | undefined;
  keyPackageRelays: string[] | undefined;
}) {
  return (
    <div className="border rounded-lg p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Key Package Relay List</h3>
        <p className="text-sm text-muted-foreground">
          This user publishes their key package relay list (kind{" "}
          {KEY_PACKAGE_RELAY_LIST_KIND}) to indicate where their key packages
          can be found.
        </p>
      </div>

      {keyPackageRelayList ? (
        <div className="space-y-3">
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              Last Updated
            </div>
            <div className="text-sm">
              {new Date(keyPackageRelayList.created_at * 1000).toLocaleString()}
            </div>
          </div>

          {keyPackageRelays && keyPackageRelays.length > 0 ? (
            <div>
              <div className="text-xs text-muted-foreground mb-2">
                Relays ({keyPackageRelays.length})
              </div>
              <div className="space-y-2">
                {keyPackageRelays.map((relay) => (
                  <div
                    key={relay}
                    className="px-3 py-2 border rounded text-sm font-mono"
                  >
                    {relay}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
              Relay list event found but contains no valid relays.
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
          No relay list found for this user. They may not have configured their
          key package relays yet.
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

  const [inviteOpen, setInviteOpen] = useState(false);

  const keyPackageRelayList = use$(
    () =>
      user.replaceable(
        KEY_PACKAGE_RELAY_LIST_KIND,
        undefined,
        relaySet(outboxes, lookupRelays),
      ),
    [user.pubkey, outboxes?.join(","), lookupRelays?.join(",")],
  );

  // Extract relays from the relay list event
  const keyPackageRelays = useMemo(() => {
    return keyPackageRelayList && getKeyPackageRelayList(keyPackageRelayList);
  }, [keyPackageRelayList]);

  // Fetch key packages from merged relay set
  const keyPackages = use$(() => {
    const relays = relaySet(keyPackageRelays, extraRelays);
    if (relays.length === 0) return;

    return pool
      .request(relays, {
        kinds: [KEY_PACKAGE_KIND],
        authors: [user.pubkey],
        limit: 50,
      })
      .pipe(
        mapEventsToStore(eventStore),
        mapEventsToTimeline(),
        map((arr) => [...arr]),
      );
  }, [user.pubkey, keyPackageRelays?.join(","), extraRelays.join(",")]);

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
        <div className="flex items-center gap-4 p-6 border rounded-lg">
          <UserAvatar pubkey={user.pubkey} size="xl" />
          <div className="flex-1">
            <h2 className="text-2xl font-semibold">
              <UserName pubkey={user.pubkey} />
            </h2>
            <code className="text-xs text-muted-foreground block mt-1">
              {user.pubkey}
            </code>
          </div>

          <div className="flex">
            <QRButton data={user.npub} size="lg" label="NPUB" />
            <FollowButton pubkey={user.pubkey} size="lg" />
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

        {/* Tabs */}
        <Tabs defaultValue="profile" className="w-full">
          <TabsList variant="line">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="key-packages">
              Key Packages ({keyPackages?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="relays">
              Key Package Relays ({keyPackageRelays?.length ?? 0})
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-4">
            <ContactProfileTab user={user} />

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
                          <div className="text-sm font-medium truncate">
                            {name}
                          </div>
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
          </TabsContent>

          {/* Key Packages Tab */}
          <TabsContent value="key-packages" className="space-y-4">
            <ContactKeyPackagesTab keyPackages={keyPackages} />
          </TabsContent>

          {/* Key Package Relays Tab */}
          <TabsContent value="relays" className="space-y-4">
            <ContactRelaysTab
              keyPackageRelayList={keyPackageRelayList}
              keyPackageRelays={keyPackageRelays}
            />
          </TabsContent>
        </Tabs>
      </div>
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

import {
  getGroupMembers,
  getKeyPackageClient,
  KEY_PACKAGE_KIND,
} from "@internet-privacy/marmot-ts";
import { castUser } from "applesauce-common/casts/user";
import { mapEventsToStore } from "applesauce-core";
import type { NostrEvent } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { Link, useNavigate } from "react-router";
import { map } from "rxjs";

import { UserAvatar, UserName } from "@/components/nostr-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import accounts, { user$ } from "@/lib/accounts";
import { liveGroups$ } from "@/lib/marmot-client";
import { eventStore, pool } from "@/lib/nostr";
import { extraRelays$ } from "@/lib/settings";
import { formatTimeAgo } from "@/lib/time";
import { useMemo } from "react";
import type { UseStartChatReturn } from "./online-contacts";

/** Maximum number of recent key packages to show. */
const FEED_LIMIT = 20;

/** A contact is "online" if their latest key package is newer than this. */
const ONLINE_WINDOW_SECONDS = 86400; // 24 hours

function onlineThreshold() {
  return Math.floor(Date.now() / 1000) - ONLINE_WINDOW_SECONDS;
}

interface RecentKeyPackageCardProps {
  event: NostrEvent;
  onStartChat: UseStartChatReturn["startChat"];
  isCreating: boolean;
}

/**
 * Card tile that renders a recent key package from any user.
 * The entire card is clickable — if a 1:1 group with this person already
 * exists, clicking navigates there directly; otherwise it starts a new chat.
 * Self-hides when the key package is older than 24 hours.
 */
export function RecentKeyPackageCard({
  event,
  onStartChat,
  isCreating,
}: RecentKeyPackageCardProps) {
  const navigate = useNavigate();
  const groups = use$(liveGroups$);
  const account = use$(accounts.active$);
  const user = useMemo(() => castUser(event.pubkey, eventStore), [event]);
  const about = use$(user.profile$.about);
  const client = useMemo(() => getKeyPackageClient(event), [event]);

  // If a 2-member group with this person already exists, we can use a Link.
  let existingGroupId: string | null = null;
  if (groups && account?.pubkey) {
    for (const group of groups) {
      const members = getGroupMembers(group.state);
      if (
        members.length === 2 &&
        members.includes(account.pubkey) &&
        members.includes(event.pubkey)
      ) {
        existingGroupId = group.idStr;
        break;
      }
    }
  }

  function handleClick() {
    if (existingGroupId) {
      navigate(`/groups/${existingGroupId}`);
      return;
    }
    onStartChat(castUser(event.pubkey, eventStore), event);
  }

  const cardContent = (
    <Card className="hover:bg-accent/50 transition-colors relative flex flex-row items-start gap-3 py-4">
      <div className="relative shrink-0 pl-4">
        <UserAvatar pubkey={event.pubkey} size="lg" />
        <span
          className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-background"
          aria-label="Online"
        />
      </div>
      <div className="min-w-0 flex-1 pr-4">
        <CardHeader className="p-0">
          <CardTitle className="truncate text-base font-semibold">
            <UserName pubkey={event.pubkey} />
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 pt-1">
          <div className="text-xs text-muted-foreground truncate">{about}</div>
          <p className="text-xs text-muted-foreground mt-1">
            <span className="text-green-600 dark:text-green-400 font-medium">
              {formatTimeAgo(event.created_at)}
            </span>
          </p>
          {client?.name && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Client: {client.name}
            </p>
          )}
        </CardContent>
      </div>
    </Card>
  );

  if (existingGroupId) {
    return (
      <Link to={`/groups/${existingGroupId}`} className="block">
        {cardContent}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className="block w-full text-left disabled:opacity-50 disabled:pointer-events-none"
      disabled={isCreating}
      onClick={handleClick}
    >
      {cardContent}
    </button>
  );
}

interface RecentKeyPackagesFeedProps {
  onStartChat: UseStartChatReturn["startChat"];
  isCreating: boolean;
}

/**
 * Self-contained section showing recent key packages from anyone on the
 * user's configured relays. Renders nothing when there are no visible entries
 * (all entries are older than 24 h or belong to the current user).
 */
export function RecentKeyPackagesFeed({
  onStartChat,
  isCreating,
}: RecentKeyPackagesFeedProps) {
  const account = use$(accounts.active$);
  const extraRelays = use$(extraRelays$);
  const contacts = use$(user$.contacts$);

  // Side-effect: subscribe to the relay(s) and persist incoming events into
  // the global event store. No return value consumed here.
  use$(
    () => {
      if (!extraRelays || extraRelays.length === 0) return;
      return pool
        .request(extraRelays, {
          kinds: [KEY_PACKAGE_KIND],
          since: onlineThreshold(),
          limit: FEED_LIMIT * 5,
        })
        .pipe(mapEventsToStore(eventStore));
    },
    // Re-subscribe only when the relay list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [extraRelays?.join(",")],
  );

  const events = use$(
    () =>
      eventStore
        .timeline({ kinds: [KEY_PACKAGE_KIND], since: onlineThreshold() })
        .pipe(
          // Filter out self and contacts
          map((events) =>
            events.filter(
              (e) =>
                e.pubkey !== account?.pubkey &&
                !contacts?.some((c) => c.pubkey === e.pubkey),
            ),
          ),
          // Deduplicate events by pubkey while preserving order
          map((events) => {
            const seen = new Set<string>();
            return events.filter((event) => {
              if (seen.has(event.pubkey)) return false;
              seen.add(event.pubkey);
              return true;
            });
          }),
        ),
    [contacts],
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Others Online</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Recent key packages from anyone on your relays — click to start a
          secure chat
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {events?.slice(0, FEED_LIMIT).map((event) => (
          <RecentKeyPackageCard
            key={event.id}
            event={event}
            onStartChat={onStartChat}
            isCreating={isCreating}
          />
        ))}
      </div>
    </div>
  );
}

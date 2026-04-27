import {
  ADDRESSABLE_KEY_PACKAGE_KIND,
  getKeyPackageClient,
} from "@internet-privacy/marmot-ts";
import { castUser } from "applesauce-common/casts/user";
import { mapEventsToStore } from "applesauce-core";
import type { NostrEvent } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { Link } from "react-router";
import { map } from "rxjs";

import { UserAvatar, UserName } from "@/components/nostr-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import accounts, { user$ } from "@/lib/accounts";
import { eventStore, pool } from "@/lib/nostr";
import { extraRelays$ } from "@/lib/settings";
import { formatTimeAgo } from "@/lib/time";
import { useMemo } from "react";

/** Maximum number of recent key packages to show. */
const FEED_LIMIT = 20;

/** A contact is "online" if their latest key package is newer than this. */
const ONLINE_WINDOW_SECONDS = 86400; // 24 hours

function onlineThreshold() {
  return Math.floor(Date.now() / 1000) - ONLINE_WINDOW_SECONDS;
}

interface RecentKeyPackageCardProps {
  event: NostrEvent;
}

/**
 * Card tile that renders a recent key package from any user.
 * Clicking the card navigates to the user's profile, where the actual
 * "Start chat" / "Open chat" action lives.
 */
export function RecentKeyPackageCard({ event }: RecentKeyPackageCardProps) {
  const user = useMemo(() => castUser(event.pubkey, eventStore), [event]);
  const about = use$(user.profile$.about);
  const client = useMemo(() => getKeyPackageClient(event), [event]);

  return (
    <Link to={`/contacts/${user.npub}`} className="block">
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
            <div className="text-xs text-muted-foreground truncate">
              {about}
            </div>
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
    </Link>
  );
}

/**
 * Self-contained section showing recent key packages from anyone on the
 * user's configured relays. Renders nothing when there are no visible entries
 * (all entries are older than 24 h or belong to the current user).
 */
export function RecentKeyPackagesFeed() {
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
          kinds: [ADDRESSABLE_KEY_PACKAGE_KIND],
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
        .timeline({
          kinds: [ADDRESSABLE_KEY_PACKAGE_KIND],
          since: onlineThreshold(),
        })
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
          Recent key packages from anyone on your relays — click to view their
          profile
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {events?.slice(0, FEED_LIMIT).map((event) => (
          <RecentKeyPackageCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}

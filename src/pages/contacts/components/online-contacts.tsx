import { KEY_PACKAGE_KIND } from "@internet-privacy/marmot-ts";
import { mapEventsToStore } from "applesauce-core";
import type { NostrEvent } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { map } from "rxjs";

import { eventStore, pool } from "@/lib/nostr";
import { extraRelays$ } from "@/lib/settings";
import { useMemo } from "react";
import { user$ } from "../../../lib/accounts";

export { StartChatDialog, useStartChat } from "./start-chat-dialog";
export type { StartChatStep, UseStartChatReturn } from "./start-chat-dialog";

/** A contact is "online" if their latest key package is newer than this. */
const ONLINE_WINDOW_SECONDS = 86400; // 24 hours

function onlineThreshold() {
  return Math.floor(Date.now() / 1000) - ONLINE_WINDOW_SECONDS;
}

/**
 * Single subscription + timeline for all contacts' key packages (same pattern as
 * RecentKeyPackagesFeed). Use at section level and pass the resulting map (or
 * per-pubkey event) into each OnlineContactCard / OnlineContactListItem.
 *
 * @param contactPubkeys - List of contact pubkeys to fetch and track
 * @returns Map of pubkey → latest key package event, or undefined while loading
 */
export function useOnlineContactsKeyPackages(): NostrEvent[] | undefined {
  const contacts = use$(user$.contacts$);
  const extraRelays = use$(extraRelays$);

  const contactPubkeys = useMemo(
    () => contacts?.map((c) => c.pubkey) ?? [],
    [contacts],
  );

  // Side-effect: one subscription for all contacts' key packages; persist into event store.
  use$(
    () => {
      if (!extraRelays?.length || !contacts?.length) return;
      return pool
        .request(extraRelays, {
          kinds: [KEY_PACKAGE_KIND],
          authors: contactPubkeys,
          since: onlineThreshold(),
        })
        .pipe(mapEventsToStore(eventStore));
    },
    // Re-subscribe only when relay list or contact set changes.
    [extraRelays?.join(","), contactPubkeys.join(",")],
  );

  // One timeline read: recent key packages, then keep only contacts and latest per pubkey.
  const events = use$(
    () =>
      eventStore
        .timeline({
          kinds: [KEY_PACKAGE_KIND],
          authors: contactPubkeys,
          since: onlineThreshold(),
        })
        .pipe(
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
    [contactPubkeys.join(",")],
  );

  return events;
}

import { mapEventsToStore } from "applesauce-core";
import { Filter, kinds, relaySet } from "applesauce-core/helpers";
import { onlyEvents } from "applesauce-relay";
import {
  getKeyPackageRelayList,
  KEY_PACKAGE_KIND,
  KEY_PACKAGE_RELAY_LIST_KIND,
  unixNow,
} from "@internet-privacy/marmots";
import {
  combineLatest,
  defer,
  EMPTY,
  from,
  map,
  merge,
  of,
  share,
  shareReplay,
  switchMap,
  tap,
} from "rxjs";

import accounts, { user$ } from "./accounts";
import { inviteReader$, marmotClient$ } from "./marmot-client";
import { eventStore, pool } from "./nostr";
import { extraRelays$ } from "./settings";

/** Observable of current user's key package relay list */
export const keyPackageRelays$ = combineLatest([user$, user$.outboxes$]).pipe(
  switchMap(([user, outboxes]) =>
    user
      ? user
          .replaceable(KEY_PACKAGE_RELAY_LIST_KIND, undefined, outboxes)
          .pipe(
            map((event) => (event ? getKeyPackageRelayList(event) : undefined)),
          )
      : of(undefined),
  ),
);

/** An observable of all relays to read key packages from */
const readKeyPackageRelays$ = combineLatest([
  user$.outboxes$,
  keyPackageRelays$,
  extraRelays$,
]).pipe(
  map((all) => relaySet(...all)),
  shareReplay(1),
);

/**
 * Background subscription that fetches the current user's key package events
 * from relays and passes each one to the key package manager's track() method.
 * This populates the `published` array on each KeyPackageEntry so the manager
 * knows which relays to send kind-5 deletions to, including packages published
 * by other devices where private key material is not held locally.
 */
export const publishedKeyPackages$ = combineLatest([
  user$,
  marmotClient$,
  readKeyPackageRelays$,
]).pipe(
  switchMap(([user, client, relays]) => {
    if (!user || !client) return EMPTY;

    const filters: Filter[] = [
      {
        kinds: [KEY_PACKAGE_KIND],
        authors: [user.pubkey],
      },
      {
        kinds: [kinds.EventDeletion],
        "#k": [String(KEY_PACKAGE_KIND)],
        authors: [user.pubkey],
      },
    ];

    return pool.subscription(relays, filters).pipe(
      onlyEvents(),
      mapEventsToStore(eventStore),
      tap((event) => client.keyPackages.track(event)),
    );
  }),
  share(),
);

/** An observable that requests the last 2 weeks of gift wrap events from the user's inboxes and key package relays */
export const syncInvites$ = combineLatest([
  accounts.active$,
  inviteReader$,
  user$.directMessageRelays$,
  keyPackageRelays$,
  extraRelays$,
]).pipe(
  switchMap(
    ([
      account,
      inviteReader,
      directMessageRelays,
      keyPackageRelays,
      extraRelays,
    ]) => {
      if (!account || !inviteReader) return EMPTY;

      // Read invites from both direct message relays (GiftWrap) and key package relays
      const relays = relaySet(
        directMessageRelays,
        keyPackageRelays,
        extraRelays,
      );

      if (relays.length === 0) return EMPTY;

      const historical = pool.request(relays, {
        kinds: [kinds.GiftWrap],
        "#p": [account.pubkey],
        since: unixNow() - 60 * 60 * 24 * 7 * 2,
      });

      const live = pool.subscription(relays, {
        kinds: [kinds.GiftWrap],
        "#p": [account.pubkey],
      });

      return merge(historical, live).pipe(
        onlyEvents(),
        tap((event) => inviteReader.ingestEvent(event)),
      );
    },
  ),
  share(),
);

// Always run the syncInvites$ observable
syncInvites$.subscribe();

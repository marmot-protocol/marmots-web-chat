import {
  ADDRESSABLE_KEY_PACKAGE_KIND,
  getKeyPackageRelayList,
  KEY_PACKAGE_RELAY_LIST_KIND,
  unixNow,
} from "@internet-privacy/marmot-ts";
import { mapEventsToStore } from "applesauce-core";
import { kinds, relaySet } from "applesauce-core/helpers";
import { onlyEvents } from "applesauce-relay";
import {
  combineLatest,
  EMPTY,
  map,
  merge,
  of,
  share,
  startWith,
  switchMap,
  tap,
} from "rxjs";

import accounts, { user$ } from "./accounts";
import { marmotClient$ } from "./marmot-client";
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

/**
 * Background subscription that fetches the current user's key package events
 * from relays and passes each one to the key package manager's track() method.
 * This populates the `published` array on each KeyPackageEntry so the manager
 * knows which relays to send kind-5 deletions to, including packages published
 * by other devices where private key material is not held locally.
 */
export const publishedKeyPackages$ = combineLatest([user$, marmotClient$]).pipe(
  switchMap(([user, client]) => {
    if (!user || !client) return EMPTY;

    // Create a dynamic list of relays to read key packages from
    const relays$ = combineLatest([
      user$.outboxes$.pipe(startWith([])),
      keyPackageRelays$.pipe(startWith([])),
      extraRelays$.pipe(startWith([])),
    ]).pipe(map((all) => relaySet(...all)));

    return pool
      .subscription(relays$, {
        kinds: [ADDRESSABLE_KEY_PACKAGE_KIND],
        authors: [user.pubkey],
      })
      .pipe(
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
  marmotClient$,
]).pipe(
  switchMap(([account, client]) => {
    if (!account || !client) return EMPTY;

    // Read invites from both direct message relays (GiftWrap) and key package relays
    const relays$ = combineLatest([
      user$.directMessageRelays$,
      keyPackageRelays$,
      extraRelays$,
    ]).pipe(map((all) => relaySet(...all)));

    const historical = pool.request(relays$, {
      kinds: [kinds.GiftWrap],
      "#p": [account.pubkey],
      since: unixNow() - 60 * 60 * 24 * 7 * 2,
    });

    const live = pool.subscription(relays$, {
      kinds: [kinds.GiftWrap],
      "#p": [account.pubkey],
    });

    return merge(historical, live).pipe(
      onlyEvents(),
      tap((event) => client.invites.ingestEvent(event)),
    );
  }),
  share(),
);

// Always run the syncInvites$ observable
syncInvites$.subscribe();
publishedKeyPackages$.subscribe();

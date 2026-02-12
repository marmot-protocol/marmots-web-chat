import { defined, mapEventsToStore } from "applesauce-core";
import { kinds, NostrEvent, relaySet } from "applesauce-core/helpers";
import { onlyEvents } from "applesauce-relay";
import {
  calculateKeyPackageRef,
  getKeyPackage,
  getKeyPackageRelayList,
  KEY_PACKAGE_KIND,
  KEY_PACKAGE_RELAY_LIST_KIND,
  unixNow,
} from "marmot-ts";
import {
  combineLatest,
  defer,
  EMPTY,
  from,
  ignoreElements,
  map,
  merge,
  mergeMap,
  of,
  scan,
  share,
  shareReplay,
  switchMap,
  tap,
} from "rxjs";
import { KeyPackage } from "ts-mls";

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

export type PublishedKeyPackage = {
  event: NostrEvent;
  keyPackage: KeyPackage;
  keyPackageRef: Uint8Array;
};

/** An observable of all published key packages for the current user */
export const publishedKeyPackages$ = combineLatest([
  user$,
  marmotClient$,
  readKeyPackageRelays$,
]).pipe(
  switchMap(([user, client]) => {
    if (!user) return of([] as PublishedKeyPackage[]);

    const filter = {
      kinds: [KEY_PACKAGE_KIND],
      authors: [user.pubkey],
    };

    // Observable to load events from relays
    const load = pool
      .subscription(readKeyPackageRelays$, filter)
      .pipe(onlyEvents());
    // Observable: all current matching events first, then live updates from the store.
    // eventStore.filters(filter) is shared with ReplaySubject(1), so late subscribers
    // only see the last event; seeding with getByFilters ensures we get the full set.
    const parseEvent = async (event: NostrEvent) => {
      try {
        const keyPackage = getKeyPackage(event);
        const keyPackageRef = await calculateKeyPackageRef(
          keyPackage,
          client?.cryptoProvider,
        );
        return { event, keyPackage, keyPackageRef } as PublishedKeyPackage;
      } catch {
        return null;
      }
    };
    const existing$ = defer(() =>
      from(eventStore.getByFilters(filter)).pipe(
        mergeMap((event) => from(parseEvent(event))),
        defined(),
      ),
    );
    const updates$ = eventStore.filters(filter).pipe(
      mergeMap((event) => from(parseEvent(event))),
      defined(),
    );
    const published = merge(existing$, updates$).pipe(
      scan((acc, curr) => {
        const seen = acc.some((p) => p.event.id === curr.event.id);
        return seen ? acc : [...acc, curr];
      }, [] as PublishedKeyPackage[]),
    );

    return merge(
      load.pipe(
        // Send all events to the store
        mapEventsToStore(eventStore),
        // Ingore events
        ignoreElements(),
      ),
      // Return only parsed events from the store
      published,
    );
  }),
  shareReplay(1),
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

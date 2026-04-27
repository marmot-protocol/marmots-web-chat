import { bytesToHex } from "@noble/hashes/utils.js";
import { defined, mapEventsToTimeline, simpleTimeout } from "applesauce-core";
import { NostrEvent } from "applesauce-core/helpers/event";
import { onlyEvents } from "applesauce-relay";
import {
  GroupMediaStore,
  GroupRumorHistory,
  MarmotClient,
  MarmotGroup,
  NostrNetworkInterface,
  PublishResponse,
} from "@internet-privacy/marmot-ts";
import type { ListedKeyPackage } from "@internet-privacy/marmot-ts";
import localforage from "localforage";
import {
  combineLatest,
  firstValueFrom,
  from,
  lastValueFrom,
  map,
  Observable,
  of,
  shareReplay,
  startWith,
  switchMap,
} from "rxjs";
import databaseBroker from "./account-database";
import accounts from "./accounts";
import { eventStore, pool } from "./nostr";

/** Publish an event to the given relays */
export function publish(
  relays: string[],
  event: NostrEvent,
): Promise<Record<string, PublishResponse>> {
  return pool.publish(relays, event).then((res) =>
    res.reduce(
      (acc, curr) => {
        acc[curr.from] = curr;
        return acc;
      },
      {} as Record<string, PublishResponse>,
    ),
  );
}

/** Fetch the inbox relays for a specific user */
function getUserInboxRelays(pubkey: string): Promise<string[]> {
  return firstValueFrom(
    eventStore.mailboxes(pubkey).pipe(
      defined(),
      map((mailboxes) => mailboxes.inboxes),
      simpleTimeout(30_000, "Failed to fetch users inbox relays"),
    ),
  );
}

// Convert RelayPool to NostrPool, then to GroupNostrInterface
const networkInterface: NostrNetworkInterface = {
  request: (relays, filters) =>
    lastValueFrom(pool.request(relays, filters).pipe(mapEventsToTimeline())),
  subscription: (relays, filters) =>
    pool.subscription(relays, filters).pipe(onlyEvents()),
  publish,
  getUserInboxRelays,
};

/**
 * The concrete group type used throughout this app.
 * Every group has a persistent {@link GroupMediaStore} wired up as `group.media`.
 */
export type AppGroup = MarmotGroup<GroupRumorHistory, GroupMediaStore>;

const clientIdStore = localforage.createInstance({
  name: "marmot-chat-client-ids",
  storeName: "clientIds",
});

/** Get or generate a unique client ID for this app instance, per account */
async function getOrCreateClientId(pubkey: string): Promise<string> {
  const existing = await clientIdStore.getItem<string>(pubkey);
  if (existing) return existing;

  const id = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  await clientIdStore.setItem(pubkey, id);
  return id;
}

// Create an observable that creates a MarmotClient instance based on the current active account and stores.
export const marmotClient$: Observable<
  MarmotClient<GroupRumorHistory, GroupMediaStore> | undefined
> = accounts.active$.pipe(
  switchMap(async (account) => {
    // Ensure all stores are created and setup
    if (!account) return;

    try {
      // Get storage interfaces for the account
      const {
        groupStateStore,
        keyPackageStore,
        historyFactory,
        mediaFactory,
        inviteStore,
      } = await databaseBroker.getStorageInterfacesForAccount(account.pubkey);

      const clientId = await getOrCreateClientId(account.pubkey);

      // Create a new marmot client for the active account
      return new MarmotClient<GroupRumorHistory, GroupMediaStore>({
        signer: account.signer,
        groupStateStore,
        keyPackageStore,
        network: networkInterface,
        historyFactory,
        mediaFactory,
        clientId,
        inviteStore,
      });
    } catch (error) {
      console.error("Failed to initialize MarmotClient for active account", {
        pubkey: account.pubkey,
        error,
      });
      return undefined;
    }
  }),
  startWith(undefined),
  shareReplay(1),
);

/** An observable of all received invites for the current user */
export const liveReceivedInvites$ = marmotClient$.pipe(
  switchMap((client) => (client ? client.invites.watchReceived() : of([]))),
  shareReplay(1),
);

/** An observable of all unread invites for the current user */
export const liveUnreadInvites$ = marmotClient$.pipe(
  switchMap((client) => (client ? client.invites.watchUnread() : of([]))),
  shareReplay(1),
);

/**
 * Converts the client's key package manager watchKeyPackages async generator to an RxJS Observable.
 * This provides a reactive stream of key package updates.
 */
export const liveKeyPackages$ = marmotClient$.pipe(
  switchMap((client) => {
    if (!client) return of([]);

    return from(client.keyPackages.watchKeyPackages());
  }),
  shareReplay(1),
);

/**
 * Converts the client's watchGroups async generator to an RxJS Observable.
 * This provides a reactive stream of group updates.
 */
export const liveGroups$ = marmotClient$.pipe(
  switchMap((client) => {
    if (!client) return of([]);

    return from(client.groups.watch());
  }),
  shareReplay(1),
);

// Attach marmot client to window for debugging
if (import.meta.env.DEV) {
  marmotClient$.subscribe((client) => {
    // @ts-ignore
    window.marmotClient = client;
  });
}

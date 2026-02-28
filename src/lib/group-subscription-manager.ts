import { eventStore, pool } from "@/lib/nostr";
import {
  deserializeApplicationData,
  MarmotClient,
  type GroupRumorHistory,
} from "@internet-privacy/marmots";
import { bytesToHex } from "@noble/hashes/utils.js";
import { mapEventsToStore } from "applesauce-core";
import { unixNow, type NostrEvent } from "applesauce-core/helpers";
import { onlyEvents } from "applesauce-relay/operators";
import {
  BehaviorSubject,
  concatMap,
  EMPTY,
  from,
  merge,
  NEVER,
  Observable,
  Subscription,
  switchMap,
  tap,
  throttleTime,
} from "rxjs";

/**
 * Manages persistent subscriptions for all groups in the store.
 *
 * Why: In MLS, the group epoch advances with commits. If we don't ingest commits
 * in the background, the UI can drift and messages may fail to decrypt.
 *
 * Architecture:
 * - Relay subscriptions store raw group events into the shared eventStore.
 * - Each group independently subscribes to the eventStore timeline and ingests
 *   only events that have not yet been successfully processed.
 */
export class GroupSubscriptionManager {
  private readonly client: MarmotClient<GroupRumorHistory>;
  private running = false;
  /** GroupIds that currently have messages newer than the last "seen" timestamp. */
  readonly unreadGroupIds$ = new BehaviorSubject<string[]>([]);

  /** Last known message timestamp per group (seconds). */
  private lastMessageAtByGroup = new Map<string, number>();

  /** Last seen timestamp per group (seconds), persisted in localStorage. */
  private lastSeenAtByGroup = new Map<string, number>();

  /** An observable that subscribes to all group events form their relays */
  #live$: Observable<NostrEvent>;

  #processedEventIds = new Map<string, Set<string>>();

  /** An observable that sends events from the store to the group.ingest() method */
  #ingest$: Observable<any>;

  #subscriptions: Subscription[] = [];

  constructor(client: MarmotClient<GroupRumorHistory>) {
    this.client = client;

    this.#live$ = from(this.client.watchGroups()).pipe(
      switchMap((groups) =>
        merge(
          ...groups.map((group) => {
            if (!group.relays || !group.groupData) {
              console.warn(
                `[GroupSubscriptionManager] No relays or group data for group: ${group.groupData?.name ?? group.idStr}`,
              );
              return NEVER;
            }

            return pool.subscription(group.relays, {
              "#h": [bytesToHex(group.groupData?.nostrGroupId)],
              // Live events in the last 10 days
              since: unixNow() - 60 * 60 * 24 * 10, // 10 days
            });
          }),
        ),
      ),
      onlyEvents(),
      mapEventsToStore(eventStore),
    );

    this.#ingest$ = from(this.client.watchGroups()).pipe(
      switchMap((groups) =>
        merge(
          ...groups.map((group) => {
            if (!group.relays || !group.groupData) return NEVER;

            // Get in-memory set of processed event ids
            const processed = this.getProcessedEventIds(group.idStr);

            return eventStore
              .timeline({ "#h": [bytesToHex(group.groupData.nostrGroupId)] })
              .pipe(
                throttleTime(5_000),
                concatMap((events) => {
                  const newEvents = events.filter((e) => !processed.has(e.id));
                  if (newEvents.length === 0) return EMPTY;

                  console.debug(
                    `[GroupSubscriptionManager] Ingesting ${newEvents.length} events into group: ${group.groupData?.name ?? group.idStr}`,
                  );

                  return from(group.ingest(newEvents));
                }),
                tap((result) => {
                  processed.add(result.event.id);

                  if (result.result.kind === "applicationMessage") {
                    try {
                      const rumor = deserializeApplicationData(
                        result.result.message,
                      );
                      const prevNewest =
                        this.lastMessageAtByGroup.get(group.idStr) ?? 0;
                      if (rumor.created_at > prevNewest) {
                        this.lastMessageAtByGroup.set(
                          group.idStr,
                          rumor.created_at,
                        );
                        this.recomputeUnreadGroupIds();
                      }
                    } catch (parseErr) {
                      console.error(
                        "[GroupSubscriptionManager] Failed to parse application message:",
                        parseErr,
                      );
                    }
                  }
                }),
              );
          }),
        ),
      ),
    );
  }

  /**
   * Returns the set of successfully processed event IDs for a group.
   * Useful for filtering already-decrypted events in UI layers.
   */
  getProcessedEventIds(groupIdHex: string): Set<string> {
    const existing = this.#processedEventIds.get(groupIdHex);
    if (existing) return existing;

    const events = new Set<string>();
    this.#processedEventIds.set(groupIdHex, events);
    return events;
  }

  /** Start managing subscriptions for all groups in the store. */
  async start(): Promise<void> {
    if (this.running) return;

    this.running = true;

    // Start listening for live events
    this.#subscriptions.push(this.#live$.subscribe());

    // Start ingesting events
    this.#subscriptions.push(this.#ingest$.subscribe());
  }

  /** Stop all subscriptions and clean up resources. */
  stop(): void {
    this.running = false;

    this.#subscriptions.forEach((sub) => sub.unsubscribe());
    this.#subscriptions = [];

    this.unreadGroupIds$.next([]);
    this.lastMessageAtByGroup.clear();
    this.lastSeenAtByGroup.clear();
  }

  /** Mark a group as seen up to a given timestamp (seconds). */
  markGroupSeen(groupIdHex: string, seenAt: number): void {
    const clamped = Math.max(0, Math.floor(seenAt));
    this.lastSeenAtByGroup.set(groupIdHex, clamped);
    this.persistLastSeenToStorage(groupIdHex, clamped);
    this.recomputeUnreadGroupIds();
  }

  private storageKey(groupIdHex: string): string {
    return `marmot:last-seen:${groupIdHex}`;
  }

  private persistLastSeenToStorage(groupIdHex: string, seenAt: number): void {
    try {
      localStorage.setItem(this.storageKey(groupIdHex), String(seenAt));
    } catch {
      // ignore
    }
  }

  private getLastSeenFromStorage(groupIdHex: string): number {
    try {
      const raw = localStorage.getItem(this.storageKey(groupIdHex));
      if (!raw) return 0;
      const n = Number(raw);
      return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    } catch {
      return 0;
    }
  }

  private recomputeUnreadGroupIds(): void {
    const unread: string[] = [];
    for (const groupIdHex of this.lastMessageAtByGroup.keys()) {
      const lastMsg = this.lastMessageAtByGroup.get(groupIdHex) ?? 0;

      let lastSeen = this.lastSeenAtByGroup.get(groupIdHex);
      if (lastSeen === undefined) {
        lastSeen = this.getLastSeenFromStorage(groupIdHex);
        this.lastSeenAtByGroup.set(groupIdHex, lastSeen);
      }

      if (lastMsg > lastSeen) unread.push(groupIdHex);
    }

    // Keep stable ordering for UI.
    unread.sort();
    this.unreadGroupIds$.next(unread);
  }
}

import { eventStore, pool } from "@/lib/nostr";
import {
  deserializeApplicationData,
  MarmotClient,
  SkippedIngestResult,
  type GroupRumorHistory,
  type IngestResult,
} from "@internet-privacy/marmot-ts";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { mapEventsToStore } from "applesauce-core";
import { unixNow, type NostrEvent } from "applesauce-core/helpers";
import { onlyEvents } from "applesauce-relay/operators";
import localforage from "localforage";
import {
  BehaviorSubject,
  combineLatest,
  EMPTY,
  exhaustMap,
  from,
  map,
  merge,
  NEVER,
  Observable,
  Subscription,
  switchMap,
  tap,
} from "rxjs";

/** A record of any ingest outcome for a group event. */
export type IngestEventRecord = IngestResult & {
  /** Unix timestamp (ms) when this record was created. */
  processedAt: number;
};

/**
 * @deprecated Use {@link IngestEventRecord} instead.
 * Kept for backward compatibility with the events timeline.
 */
export type ProcessedEventRecord = IngestEventRecord;

/**
 * JSON-serializable representation of an {@link IngestEventRecord}.
 *
 * Strips non-serializable fields (MlsMessage, ClientState, Uint8Array payloads)
 * while preserving all diagnostic information needed for the debug timeline.
 */
export type StoredIngestRecord =
  | {
      kind: "processed";
      /** The kind of MLS result (applicationMessage | newState). */
      resultKind: string;
      /** Hex-encoded application message payload (only set when resultKind === "applicationMessage"). */
      messageHex?: string;
      event: NostrEvent;
      processedAt: number;
    }
  | {
      kind: "rejected";
      /** The kind of MLS result (always newState for a rejected commit). */
      resultKind: string;
      /** The action taken by the incoming-message callback (always "reject"). */
      actionTaken: string;
      event: NostrEvent;
      processedAt: number;
    }
  | {
      kind: "skipped";
      reason: SkippedIngestResult["reason"];
      event: NostrEvent;
      processedAt: number;
    }
  | {
      kind: "unreadable";
      /** Human-readable error messages from each retry attempt. */
      errors: string[];
      event: NostrEvent;
      processedAt: number;
    };

/** Convert a full {@link IngestEventRecord} to a JSON-safe {@link StoredIngestRecord}. */
function toStoredRecord(r: IngestEventRecord): StoredIngestRecord {
  switch (r.kind) {
    case "processed":
      return {
        kind: "processed",
        resultKind: r.result.kind,
        messageHex:
          r.result.kind === "applicationMessage"
            ? bytesToHex(r.result.message)
            : undefined,
        event: r.event,
        processedAt: r.processedAt,
      };
    case "rejected":
      return {
        kind: "rejected",
        resultKind: r.result.kind,
        actionTaken:
          "actionTaken" in r.result ? String(r.result.actionTaken) : "reject",
        event: r.event,
        processedAt: r.processedAt,
      };
    case "skipped":
      return {
        kind: "skipped",
        reason: r.reason,
        event: r.event,
        processedAt: r.processedAt,
      };
    case "unreadable":
      return {
        kind: "unreadable",
        errors: r.errors.map((e) =>
          e instanceof Error ? e.message : String(e),
        ),
        event: r.event,
        processedAt: r.processedAt,
      };
  }
}

/**
 * Reconstruct a minimal {@link IngestEventRecord} from a {@link StoredIngestRecord}.
 *
 * The heavy MLS objects (MlsMessage, ClientState) are not restored — the record
 * is only used for display in the debug timeline, where those fields are unused.
 * `message` is set to `null` (cast) since it is never read by the timeline UI.
 */
function fromStoredRecord(s: StoredIngestRecord): IngestEventRecord {
  // MlsMessage and ClientState are not stored — null-cast satisfies the type.
  // The debug timeline UI never reads these fields from historical records.
  const message = null as never;

  if (s.kind === "processed") {
    const result =
      s.resultKind === "applicationMessage" && s.messageHex !== undefined
        ? ({
            kind: "applicationMessage",
            message: hexToBytes(s.messageHex),
            newState: null as never,
            consumed: [],
            aad: new Uint8Array(),
          } as IngestEventRecord extends { kind: "processed"; result: infer R }
            ? R
            : never)
        : ({ kind: s.resultKind } as IngestEventRecord extends {
            kind: "processed";
            result: infer R;
          }
            ? R
            : never);
    return {
      kind: "processed",
      result,
      message,
      event: s.event,
      processedAt: s.processedAt,
    };
  }

  if (s.kind === "rejected") {
    return {
      kind: "rejected",
      result: {
        kind: s.resultKind,
        actionTaken: s.actionTaken,
      } as IngestEventRecord extends { kind: "rejected"; result: infer R }
        ? R
        : never,
      message,
      event: s.event,
      processedAt: s.processedAt,
    };
  }

  if (s.kind === "skipped") {
    return {
      kind: "skipped",
      reason: s.reason,
      message,
      event: s.event,
      processedAt: s.processedAt,
    };
  }

  // unreadable
  return {
    kind: "unreadable",
    errors: s.errors.map((msg) => new Error(msg)),
    event: s.event,
    processedAt: s.processedAt,
  };
}

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
 * - All ingest outcomes are persisted to per-group localforage stores (one store
 *   per MLS group id as the storeName) so the debug timeline survives page reloads.
 */
export class GroupSubscriptionManager {
  private readonly client: MarmotClient<GroupRumorHistory>;
  /** The IndexedDB database name shared by all per-group ingest-results stores. */
  private readonly databaseName: string;
  private running = false;
  /** GroupIds that currently have messages newer than the last "seen" timestamp. */
  readonly unreadGroupIds$ = new BehaviorSubject<string[]>([]);

  /** Last known message timestamp per group (seconds). */
  private lastMessageAtByGroup = new Map<string, number>();

  /** Last seen timestamp per group (seconds), persisted in localStorage. */
  private lastSeenAtByGroup = new Map<string, number>();

  /** An observable that subscribes to all group events from their relays */
  #live$: Observable<NostrEvent>;

  #processedEventIds = new Map<string, Set<string>>();

  /** Per-group reactive log of all ingest outcome records. */
  #ingestResults = new Map<string, BehaviorSubject<IngestEventRecord[]>>();

  /** Per-group localforage instances for persistence. */
  #ingestStores = new Map<string, LocalForage>();

  /** An observable that sends events from the store to the group.ingest() method */
  #ingest$: Observable<unknown>;

  #subscriptions: Subscription[] = [];

  constructor(client: MarmotClient<GroupRumorHistory>, databaseName: string) {
    this.client = client;
    this.databaseName = databaseName;

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
                // TODO: small bug here if messages arrive while processing they won't be ingested until next message after finished
                exhaustMap((events) => {
                  const newEvents = events.filter((e) => !processed.has(e.id));
                  if (newEvents.length === 0) return EMPTY;

                  console.debug(
                    `[GroupSubscriptionManager] Ingesting ${newEvents.length} events into group: ${group.groupData?.name ?? group.idStr}`,
                  );

                  return from(group.ingest(newEvents));
                }),
                tap((result) => {
                  processed.add(result.event.id);

                  const record: IngestEventRecord = {
                    ...result,
                    processedAt: Date.now(),
                  };

                  // Append to the per-group ingest result log (all outcomes).
                  const log$ = this.getIngestResults$(group.idStr);
                  log$.next([...log$.getValue(), record]);

                  // Persist the record to localforage (fire-and-forget).
                  this.#persistRecord(group.idStr, record);

                  // Only track unread counts for successfully processed application messages.
                  if (
                    result.kind === "processed" &&
                    result.result.kind === "applicationMessage"
                  ) {
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

  // ---------------------------------------------------------------------------
  // Localforage helpers
  // ---------------------------------------------------------------------------

  /** Get or create the localforage store for a group. */
  #getStore(groupIdStr: string): LocalForage {
    const existing = this.#ingestStores.get(groupIdStr);
    if (existing) return existing;

    const store = localforage.createInstance({
      name: this.databaseName,
      storeName: groupIdStr,
    });
    this.#ingestStores.set(groupIdStr, store);
    return store;
  }

  /** Persist a single record under its event id as the key. */
  async #persistRecord(
    groupIdStr: string,
    record: IngestEventRecord,
  ): Promise<void> {
    try {
      const store = this.#getStore(groupIdStr);
      await store.setItem<StoredIngestRecord>(
        record.event.id,
        toStoredRecord(record),
      );
    } catch (err) {
      console.error(
        "[GroupSubscriptionManager] Failed to persist ingest record:",
        err,
      );
    }
  }

  /**
   * Load all persisted ingest records for a group from localforage and
   * populate the in-memory subject and processedEventIds set.
   */
  async #loadPersistedRecords(groupIdStr: string): Promise<void> {
    try {
      const store = this.#getStore(groupIdStr);
      const processed = this.getProcessedEventIds(groupIdStr);
      const log$ = this.getIngestResults$(groupIdStr);

      const records: IngestEventRecord[] = [];

      await store.iterate<StoredIngestRecord, void>((stored) => {
        processed.add(stored.event.id);
        records.push(fromStoredRecord(stored));
      });

      if (records.length === 0) return;

      // Sort oldest-first (consistent with the live tap order).
      records.sort((a, b) => a.event.created_at - b.event.created_at);

      log$.next(records);
    } catch (err) {
      console.error(
        "[GroupSubscriptionManager] Failed to load persisted ingest records:",
        err,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Returns the set of event IDs that have been ingested (any outcome) for a group.
   * Used to filter out already-seen events from the pending list.
   */
  getProcessedEventIds(groupIdHex: string): Set<string> {
    const existing = this.#processedEventIds.get(groupIdHex);
    if (existing) return existing;

    const events = new Set<string>();
    this.#processedEventIds.set(groupIdHex, events);
    return events;
  }

  /**
   * Returns a reactive list of all ingest outcome records for a group,
   * ordered oldest-first. Emits a new array each time a new record is added.
   * Records include processed, rejected, skipped, and unreadable outcomes.
   */
  getIngestResults$(groupIdHex: string): BehaviorSubject<IngestEventRecord[]> {
    const existing = this.#ingestResults.get(groupIdHex);
    if (existing) return existing;

    const subject = new BehaviorSubject<IngestEventRecord[]>([]);
    this.#ingestResults.set(groupIdHex, subject);
    return subject;
  }

  /**
   * Returns an observable of events in the store that have not yet been
   * ingested (any outcome) for the given group (keyed by nostrGroupIdHex).
   * Emits a new array whenever the store timeline or processed set changes.
   */
  getPendingEvents$(
    nostrGroupIdHex: string,
    groupIdHex: string,
  ): Observable<NostrEvent[]> {
    const processed = this.getProcessedEventIds(groupIdHex);
    const ingestResults$ = this.getIngestResults$(groupIdHex);

    return combineLatest([
      eventStore.timeline({ "#h": [nostrGroupIdHex] }),
      ingestResults$,
    ]).pipe(map(([events]) => events.filter((e) => !processed.has(e.id))));
  }

  /** Start managing subscriptions for all groups in the store. */
  async start(): Promise<void> {
    if (this.running) return;

    this.running = true;

    // Pre-load persisted records for all known groups before starting ingestion.
    // watchGroups() yields the current snapshot on its first iteration.
    const groupsIter = this.client.watchGroups()[Symbol.asyncIterator]();
    const { value: groups } = await groupsIter.next();
    groupsIter.return?.(undefined);
    if (groups && groups.length > 0) {
      await Promise.all(
        groups.map((g: { idStr: string }) =>
          this.#loadPersistedRecords(g.idStr),
        ),
      );
    }

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
    this.#ingestResults.forEach((s) => s.next([]));
    this.#ingestResults.clear();
    this.#processedEventIds.clear();
    this.#ingestStores.clear();
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

/**
 * Returns the IndexedDB database name used for ingest-results stores for a given account.
 * Each group's records are stored in their own store (storeName = group id string)
 * within this shared database.
 *
 * @param pubkey - The hex public key of the active account.
 */
export function ingestResultsDatabaseName(pubkey: string): string {
  return `${pubkey}-ingest-results`;
}

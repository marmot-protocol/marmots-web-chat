import type { NostrEvent } from "applesauce-core/helpers/event";
import type { Filter } from "applesauce-core/helpers/filter";
import type { RelayPool as AsRelayPool } from "applesauce-relay/pool";
import type {
  NostrNetworkInterface,
  PublishResponse,
  Subscribable,
} from "@internet-privacy/marmot-ts/client";
import type {
  AuthSigner,
  GroupRequestOptions,
  RelayAuthHandler,
} from "applesauce-relay/types";
import {
  EMPTY,
  ReplaySubject,
  distinct,
  filter,
  lastValueFrom,
  take,
  takeUntil,
  toArray,
} from "rxjs";

import { createRelayAuthHandler } from "@/lib/marmot/relay-auth";
import type { Directory } from "@/lib/marmot/discovery";

function resolveRelays(relays: string[], fallback: string[]): string[] {
  return relays.length ? relays : fallback;
}

/**
 * Adapter over `applesauce-relay`'s pool that implements marmot-ts's
 * {@link NostrNetworkInterface}. The pool is shared with the {@link Directory}
 * so relay-list/profile discovery reuses the same connections, and
 * `getUserInboxRelays` delegates to the Directory's loader.
 */
export class MarmotNetwork implements NostrNetworkInterface {
  /** Bootstrap fallback when an operation supplies no explicit destinations. */
  readonly defaultRelays: string[];

  readonly #pool: AsRelayPool;
  readonly #directory: Directory;
  #closed = false;
  readonly #closed$ = new ReplaySubject<void>(1);
  readonly #onAuthRequired: RelayAuthHandler;

  constructor(
    pool: AsRelayPool,
    defaultRelays: string[],
    directory: Directory,
    signer: AuthSigner,
  ) {
    this.#pool = pool;
    this.defaultRelays = defaultRelays;
    this.#directory = directory;
    this.#onAuthRequired = createRelayAuthHandler(signer, () => this.#closed);
  }

  async publish(
    relays: string[],
    event: NostrEvent,
  ): Promise<Record<string, PublishResponse>> {
    if (this.#closed) throw new Error("Account connection is closed");
    const targets = resolveRelays(relays, this.defaultRelays);
    const responses = await this.#pool.publish(targets, event, {
      onAuthRequired: this.#onAuthRequired,
    });
    if (!responses.some((response) => response.ok))
      throw new Error("No relay acknowledged the published event");
    const results: Record<string, PublishResponse> = {};
    for (const response of responses) results[response.from] = response;
    return results;
  }

  async request(
    relays: string[],
    filters: Filter | Filter[],
    options?: GroupRequestOptions,
  ): Promise<NostrEvent[]> {
    if (this.#closed) throw new Error("Account connection is closed");
    const targets = resolveRelays(relays, this.defaultRelays);
    const list = Array.isArray(filters) ? filters : [filters];
    const limit = list.every((filter) => filter.limit !== undefined)
      ? list.reduce((sum, filter) => sum + filter.limit!, 0)
      : Infinity;
    try {
      return await lastValueFrom(
        this.#pool
          .request(targets, filters, {
            onAuthRequired: this.#onAuthRequired,
            ...options,
          })
          .pipe(
            filter((event) => this.#directory.add(event)),
            distinct((event) => event.id),
            take(limit),
            toArray(),
            // Cancellation must reject, never resolve [] and advance a relay cursor.
            takeUntil(this.#closed$),
          ),
      );
    } catch (error) {
      if (this.#closed)
        throw new Error("Relay request cancelled during account teardown", {
          cause: error,
        });
      throw error;
    }
  }

  subscription(
    relays: string[],
    filters: Filter | Filter[],
  ): Subscribable<NostrEvent> {
    if (this.#closed) return EMPTY;
    const targets = resolveRelays(relays, this.defaultRelays);
    return this.#pool
      .subscription(targets, filters, {
        onAuthRequired: this.#onAuthRequired,
      })
      .pipe(takeUntil(this.#closed$));
  }

  async getUserInboxRelays(pubkey: string): Promise<string[]> {
    if (this.#closed) throw new Error("Account connection is closed");
    const relays = await this.#directory.welcomeInboxes(
      pubkey,
      this.defaultRelays,
    );
    // A Welcome must reach the recipient's advertised inbox, not our bootstrap relays.
    return relays;
  }

  get relayCount(): number {
    return this.#pool.relays.size;
  }

  /** Stop requests and authentication, reconnect account-bound sockets, and
   * detach discovery while preserving other shared pool connections. */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#closed$.next();
    this.#closed$.complete();
    // AUTH state belongs to an account; reconnect before another account uses it.
    for (const relay of this.#pool.relays.values()) {
      if (relay.authenticated || relay.challenge) this.#pool.remove(relay);
    }
    this.#directory.close();
  }
}

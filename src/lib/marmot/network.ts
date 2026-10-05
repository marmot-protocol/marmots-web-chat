import type { NostrEvent } from "applesauce-core/helpers/event";
import type { Filter } from "applesauce-core/helpers/filter";
import type { RelayPool as AsRelayPool } from "applesauce-relay/pool";

import type {
  NostrNetworkInterface,
  PublishResponse,
  Subscribable,
} from "@internet-privacy/marmot-ts/client";

import type { AuthSigner, GroupReqOptions } from "applesauce-relay/types";
import { Subscription } from "rxjs";

import { autoAuthenticateRelays } from "./relay-auth";
import type { Directory } from "./discovery";

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
  /** Relays used when a call passes an empty list. Mutable: startup may adopt
   * the user's published NIP-65 relays after construction. */
  defaultRelays: string[];

  readonly #pool: AsRelayPool;
  readonly #directory: Directory;
  #closed = false;
  readonly #requests = new Subscription();
  readonly #auth: { unsubscribe(): void };

  constructor(
    pool: AsRelayPool,
    defaultRelays: string[],
    directory: Directory,
    signer: AuthSigner,
  ) {
    this.#pool = pool;
    this.defaultRelays = defaultRelays;
    this.#directory = directory;
    this.#auth = autoAuthenticateRelays(pool, signer);
  }

  async publish(
    relays: string[],
    event: NostrEvent,
  ): Promise<Record<string, PublishResponse>> {
    if (this.#closed) return {};
    const targets = resolveRelays(relays, this.defaultRelays);
    const responses = await this.#pool.publish(targets, event);
    if (!responses.some((response) => response.ok))
      throw new Error("No relay acknowledged the published event");
    const results: Record<string, PublishResponse> = {};
    for (const response of responses) results[response.from] = response;
    return results;
  }

  async request(
    relays: string[],
    filters: Filter | Filter[],
    options?: GroupReqOptions,
  ): Promise<NostrEvent[]> {
    if (this.#closed) return [];
    const targets = resolveRelays(relays, this.defaultRelays);
    const collected: NostrEvent[] = [];
    await new Promise<void>((resolve, reject) => {
      const request = this.#pool.request(targets, filters, options).subscribe({
        next: (event) => {
          if (this.#directory.add(event)) collected.push(event);
        },
        error: reject,
        complete: () => resolve(),
      });
      request.add(resolve);
      this.#requests.add(request);
    });
    return collected;
  }

  subscription(
    relays: string[],
    filters: Filter | Filter[],
  ): Subscribable<NostrEvent> {
    if (this.#closed) {
      return {
        subscribe: (observer) => {
          observer.complete?.();
          return { unsubscribe: () => {} };
        },
      };
    }
    const targets = resolveRelays(relays, this.defaultRelays);
    return this.#pool.subscription(targets, filters);
  }

  async getUserInboxRelays(pubkey: string): Promise<string[]> {
    if (this.#closed) return [];
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
    this.#auth.unsubscribe();
    this.#requests.unsubscribe();
    // AUTH state belongs to an account; reconnect before another account uses it.
    for (const relay of this.#pool.relays.values()) {
      if (relay.authenticated || relay.challenge) this.#pool.remove(relay);
    }
    this.#directory.close();
  }
}

import { parseNIP05Address } from "applesauce-core/helpers/dns-identity";
import { isHexKey } from "applesauce-core/helpers/string";
import { IdentityStatus } from "applesauce-loaders/helpers";
import { DnsIdentityLoader } from "applesauce-loaders/loaders";
import { castUser } from "applesauce-common/casts";
import type { EventStore } from "applesauce-core/event-store";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { getOutboxes } from "applesauce-core/helpers/mailboxes";
import {
  getInboxRelays,
  INBOX_RELAY_LIST_KIND,
  NIP65_RELAY_LIST_KIND,
} from "@internet-privacy/marmot-ts";

/**
 * Imperative accessors for other accounts' relay lists and NIP-05 identities, reading
 * straight from the shared {@link EventStore}. Subscribing to a replaceable the
 * store doesn't have triggers its loader (configured in `lib/nostr.ts`), which
 * batches/de-duplicates the request and falls back to the lookup relays — so
 * callers don't hand-roll NIP-65 lookups, and anything fetched here also lands
 * in the cache that powers the reactive UI.
 */
export class Directory {
  readonly #store: EventStore;
  readonly #dnsIdentities = new DnsIdentityLoader();
  #closed = false;

  constructor(store: EventStore) {
    this.#store = store;
  }

  /** Cache a verified public event fetched through the network adapter. */
  add(event: NostrEvent): boolean {
    if (this.#closed || this.#store.verifyEvent?.(event) === false)
      return false;
    return this.#store.add(event)?.id === event.id;
  }

  close(): void {
    this.#closed = true;
  }

  async #latest(
    kind: number,
    pubkey: string,
    hints?: string[],
  ): Promise<NostrEvent | undefined> {
    if (this.#closed) return undefined;
    const user = castUser(pubkey, this.#store);
    const event = await user
      .replaceable(kind, undefined, hints)
      .$first(10_000, undefined);
    if (this.#closed) return undefined;
    return event ?? undefined;
  }

  /** Resolve a NIP-05 identifier, including relay hints for discovery.
   * @param identifier - A name@domain identifier.
   * @returns The public key and advertised relay hints.
   */
  async resolveNip05(
    identifier: string,
  ): Promise<{ pubkey: string; relays: string[] }> {
    const address = parseNIP05Address(identifier.trim());
    if (!address) throw new Error(`Invalid NIP-05 identifier: ${identifier}`);
    const identity = await this.#dnsIdentities.requestIdentity(
      address.name,
      address.domain,
    );
    if (identity.status !== IdentityStatus.Found) {
      throw new Error(`NIP-05 lookup failed for ${identifier}`);
    }
    if (!isHexKey(identity.pubkey))
      throw new Error("NIP-05 returned an invalid public key");
    return {
      pubkey: identity.pubkey.toLowerCase(),
      relays: identity.relays ?? [],
    };
  }

  /** The account's NIP-65 (kind 10002) outbox relays. */
  async outboxes(pubkey: string, hints?: string[]): Promise<string[]> {
    const event = await this.#latest(NIP65_RELAY_LIST_KIND, pubkey, hints);
    return event ? getOutboxes(event) : [];
  }

  /** The account's Marmot welcome-inbox relays (kind 10050). */
  async welcomeInboxes(pubkey: string, hints?: string[]): Promise<string[]> {
    const event = await this.#latest(INBOX_RELAY_LIST_KIND, pubkey, hints);
    return event ? getInboxRelays(event) : [];
  }
}

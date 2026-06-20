import { castUser } from "applesauce-common/casts";
import type { EventStore } from "applesauce-core/event-store";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { getInboxes, getOutboxes } from "applesauce-core/helpers/mailboxes";
import {
  getProfileContent,
  type ProfileContent,
} from "applesauce-core/helpers/profile";

import {
  getInboxRelays,
  INBOX_RELAY_LIST_KIND,
  NIP65_RELAY_LIST_KIND,
} from "@internet-privacy/marmot-ts";

const METADATA_KIND = 0;

/**
 * Imperative accessors for other accounts' relay lists and profiles, reading
 * straight from the shared {@link EventStore}. Subscribing to a replaceable the
 * store doesn't have triggers its loader (configured in `lib/nostr.ts`), which
 * batches/de-duplicates the request and falls back to the lookup relays — so
 * callers don't hand-roll NIP-65 lookups, and anything fetched here also lands
 * in the cache that powers the reactive UI.
 */
export class Directory {
  readonly #store: EventStore;
  #closed = false;

  constructor(store: EventStore) {
    this.#store = store;
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

  /** The account's NIP-65 (kind 10002) outbox relays. */
  async outboxes(pubkey: string, hints?: string[]): Promise<string[]> {
    const event = await this.#latest(NIP65_RELAY_LIST_KIND, pubkey, hints);
    return event ? getOutboxes(event) : [];
  }

  /** The account's NIP-65 (kind 10002) inbox/read relays. */
  async inboxes(pubkey: string, hints?: string[]): Promise<string[]> {
    const event = await this.#latest(NIP65_RELAY_LIST_KIND, pubkey, hints);
    return event ? getInboxes(event) : [];
  }

  /** The account's Marmot welcome-inbox relays (kind 10050). */
  async welcomeInboxes(pubkey: string, hints?: string[]): Promise<string[]> {
    const event = await this.#latest(INBOX_RELAY_LIST_KIND, pubkey, hints);
    return event ? getInboxRelays(event) : [];
  }

  /** The account's parsed kind 0 profile metadata, or undefined. */
  async profile(
    pubkey: string,
    hints?: string[],
  ): Promise<ProfileContent | undefined> {
    const event = await this.#latest(METADATA_KIND, pubkey, hints);
    return event ? getProfileContent(event) : undefined;
  }
}

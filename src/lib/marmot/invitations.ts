import type { NostrEvent } from "applesauce-core/helpers/event";
import {
  relaySet,
  normalizeToPubkey,
  npubEncode,
} from "applesauce-core/helpers";
import {
  ADDRESSABLE_KEY_PACKAGE_KIND,
  getKeyPackage,
  getKeyPackageIdentifier,
  getKeyPackageReference,
  validateKeyPackageAccountIdentityProof,
} from "@internet-privacy/marmot-ts";
import { createInviteIntent } from "@internet-privacy/marmot-ts/client";
import type { EventStore } from "applesauce-core/event-store";
import { ciphersuites } from "@internet-privacy/marmot-ts/mls";

import type { Directory } from "@/lib/marmot/discovery";
import type { MarmotNetwork } from "@/lib/marmot/network";
import type { AppGroup, InviteCandidate, StatusLine } from "@/lib/marmot/types";

/** Public discovery inputs; application settings are supplied by the composition root. */
export interface KeyPackageDiscoveryOptions {
  directory: Pick<Directory, "resolveNip05" | "outboxes" | "welcomeInboxes">;
  network: Pick<MarmotNetwork, "request">;
  eventStore: Pick<EventStore, "getTimeline">;
  relays: string[];
  lookupRelays: () => string[];
  signal: AbortSignal;
  log: (text: string, level?: StatusLine["level"]) => void;
}

function npubShort(pubkey: string): string {
  const npub = npubEncode(pubkey);
  return `${npub.slice(0, 12)}…${npub.slice(-4)}`;
}

/** Find current device publications on the invitee's NIP-65 write relays. */
export class KeyPackageDiscovery {
  readonly #options: KeyPackageDiscoveryOptions;
  constructor(options: KeyPackageDiscoveryOptions) {
    this.#options = options;
  }

  /**
   * Discover devices without authenticating public KeyPackage queries.
   * @param input - Hex pubkey, NIP-19 profile pointer, or NIP-05 identifier.
   * @param onProgress - Optional UI progress callback.
   * @returns Current publications found on the queried relays.
   */
  async load(
    input: string,
    onProgress?: (step: string) => void,
  ): Promise<{ pubkey: string; events: NostrEvent[] }> {
    this.#options.signal.throwIfAborted();
    let pubkeyHex = normalizeToPubkey(input);
    let identityRelays: string[] = [];
    if (!pubkeyHex) {
      onProgress?.(`Resolving ${input}…`);
      const identity = await this.#options.directory.resolveNip05(input);
      pubkeyHex = identity.pubkey;
      identityRelays = relaySet(identity.relays);
    }
    onProgress?.("Finding outbox and invite inbox relays…");

    // Resolve the invitee's NIP-65 outbox relays — where their current key
    // packages live — and search THOSE specifically. Unioning with the
    // bootstrap relays surfaces stale key packages lingering on big public
    // relays; only fall back to bootstrap when no outbox can be found.
    const hints = relaySet(
      identityRelays,
      this.#options.relays,
      this.#options.lookupRelays(),
    );
    const [discovered] = await Promise.all([
      this.#options.directory.outboxes(pubkeyHex, hints),
      this.#options.directory.welcomeInboxes(pubkeyHex, hints),
    ]);
    const searchRelays = discovered.length
      ? relaySet(discovered)
      : relaySet(identityRelays, this.#options.relays);
    this.#options.log(
      discovered.length
        ? `searching ${npubShort(pubkeyHex)}'s outbox relays for key packages`
        : `no outbox relays found for ${npubShort(pubkeyHex)} — using bootstrap relays`,
      discovered.length ? "info" : "warn",
    );
    onProgress?.(`Fetching key packages from ${searchRelays.length} relay(s)…`);
    const kps = await this.#options.network.request(
      searchRelays,
      {
        kinds: [ADDRESSABLE_KEY_PACKAGE_KIND],
        authors: [pubkeyHex],
      },
      { waitForAuth: false },
    );
    this.#options.signal.throwIfAborted();
    if (!kps.length) {
      throw new Error(`no KeyPackage found for ${npubShort(pubkeyHex)}`);
    }

    // The shared EventStore owns NIP-01 replacement/tie-breaking semantics.
    const fetchedIds = new Set(kps.map((event) => event.id));
    return {
      pubkey: pubkeyHex,
      events: this.#options.eventStore
        .getTimeline({
          kinds: [ADDRESSABLE_KEY_PACKAGE_KIND],
          authors: [pubkeyHex],
        })
        .filter((event) => fetchedIds.has(event.id)),
    };
  }
}

/**
 * Evaluate a public KeyPackage with library validation before offering an invite.
 * @param event - Signed public KeyPackage publication.
 * @param actorPubkey - Account preparing the invitation.
 * @param group - Existing group, or undefined for default-suite founding membership.
 * @returns A display candidate with library-provided compatibility reasons.
 */
export function describeInviteCandidate(
  event: NostrEvent,
  actorPubkey: string,
  group?: AppGroup,
): InviteCandidate {
  const eligibility = group?.evaluateKeyPackage(event);
  const reasons = [...(eligibility?.reasons ?? [])];
  try {
    createInviteIntent({ keyPackageEvent: event, actorPubkey });
    validateKeyPackageAccountIdentityProof(
      getKeyPackage(event),
      group?.state.groupContext.cipherSuite ??
        ciphersuites.MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519,
    );
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : String(error));
  }
  return {
    id: event.id,
    event,
    createdAt: event.created_at,
    deviceId: getKeyPackageIdentifier(event) ?? null,
    refHex: getKeyPackageReference(event) ?? null,
    invitable: !reasons.length,
    alreadyMember: eligibility?.alreadyMember ?? false,
    reasons,
  };
}

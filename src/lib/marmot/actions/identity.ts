import type { EventSigner } from "applesauce-core";
import type { EventStore } from "applesauce-core/event-store";
import { kinds } from "applesauce-core/helpers/event";
import { ProfileFactory } from "applesauce-core/factories";
import {
  getProfileContent,
  type ProfileContent,
} from "applesauce-core/helpers/profile";
import {
  createInboxRelayListEvent,
  createNip65RelayListEvent,
} from "@internet-privacy/marmot-ts";

import type { MarmotNetwork } from "@/lib/marmot/network";

/** Public-identity publishing dependencies (not Marmot client state). */
export interface IdentityPublisher {
  signer: EventSigner;
  network: Pick<MarmotNetwork, "publish">;
  eventStore: EventStore;
  pubkey: string;
}

/**
 * Sign and publish the NIP-65 outbox (10002) and invite inbox (10050) lists.
 * @param publisher - Signer, network, and cache.
 * @param outbox - Normalized outbox relays.
 * @param inbox - Normalized inbox relays.
 * @param targets - Relays to announce on.
 */
export async function publishRelayLists(
  publisher: IdentityPublisher,
  outbox: string[],
  inbox: string[],
  targets: string[],
): Promise<void> {
  const { signer, network, eventStore, pubkey } = publisher;
  for (const draft of [
    createNip65RelayListEvent({ pubkey, relays: outbox }),
    createInboxRelayListEvent({ pubkey, relays: inbox }),
  ]) {
    const event = await signer.signEvent(draft);
    await network.publish(targets, event);
    eventStore.add(event);
  }
}

/**
 * Merge fields into the cached kind 0 profile and publish it. Blank fields are removed.
 * @param publisher - Signer, network, and cache.
 * @param relays - Relays to publish to.
 * @param fields - Profile fields to set.
 * @returns The merged profile content.
 */
export async function publishProfile(
  publisher: IdentityPublisher,
  relays: string[],
  fields: ProfileContent,
): Promise<ProfileContent> {
  const { signer, network, eventStore, pubkey } = publisher;
  const existing = eventStore.getReplaceable(kinds.Metadata, pubkey);
  const merged: Record<string, unknown> = {
    ...(existing ? getProfileContent(existing) : {}),
  };
  for (const [key, value] of Object.entries(fields)) {
    const text = typeof value === "string" ? value.trim() : value;
    if (text === "" || text == null) delete merged[key];
    else merged[key] = text;
  }
  const event = await ProfileFactory.create()
    .override(merged as ProfileContent)
    .sign(signer);
  await network.publish(relays, event);
  eventStore.add(event);
  return merged as ProfileContent;
}

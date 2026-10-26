import { EventStore } from "applesauce-core";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { ADDRESSABLE_KEY_PACKAGE_KIND } from "@internet-privacy/marmot-ts";
import { describe, expect, it, vi } from "vitest";

import { KeyPackageDiscovery } from "@/lib/marmot/invitations";

const PUBKEY = "11".repeat(32);
function publication(id: string, slot: string, created_at = 100): NostrEvent {
  return {
    id: id.repeat(64),
    pubkey: PUBKEY,
    kind: ADDRESSABLE_KEY_PACKAGE_KIND,
    content: "",
    tags: [["d", slot]],
    created_at,
    sig: "",
  };
}

function fixture(events: NostrEvent[]) {
  const eventStore = new EventStore({ verifyEvent: () => true });
  const directory = {
    resolveNip05: vi.fn(async () => ({
      pubkey: PUBKEY,
      relays: ["wss://hint.test"],
    })),
    outboxes: vi.fn(async () => ["wss://outbox.test"]),
    welcomeInboxes: vi.fn(async () => ["wss://inbox.test"]),
  };
  const network = {
    request: vi.fn(async () => {
      events.forEach((event) => eventStore.add(event));
      return events;
    }),
  };
  const discovery = new KeyPackageDiscovery({
    directory,
    network,
    eventStore,
    relays: ["wss://bootstrap.test"],
    lookupRelays: () => [],
    signal: new AbortController().signal,
    log: vi.fn(),
  });
  return { eventStore, directory, network, discovery };
}

describe("KeyPackage discovery", () => {
  it("uses EventStore replacement rules and excludes devices not found on the queried relays", async () => {
    const newest = publication("a", "current", 101);
    const older = publication("b", "current", 100);
    const { discovery, eventStore, network } = fixture([newest, older]);
    eventStore.add(publication("c", "abandoned"));
    try {
      expect((await discovery.load(PUBKEY)).events).toEqual([newest]);
      expect(network.request).toHaveBeenCalledWith(
        ["wss://outbox.test/"],
        { kinds: [ADDRESSABLE_KEY_PACKAGE_KIND], authors: [PUBKEY] },
        { waitForAuth: false },
      );
    } finally {
      eventStore.dispose();
    }
  });

  it("uses EventStore tie-breaking rather than arrival order", async () => {
    const winner = publication("a", "device");
    const other = publication("b", "device");
    for (const events of [
      [other, winner],
      [winner, other],
    ]) {
      const { discovery, eventStore } = fixture(events);
      try {
        expect((await discovery.load(PUBKEY)).events).toEqual([winner]);
      } finally {
        eventStore.dispose();
      }
    }
  });
});

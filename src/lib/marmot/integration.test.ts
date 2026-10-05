import type { NostrEvent } from "applesauce-core/helpers";
import { EMPTY } from "rxjs";
import { describe, expect, it } from "vitest";
import { getGroupMembers } from "@internet-privacy/marmot-ts";
import type { NostrNetworkInterface } from "@internet-privacy/marmot-ts/client";

import { makeTestClient } from "./test-helpers";

function testNetwork(events: NostrEvent[] = []): NostrNetworkInterface {
  return {
    publish: async (relays, event) => {
      events.push(event);
      return Object.fromEntries(
        relays.map((relay) => [relay, { ok: true, from: relay }]),
      );
    },
    request: async () => [],
    subscription: () => EMPTY,
    getUserInboxRelays: async () => ["wss://inbox.test"],
  };
}

describe("current marmot protocol integration", () => {
  it("generates current identity proofs through a signer without raw secret access", async () => {
    const client = makeTestClient(testNetwork());
    expect("key" in client.signer).toBe(false);
    await client.keyPackages.create({ relays: ["wss://relay.test"] });
    const [pkg] = await client.keyPackages.list();
    expect(pkg.nonCurrent).not.toBe(true);
    expect(pkg.published).toHaveLength(1);
  });

  it("creates founding membership, delivers a Welcome, and joins with matching state", async () => {
    const events: NostrEvent[] = [];
    const network = testNetwork(events);
    const creator = makeTestClient(network);
    const invitee = makeTestClient(network);
    await invitee.keyPackages.create({ relays: ["wss://relay.test"] });
    const [pkg] = await invitee.keyPackages.list();
    const group = await creator.groups.create("Founding members", {
      relays: ["wss://relay.test"],
      invitees: [pkg.published![0]],
    });
    expect(group.state.groupContext.epoch).toBe(1n);
    expect(group.profileSupport.kind).toBe("supported");
    expect(group.pendingWelcomes).toEqual([]);
    expect(events.filter((event) => event.kind === 445)).toHaveLength(0);
    const wraps = events.filter((event) => event.kind === 1059);
    expect(wraps).toHaveLength(1);
    await invitee.invites.ingestEvents(wraps);
    await invitee.invites.decryptGiftWraps();
    const [welcome] = await invitee.invites.getUnread();
    const { group: joined } = await invitee.joinGroupFromWelcome({
      welcomeRumor: welcome,
    });
    expect(joined.idStr).toBe(group.idStr);
    expect(joined.state.groupContext.epoch).toBe(
      group.state.groupContext.epoch,
    );
    expect(getGroupMembers(joined.state)).toEqual(getGroupMembers(group.state));
    joined.dispose();
    group.dispose();
  });
});

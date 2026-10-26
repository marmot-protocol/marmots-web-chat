import type { NostrEvent } from "applesauce-core/helpers";
import { PrivateKeySigner } from "applesauce-signers";
import { EMPTY } from "rxjs";
import { describe, expect, it } from "vitest";
import {
  getGroupMembers,
  encryptedMediaBlossomDefault,
  StaleMediaPreparationError,
} from "@internet-privacy/marmot-ts";
import {
  prepareMediaMessage,
  downloadMediaAttachment,
  createChatRumor,
  createApplicationMessageIntent,
  Proposals,
} from "@internet-privacy/marmot-ts/client";
import { InMemoryKeyValueStore } from "@internet-privacy/marmot-ts/extra";
import type {
  NostrNetworkInterface,
  MediaBlobTransport,
} from "@internet-privacy/marmot-ts/client";

import legacyGroup from "./fixtures/group-v0.7.json";
import { makeTestClient } from "./helpers";

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

  it("loads an actual 0.7.0 stored group and continues messaging on 0.8.0", async () => {
    const groupStateStore = new InMemoryKeyValueStore<Uint8Array>();
    await groupStateStore.setItem(
      legacyGroup.groupId,
      Uint8Array.from(atob(legacyGroup.state), (char) => char.charCodeAt(0)),
    );
    const signer = new PrivateKeySigner(
      Uint8Array.from(legacyGroup.testSecretKey.match(/../g)!, (byte) =>
        parseInt(byte, 16),
      ),
    );
    const client = makeTestClient(testNetwork(), { groupStateStore, signer });
    const [group] = await client.groups.loadAll();
    try {
      expect(group.groupData?.name).toBe("Saved with 0.7.0");
      expect(group.profileSupport.kind).toBe("supported");
      await client.groups.send(
        group.id,
        createApplicationMessageIntent(
          createChatRumor({
            pubkey: await signer.getPublicKey(),
            content: "Upgraded successfully",
          }),
        ),
      );
      expect((await group.history.queryRumors({ kinds: [9] }))[0].content).toBe(
        "Upgraded successfully",
      );
    } finally {
      group.dispose();
    }
  });

  it("decrypts source-bound media after a commit and restart, and rejects stale sends", async () => {
    const network = testNetwork();
    const groupStateStore = new InMemoryKeyValueStore<Uint8Array>();
    const ingestStateStore = new InMemoryKeyValueStore<Uint8Array>();
    const rewindStore = new InMemoryKeyValueStore<Uint8Array>();
    const stores = { groupStateStore, ingestStateStore, rewindStore };
    const client = makeTestClient(network, stores);
    const blobs = new Map<string, Uint8Array>();
    const transport: MediaBlobTransport = {
      upload: async ({ data, ciphertextSha256 }) => {
        const url = `https://blobs.test/${ciphertextSha256}`;
        blobs.set(url, data);
        return url;
      },
      fetch: async ({ url }) => {
        const bytes = blobs.get(url);
        if (!bytes) throw new Error("Missing blob");
        return bytes;
      },
    };
    const group = await client.groups.create("Media restart", {
      relays: ["wss://relay.test"],
      encryptedMedia: encryptedMediaBlossomDefault(["https://blobs.test"]),
    });
    let restored: typeof group | undefined;
    try {
      const prepared = await prepareMediaMessage(
        group,
        [
          {
            blob: new Blob(["private photo"], { type: "image/png" }),
            metadata: { filename: "photo.png" },
          },
        ],
        { transport, caption: "caption" },
      );
      await client.groups.send(group.id, prepared.intent);
      const source = await group.session.mediaSourceForRumor(prepared.rumor.id);
      expect(source).toBe(prepared.intent.expectedParent);
      await group.selfUpdate();
      group.dispose();
      const restarted = makeTestClient(network, {
        ...stores,
        signer: client.signer,
      });
      [restored] = await restarted.groups.loadAll();
      expect(
        await restored.session.mediaSourceForRumor(prepared.rumor.id),
      ).toBe(source);
      const media = await downloadMediaAttachment(
        restored,
        prepared.attachments[0],
        source!,
        { transport },
      );
      expect(new TextDecoder().decode(media.data)).toBe("private photo");
      await expect(
        restarted.groups.send(restored.id, prepared.intent),
      ).rejects.toBeInstanceOf(StaleMediaPreparationError);
    } finally {
      restored?.dispose();
      group.dispose();
    }
  }, 15_000);

  it("retries the original pending commit after an uncertain publication and restart", async () => {
    const events: NostrEvent[] = [];
    const network = testNetwork(events);
    const stores = {
      groupStateStore: new InMemoryKeyValueStore<Uint8Array>(),
      ingestStateStore: new InMemoryKeyValueStore<Uint8Array>(),
      rewindStore: new InMemoryKeyValueStore<Uint8Array>(),
    };
    const client = makeTestClient(network, stores);
    const group = await client.groups.create("Pending commit", {
      relays: ["wss://relay.test"],
    });
    const epoch = group.state.groupContext.epoch;
    const originalPublish = network.publish;
    let original: NostrEvent | undefined;
    network.publish = async (_relays, event) => {
      original = event;
      throw new Error("ACK lost");
    };
    let restored: typeof group | undefined;
    try {
      await expect(group.selfUpdate()).rejects.toThrow(
        "publication is uncertain",
      );
      group.dispose();
      network.publish = originalPublish;
      const restarted = makeTestClient(network, {
        ...stores,
        signer: client.signer,
      });
      [restored] = await restarted.groups.loadAll();
      await restored.retryPendingPublication();
      expect(events.at(-1)).toEqual(original);
      expect(restored.state.groupContext.epoch).toBe(epoch + 1n);
      expect(await restored.retryPendingPublication()).toEqual([]);
    } finally {
      restored?.dispose();
      group.dispose();
    }
  }, 15_000);

  it("allows an admin to step down and leave after handing over administration", async () => {
    const network = testNetwork();
    const creator = makeTestClient(network);
    const peer = makeTestClient(network);
    await peer.keyPackages.create({ relays: ["wss://relay.test"] });
    const [pkg] = await peer.keyPackages.list();
    const group = await creator.groups.create("Admin handover", {
      relays: ["wss://relay.test"],
      invitees: [pkg.published![0]],
    });
    const ownPubkey = await creator.signer.getPublicKey();
    const nextAdmin = await peer.signer.getPublicKey();
    try {
      await expect(creator.groups.leave(group.id)).rejects.toThrow();
      await creator.groups.commit(group.id, {
        extraProposals: await Proposals.proposeUpdateMetadata({
          adminPubkeys: [ownPubkey, nextAdmin],
        })(group.session.proposalContext()),
      });
      await creator.groups.commit(group.id, {
        extraProposals: await Proposals.proposeUpdateMetadata({
          adminPubkeys: [nextAdmin],
        })(group.session.proposalContext()),
      });
      expect(group.groupData?.adminPubkeys).toEqual([nextAdmin]);
      await creator.groups.leave(group.id);
      expect(await creator.groups.loadAll()).toEqual([]);
    } finally {
      group.dispose();
    }
  }, 15_000);

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

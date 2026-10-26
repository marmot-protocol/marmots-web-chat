import {
  GroupRumorHistory,
  deserializeApplicationData,
  makeLeafAppComponentsExtension,
} from "@internet-privacy/marmot-ts";
import { EventStore } from "applesauce-core";
import { getEventHash, kinds, verifyRumor } from "applesauce-core/helpers";
import type { NostrEvent } from "applesauce-core/helpers";
import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import type { ListedKeyPackage } from "@internet-privacy/marmot-ts/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryKeyValueStore,
  KeyValueRumorHistoryBackend,
} from "@internet-privacy/marmot-ts/extra";
import { EMPTY } from "rxjs";

import { MarmotAccount } from "@/lib/marmot/account";
import { leaveGroup } from "@/lib/marmot/actions/group-admin";
import { inviteKeyPackages } from "@/lib/marmot/actions/invites";
import { sendReaction, sendText } from "@/lib/marmot/actions/messages";
import { purgeLegacyKeyPackages } from "@/lib/marmot/actions/key-packages";
import type { AppGroup, AppMarmotClient } from "@/lib/marmot/types";
import type { Directory } from "@/lib/marmot/discovery";
import type { MarmotNetwork } from "@/lib/marmot/network";

import { makeTestClient } from "./helpers";

const PUBKEY = "11".repeat(32);
const SLOT = "aa".repeat(32);
const running: MarmotAccount[] = [];
afterEach(() => {
  running.splice(0).forEach((account) => account.stop());
});

function pkg(identifier = SLOT, nonCurrent = false): ListedKeyPackage {
  return {
    identifier,
    publicPackage: {
      leafNode: {
        extensions: [makeLeafAppComponentsExtension(new Uint8Array(104))],
      },
    },
    nonCurrent,
    keyPackageRef: new Uint8Array([1]),
    used: false,
    published: [
      { id: "33".repeat(32), created_at: 1, tags: [] } as unknown as NostrEvent,
    ],
  } as ListedKeyPackage;
}

function fixture(
  options: {
    packages?: ListedKeyPackage[];
    groups?: AppGroup[];
    fresh?: boolean;
  } = {},
) {
  let packages = options.packages ?? [];
  const groups = options.groups ?? [];
  const unsubscribe = vi.fn();
  const client = {
    keyPackages: {
      list: vi.fn(async () => packages),
      ensurePublished: vi.fn(async () => {
        const existing = packages.find(
          (p) =>
            !p.used &&
            !p.nonCurrent &&
            p.identifier === SLOT &&
            p.published?.length,
        );
        if (existing) return existing;
        return client.keyPackages.create();
      }),
      create: vi.fn(async () => {
        const current = pkg();
        packages = [...packages, current];
        return current;
      }),
      purge: vi.fn(async (refs: Uint8Array | Uint8Array[]) => {
        const gone = (Array.isArray(refs) ? refs : [refs]).map(String);
        packages = packages.filter(
          (p) => !gone.includes(String(p.keyPackageRef)),
        );
      }),
    },
    signer: { getPublicKey: async () => PUBKEY },
    groups: {
      loaded: [] as AppGroup[],
      loadAll: vi.fn(async () => {
        client.groups.loaded = groups;
        return groups;
      }),
      on: vi.fn(),
      off: vi.fn(),
      connectAll: vi.fn(() => ({ unsubscribe })),
      watch: async function* () {
        yield groups;
      },
      send: vi.fn(),
      commit: vi.fn(async () => []),
      leave: vi.fn(async () => ({})),
      destroy: vi.fn(async () => {}),
    },
    invites: { listen: vi.fn(async () => ({ unsubscribe })) },
  };
  const directory = {
    outboxes: vi.fn(async () => ["wss://outbox.test"]),
    welcomeInboxes: vi.fn(async () => ["wss://inbox.test"]),
  };
  const network = {
    close: vi.fn(),
    relayCount: 0,
    publish: vi.fn(async () => ({})),
    request: vi.fn(),
  };
  const signer = {
    getPublicKey: () => PUBKEY,
    signEvent: vi.fn(async (event) => ({
      ...event,
      pubkey: PUBKEY,
      id: getEventHash({ ...event, pubkey: PUBKEY }),
      sig: "00".repeat(64),
    })),
  };
  const eventStore = new EventStore();
  eventStore.verifyEvent = () => true;
  const account = new MarmotAccount({
    client: client as unknown as AppMarmotClient,
    network: network as unknown as MarmotNetwork,
    directory: directory as unknown as Directory,
    signer,
    eventStore,
    pubkey: PUBKEY,
    relays: ["wss://bootstrap.test"],
    fresh: options.fresh ?? false,
    clientId: SLOT,
    lookupRelays: () => ["wss://index.test"],
  });
  running.push(account);
  const appClient = client as unknown as AppMarmotClient;
  return { account, client, appClient, directory, network };
}

function group(unsupported = false): AppGroup {
  return {
    id: new Uint8Array([1]),
    idStr: "aa",
    groupData: { name: "Saved group", adminPubkeys: [PUBKEY] },
    profileSupport: unsupported
      ? { kind: "unsupported", proofReason: "legacy-group" }
      : { kind: "supported" },
    status: "active",
    on: vi.fn(),
    off: vi.fn(),
    history: new GroupRumorHistory(
      new KeyValueRumorHistoryBackend(new InMemoryKeyValueStore()),
    ),
    dispose: vi.fn(),
    retryPendingPublication: vi.fn(async () => []),
    destroy: vi.fn(async () => {}),
    media: {
      getMedia: vi.fn(async () => ({
        data: new Uint8Array([42]),
        attachment: { mediaType: "image/png" },
      })),
    },
  } as unknown as AppGroup;
}

describe("account runtime and actions", () => {
  it("shares startup and detaches account listeners on stop", async () => {
    const { account, client } = fixture({
      groups: [group()],
      packages: [pkg()],
    });
    const first = account.start();
    expect(account.start()).toBe(first);
    await first;
    expect(client.groups.connectAll).toHaveBeenCalledOnce();
    expect(account.groupsRestored$.value).toBe(true);
    account.stop();
    expect(client.groups.off).toHaveBeenCalledWith(
      "unreadable",
      expect.any(Function),
    );
    await expect(account.start()).rejects.toThrow("stopped");
  });

  it("re-listens for invites only when the inbox list changes", async () => {
    const { account, client } = fixture({ packages: [pkg()] });
    await account.start();
    // Startup listens on the (empty) inbox, then on the discovered one.
    await vi.waitFor(() =>
      expect(client.invites.listen).toHaveBeenLastCalledWith([
        "wss://inbox.test/",
      ]),
    );
    const calls = client.invites.listen.mock.calls.length;
    account.inboxRelays$.next(["wss://inbox.test"]);
    expect(client.invites.listen).toHaveBeenCalledTimes(calls);
    account.inboxRelays$.next(["wss://other.test"]);
    expect(client.invites.listen).toHaveBeenCalledTimes(calls + 1);
    expect(client.invites.listen).toHaveBeenLastCalledWith([
      "wss://other.test/",
    ]);
  });

  it("gives identical concurrent text messages distinct identities", async () => {
    const saved = {
      ...group(),
      signer: { getPublicKey: () => PUBKEY },
    } as AppGroup;
    const { appClient } = fixture();
    const prepared: Rumor[] = [];
    await Promise.all([
      sendText(appClient, saved, "same message", undefined, (rumor) =>
        prepared.push(rumor),
      ),
      sendText(appClient, saved, "same message", undefined, (rumor) =>
        prepared.push(rumor),
      ),
    ]);
    expect(prepared).toHaveLength(2);
    expect(prepared[0].id).not.toBe(prepared[1].id);
    expect(prepared.every((rumor) => rumor.content === "same message")).toBe(
      true,
    );
  });

  it("builds replies and reactions with library factories without signing private rumors", async () => {
    const signEvent = vi.fn();
    const saved = {
      ...group(),
      signer: { getPublicKey: () => PUBKEY, signEvent },
    } as unknown as AppGroup;
    const { appClient, client } = fixture();
    const target = { id: "44".repeat(32), pubkey: "22".repeat(32) };
    let reply: Rumor | undefined;
    await sendText(appClient, saved, "reply", target, (rumor) => {
      reply = rumor;
    });
    expect(reply?.kind).toBe(kinds.ChatMessage);
    expect(reply?.tags).toContainEqual(["q", target.id, "", target.pubkey]);
    expect(verifyRumor(reply!)).toBe(true);
    client.groups.send.mockClear();
    await sendReaction(appClient, saved, target, "👍");
    const [, intent] = client.groups.send.mock.calls[0] as unknown as [
      Uint8Array,
      { payload: Uint8Array },
    ];
    const reaction = deserializeApplicationData(intent.payload);
    expect(reaction.kind).toBe(kinds.Reaction);
    expect(reaction.tags).toContainEqual(["k", String(kinds.ChatMessage)]);
    expect(verifyRumor(reaction)).toBe(true);
    expect(signEvent).not.toHaveBeenCalled();
  });

  it("publishes a current per-device package despite legacy unused packages, preserving old keys", async () => {
    const legacy = pkg("marmot-web", true);
    const { account, client } = fixture({ packages: [legacy] });
    await account.start();
    expect(client.keyPackages.ensurePublished).toHaveBeenCalledExactlyOnceWith({
      relays: ["wss://outbox.test/"],
      identifier: SLOT,
    });
    expect(client.keyPackages.purge).not.toHaveBeenCalled();
  });

  it("keeps an existing current device package and creates no duplicates", async () => {
    const { account, client } = fixture({ packages: [pkg()] });
    await account.start();
    expect(client.keyPackages.create).not.toHaveBeenCalled();
  });

  it("retries publication when a current package exists locally but was never published", async () => {
    const unpublished = { ...pkg(), published: [] };
    const { account, client } = fixture({ packages: [unpublished] });
    await account.start();
    expect(client.keyPackages.create).toHaveBeenCalledOnce();
  });

  it("does not duplicate a newly published package when ensurePublished returns a summary", async () => {
    const { account, client } = fixture();
    client.keyPackages.ensurePublished.mockImplementationOnce(async () => {
      const created = await client.keyPackages.create();
      return { ...created, published: undefined };
    });
    await account.start();
    expect(client.keyPackages.create).toHaveBeenCalledOnce();
  });

  it("requires both relay lists and retries missing discovery before publishing", async () => {
    const { account, client, directory } = fixture();
    directory.welcomeInboxes.mockResolvedValue([]);
    await account.start();
    expect(client.keyPackages.create).not.toHaveBeenCalled();
    await expect(account.requireKeyPackageRelays()).rejects.toThrow(
      "inbox relays",
    );
    directory.welcomeInboxes.mockResolvedValue(["wss://inbox.test"]);
    await account.ensureKeyPackage();
    expect(directory.welcomeInboxes.mock.calls.length).toBeGreaterThan(1);
    expect(client.keyPackages.create).toHaveBeenCalledOnce();
  });

  it("publishes fresh account relay lists even when no display name was supplied", async () => {
    const { account, network, client } = fixture({ fresh: true });
    await account.start();
    expect(
      network.publish.mock.calls.map(
        (call) => (call as unknown as [unknown, NostrEvent])[1].kind,
      ),
    ).toEqual([10002, 10050]);
    expect(client.keyPackages.create).toHaveBeenCalledOnce();
  });

  it("purges legacy material only through the explicit retirement action", async () => {
    const { account, appClient, client } = fixture({
      packages: [
        pkg(),
        { ...pkg("old", true), keyPackageRef: new Uint8Array([2]) },
      ],
    });
    await account.start();
    expect(client.keyPackages.purge).not.toHaveBeenCalled();
    expect(await purgeLegacyKeyPackages(appClient, SLOT)).toBe(1);
    expect(client.keyPackages.purge).toHaveBeenCalledExactlyOnceWith([
      new Uint8Array([2]),
    ]);
  });

  it("auto-retires packages under pre-0.7 device-label slots after publishing under the new slot", async () => {
    const oldSlot = {
      ...pkg("marmot-web-0123456789abcdef"),
      keyPackageRef: new Uint8Array([2]),
    };
    const { account, client } = fixture({ packages: [oldSlot] });
    await account.start();
    expect(client.keyPackages.create).toHaveBeenCalledOnce();
    expect(client.keyPackages.purge).toHaveBeenCalledExactlyOnceWith(
      oldSlot.keyPackageRef,
    );
    expect(client.keyPackages.create.mock.invocationCallOrder[0]).toBeLessThan(
      client.keyPackages.purge.mock.invocationCallOrder[0],
    );
  });

  it("warns and keeps an old-slot package when its retirement fails", async () => {
    const oldSlot = {
      ...pkg("marmot-web-0123456789abcdef"),
      keyPackageRef: new Uint8Array([2]),
    };
    const { account, client } = fixture({ packages: [pkg(), oldSlot] });
    client.keyPackages.purge.mockRejectedValueOnce(new Error("no routes"));
    await account.start();
    expect(client.keyPackages.create).not.toHaveBeenCalled();
    expect(
      account.notices$.value.some((line) => line.text.includes("no routes")),
    ).toBe(true);
  });

  it("preserves unsupported groups, refuses sends, and disposes them on account teardown", async () => {
    const saved = group(true);
    const { account, appClient, client } = fixture({
      packages: [pkg()],
      groups: [saved],
    });
    await account.start();
    expect(account.findGroup("aa")).toBe(saved);
    expect(saved.destroy).not.toHaveBeenCalled();
    await expect(sendText(appClient, saved, "hello")).rejects.toThrow(
      "older profile",
    );
    expect(client.groups.send).not.toHaveBeenCalled();
    account.stop();
    expect(saved.dispose).toHaveBeenCalledOnce();
  });

  it("restores saved groups even when publishing a key package fails", async () => {
    const saved = group();
    const { account, client } = fixture({ groups: [saved] });
    client.keyPackages.create.mockRejectedValue(new Error("relay offline"));
    await account.start();
    expect(account.findGroup("aa")).toBe(saved);
    expect(
      account.notices$.value.some((line) => line.text === "relay offline"),
    ).toBe(true);
  });

  it("refuses a hash-only media cache hit without authenticated source evidence", async () => {
    const saved = {
      ...group(),
      session: { mediaSourceForRumor: vi.fn(async () => undefined) },
    } as unknown as AppGroup;
    const { account } = fixture({ packages: [pkg()], groups: [saved] });
    await expect(
      account.media.download(
        saved,
        {
          ciphertextSha256: "abc",
        } as Parameters<MarmotAccount["media"]["download"]>[1],
        "rumor-id",
      ),
    ).rejects.toThrow("source keys");
    expect(saved.media.getMedia).not.toHaveBeenCalled();
  });

  it("retries retained commit publication when restoring an active group", async () => {
    const saved = group();
    const { account } = fixture({ groups: [saved], packages: [pkg()] });
    await account.start();
    expect(saved.retryPendingPublication).toHaveBeenCalledOnce();
  });

  it("refuses to let the last admin leave", async () => {
    const saved = group();
    const { appClient, client } = fixture({ groups: [saved] });
    await expect(leaveGroup(appClient, saved)).rejects.toThrow(
      "Promote another member",
    );
    expect(client.groups.leave).not.toHaveBeenCalled();
  });

  it("propagates a non-admin's failed leave publication", async () => {
    const saved = {
      ...group(),
      groupData: { adminPubkeys: ["22".repeat(32)] },
    } as unknown as AppGroup;
    const { appClient, client } = fixture({ groups: [saved] });
    client.groups.leave.mockRejectedValueOnce(new Error("Relay offline"));
    await expect(leaveGroup(appClient, saved)).rejects.toThrow("Relay offline");
    expect(client.groups.commit).not.toHaveBeenCalled();
  });

  it("reports failed Welcome fanout instead of treating a committed membership as a delivered invite", async () => {
    const saved = group();
    const { appClient, client } = fixture({ groups: [saved] });
    client.groups.send.mockResolvedValue([
      {
        welcomeDelivery: {
          kind: "attempted",
          outcomes: [
            {
              kind: "failed",
              recipient: { pubkey: PUBKEY },
              error: "relay rejected",
            },
          ],
        },
      },
    ]);
    const peer = makeTestClient({
      publish: async () => ({
        "wss://relay.test": { ok: true, from: "wss://relay.test" },
      }),
      request: async () => [],
      subscription: () => EMPTY,
      getUserInboxRelays: async () => [],
    });
    await peer.keyPackages.create({ relays: ["wss://relay.test"] });
    const [keyPackage] = await peer.keyPackages.list();
    await expect(
      inviteKeyPackages(appClient, saved, keyPackage.published!),
    ).rejects.toThrow("Membership was updated");
    expect(client.groups.send).toHaveBeenCalledOnce();
  });
});

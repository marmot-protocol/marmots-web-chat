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

import { MarmotController } from "@/lib/marmot/controller";
import type { AppGroup, AppMarmotClient } from "@/lib/marmot/types";
import type { Directory } from "@/lib/marmot/discovery";
import type { MarmotNetwork } from "@/lib/marmot/network";

import { makeTestClient } from "./helpers";

const PUBKEY = "11".repeat(32);
const SLOT = "aa".repeat(32);
const controllers: MarmotController[] = [];
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.stop());
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
    groups: {
      loadAll: vi.fn(async () => groups),
      on: vi.fn(),
      off: vi.fn(),
      connectAll: vi.fn(() => ({ unsubscribe })),
      watch: async function* () {
        yield groups;
      },
      send: vi.fn(),
      commit: vi.fn(async () => []),
      leave: vi.fn(async () => ({})),
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
  const controller = new MarmotController({
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
  controllers.push(controller);
  return { controller, client, directory, network };
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

describe("dependency migration", () => {
  it("shares startup and detaches account listeners on stop", async () => {
    const { controller, client } = fixture({
      groups: [group()],
      packages: [pkg()],
    });
    const first = controller.start();
    expect(controller.start()).toBe(first);
    await first;
    expect(client.groups.connectAll).toHaveBeenCalledOnce();
    controller.stop();
    expect(client.groups.off).toHaveBeenCalledWith(
      "unreadable",
      expect.any(Function),
    );
    await expect(controller.start()).rejects.toThrow("stopped");
  });

  it("keeps busy true until overlapping actions have both completed", async () => {
    const { controller, client } = fixture({ packages: [pkg()] });
    await controller.start();
    let finishFirst!: (value: ListedKeyPackage) => void;
    let finishSecond!: (value: ListedKeyPackage) => void;
    client.keyPackages.create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve;
        }),
    );
    client.keyPackages.create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSecond = resolve;
        }),
    );
    const first = controller.publishKeyPackage();
    const second = controller.publishKeyPackage();
    await vi.waitFor(() =>
      expect(client.keyPackages.create).toHaveBeenCalledTimes(2),
    );
    finishFirst(pkg());
    await first;
    expect(controller.getSnapshot().busy).toBe(true);
    finishSecond(pkg());
    await second;
    expect(controller.getSnapshot().busy).toBe(false);
  });

  it("gives identical concurrent text messages distinct identities", async () => {
    const saved = {
      ...group(),
      signer: { getPublicKey: () => PUBKEY },
    } as AppGroup;
    const { controller } = fixture({ groups: [saved], packages: [pkg()] });
    await controller.start();
    const prepared: Rumor[] = [];
    await Promise.all([
      controller.sendText(saved.idStr, "same message", undefined, (rumor) =>
        prepared.push(rumor),
      ),
      controller.sendText(saved.idStr, "same message", undefined, (rumor) =>
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
    const { controller, client } = fixture({
      groups: [saved],
      packages: [pkg()],
    });
    await controller.start();
    const target = { id: "44".repeat(32), pubkey: "22".repeat(32) };
    let reply: Rumor | undefined;
    await controller.sendText(saved.idStr, "reply", target, (rumor) => {
      reply = rumor;
    });
    expect(reply?.kind).toBe(kinds.ChatMessage);
    expect(reply?.tags).toContainEqual(["q", target.id, "", target.pubkey]);
    expect(verifyRumor(reply!)).toBe(true);
    client.groups.send.mockClear();
    await controller.sendReaction(saved.idStr, target, "👍");
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
    const { controller, client } = fixture({ packages: [legacy] });
    await controller.start();
    expect(client.keyPackages.ensurePublished).toHaveBeenCalledExactlyOnceWith({
      relays: ["wss://outbox.test/"],
      identifier: SLOT,
    });
    expect(client.keyPackages.purge).not.toHaveBeenCalled();
    expect(controller.getSnapshot().keyPackages).toMatchObject({
      unused: 1,
      legacy: 1,
      slot: SLOT,
    });
  });

  it("keeps an existing current device package and creates no duplicates", async () => {
    const { controller, client } = fixture({ packages: [pkg()] });
    await controller.start();
    expect(client.keyPackages.create).not.toHaveBeenCalled();
  });

  it("retries publication when a current package exists locally but was never published", async () => {
    const unpublished = { ...pkg(), published: [] };
    const { controller, client } = fixture({ packages: [unpublished] });
    await controller.start();
    expect(client.keyPackages.create).toHaveBeenCalledOnce();
  });

  it("does not duplicate a newly published package when ensurePublished returns a summary", async () => {
    const { controller, client } = fixture();
    client.keyPackages.ensurePublished.mockImplementationOnce(async () => {
      const created = await client.keyPackages.create();
      return { ...created, published: undefined };
    });
    await controller.start();
    expect(client.keyPackages.create).toHaveBeenCalledOnce();
  });

  it("requires both relay lists and retries missing discovery before publishing", async () => {
    const { controller, client, directory } = fixture();
    directory.welcomeInboxes.mockResolvedValue([]);
    await controller.start();
    expect(client.keyPackages.create).not.toHaveBeenCalled();
    await controller.refreshRelayLists();
    directory.welcomeInboxes.mockResolvedValue(["wss://inbox.test"]);
    await controller.publishKeyPackage();
    expect(directory.welcomeInboxes.mock.calls.length).toBeGreaterThan(1);
    expect(client.keyPackages.create).toHaveBeenCalledOnce();
  });

  it("publishes fresh account relay lists even when no display name was supplied", async () => {
    const { controller, network, client } = fixture({ fresh: true });
    await controller.start();
    expect(
      network.publish.mock.calls.map(
        (call) => (call as unknown as [unknown, NostrEvent])[1].kind,
      ),
    ).toEqual([10002, 10050]);
    expect(client.keyPackages.create).toHaveBeenCalledOnce();
  });

  it("purges legacy material only through the explicit retirement action", async () => {
    const { controller, client } = fixture({
      packages: [
        pkg(),
        { ...pkg("old", true), keyPackageRef: new Uint8Array([2]) },
      ],
    });
    await controller.start();
    expect(client.keyPackages.purge).not.toHaveBeenCalled();
    await controller.purgeLegacyKeyPackages();
    expect(client.keyPackages.purge).toHaveBeenCalledExactlyOnceWith([
      new Uint8Array([2]),
    ]);
    expect(controller.getSnapshot().keyPackages.legacy).toBe(0);
  });

  it("auto-retires packages under pre-0.7 device-label slots after publishing under the new slot", async () => {
    const oldSlot = {
      ...pkg("marmot-web-0123456789abcdef"),
      keyPackageRef: new Uint8Array([2]),
    };
    const { controller, client } = fixture({ packages: [oldSlot] });
    await controller.start();
    expect(client.keyPackages.create).toHaveBeenCalledOnce();
    expect(client.keyPackages.purge).toHaveBeenCalledExactlyOnceWith(
      oldSlot.keyPackageRef,
    );
    expect(client.keyPackages.create.mock.invocationCallOrder[0]).toBeLessThan(
      client.keyPackages.purge.mock.invocationCallOrder[0],
    );
    expect(controller.getSnapshot().keyPackages.legacy).toBe(0);
  });

  it("keeps an old-slot package listed as legacy when its retirement fails", async () => {
    const oldSlot = {
      ...pkg("marmot-web-0123456789abcdef"),
      keyPackageRef: new Uint8Array([2]),
    };
    const { controller, client } = fixture({ packages: [pkg(), oldSlot] });
    client.keyPackages.purge.mockRejectedValueOnce(new Error("no routes"));
    await controller.start();
    expect(client.keyPackages.create).not.toHaveBeenCalled();
    expect(controller.getSnapshot().keyPackages.legacy).toBe(1);
  });

  it("preserves unsupported groups, refuses sends, and disposes them on account teardown", async () => {
    const saved = group(true);
    const { controller, client } = fixture({
      packages: [pkg()],
      groups: [saved],
    });
    await controller.start();
    expect(controller.getGroup("aa")).toBe(saved);
    expect(saved.destroy).not.toHaveBeenCalled();
    await expect(controller.sendText("aa", "hello")).rejects.toThrow(
      "older profile",
    );
    expect(client.groups.send).not.toHaveBeenCalled();
    controller.stop();
    expect(saved.dispose).toHaveBeenCalledOnce();
  });

  it("restores saved groups even when publishing a key package fails", async () => {
    const saved = group();
    const { controller, client } = fixture({ groups: [saved] });
    client.keyPackages.create.mockRejectedValue(new Error("relay offline"));
    await controller.start();
    expect(controller.getGroup("aa")).toBe(saved);
    expect(
      controller
        .getSnapshot()
        .status.some((line) => line.text === "relay offline"),
    ).toBe(true);
  });

  it("refuses a hash-only media cache hit without authenticated source evidence", async () => {
    const saved = {
      ...group(),
      session: { mediaSourceForRumor: vi.fn(async () => undefined) },
    } as unknown as AppGroup;
    const { controller } = fixture({ packages: [pkg()], groups: [saved] });
    await controller.start();
    await expect(
      controller.fetchAndDecryptMedia(
        "aa",
        {
          ciphertextSha256: "abc",
        } as Parameters<MarmotController["fetchAndDecryptMedia"]>[1],
        "rumor-id",
      ),
    ).rejects.toThrow("source keys");
    expect(saved.media.getMedia).not.toHaveBeenCalled();
  });

  it("retries retained commit publication when restoring an active group", async () => {
    const saved = group();
    const { controller } = fixture({ groups: [saved], packages: [pkg()] });
    await controller.start();
    expect(saved.retryPendingPublication).toHaveBeenCalledOnce();
  });

  it("keeps the last admin's group locally and reports why leaving is blocked", async () => {
    const saved = group();
    const { controller, client } = fixture({
      groups: [saved],
      packages: [pkg()],
    });
    await controller.start();
    expect(await controller.leave(saved.idStr)).toBe(false);
    expect(client.groups.leave).not.toHaveBeenCalled();
    expect(controller.getGroup(saved.idStr)).toBe(saved);
  });

  it("preserves local state when a non-admin's leave publication fails", async () => {
    const saved = {
      ...group(),
      groupData: { adminPubkeys: ["22".repeat(32)] },
    } as unknown as AppGroup;
    const { controller, client } = fixture({
      groups: [saved],
      packages: [pkg()],
    });
    client.groups.leave.mockRejectedValueOnce(new Error("Relay offline"));
    await controller.start();
    expect(await controller.leave(saved.idStr)).toBe(false);
    expect(controller.getGroup(saved.idStr)).toBe(saved);
  });

  it("reports failed Welcome fanout instead of treating a committed membership as a delivered invite", async () => {
    const saved = group();
    const { controller, client } = fixture({
      packages: [pkg()],
      groups: [saved],
    });
    await controller.start();
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
      controller.inviteKeyPackages("aa", keyPackage.published!),
    ).rejects.toThrow("Membership was updated");
    expect(client.groups.send).toHaveBeenCalledOnce();
  });
});

import { EventStore } from "applesauce-core";
import { getEventHash } from "applesauce-core/helpers";
import type { NostrEvent } from "applesauce-core/helpers";
import type { ListedKeyPackage } from "@internet-privacy/marmot-ts/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EMPTY } from "rxjs";
import { makeTestClient } from "./test-helpers";
import { MarmotController } from "./controller";
import type { AppGroup, AppMarmotClient } from "./types";
import type { Directory } from "./discovery";
import type { MarmotNetwork } from "./network";

vi.mock("@/lib/settings", () => ({
  lookupRelays$: { value: ["wss://index.test"] },
}));

const PUBKEY = "11".repeat(32);
const SLOT = "marmot-web-device-a";
const controllers: MarmotController[] = [];
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.stop());
});

function pkg(identifier = SLOT, nonCurrent = false): ListedKeyPackage {
  return {
    identifier,
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
      create: vi.fn(async () => {
        const current = pkg();
        packages = [...packages, current];
        return current;
      }),
      purge: vi.fn(async () => {
        packages = packages.filter((p) => !p.nonCurrent);
      }),
    },
    groups: {
      loadAll: vi.fn(async () => groups),
      on: vi.fn(),
      connectAll: vi.fn(() => ({ unsubscribe })),
      watch: async function* () {
        yield groups;
      },
      send: vi.fn(),
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
    dispose: vi.fn(),
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
  it("publishes a current per-device package despite legacy unused packages, preserving old keys", async () => {
    const legacy = pkg("marmot-web", true);
    const { controller, client } = fixture({ packages: [legacy] });
    await controller.start();
    expect(client.keyPackages.create).toHaveBeenCalledExactlyOnceWith({
      relays: ["wss://outbox.test/"],
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
      packages: [pkg(), pkg("old", true)],
    });
    await controller.start();
    await controller.purgeLegacyKeyPackages();
    expect(client.keyPackages.purge).toHaveBeenCalledExactlyOnceWith([
      new Uint8Array([1]),
    ]);
    expect(controller.getSnapshot().keyPackages.legacy).toBe(0);
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

  it("uses cached decrypted media without fetching ciphertext again", async () => {
    const saved = group();
    const { controller } = fixture({ packages: [pkg()], groups: [saved] });
    await controller.start();
    const result = await controller.fetchAndDecryptMedia("aa", {
      ciphertextSha256: "abc",
    } as Parameters<MarmotController["fetchAndDecryptMedia"]>[1]);
    expect(result).toEqual({
      data: new Uint8Array([42]),
      mediaType: "image/png",
    });
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

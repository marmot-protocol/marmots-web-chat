import { BehaviorSubject, Observable, of, Subject } from "rxjs";
import type { RelayPool } from "applesauce-relay";
import type { NostrEvent } from "applesauce-core/helpers";
import { describe, expect, it, vi } from "vitest";

import { MarmotNetwork } from "./network";
import type { Directory } from "./discovery";

function fixture() {
  const pool = {
    relays: new Map(),
    add$: new Subject(),
    remove$: new Subject(),
    publish: vi.fn(),
    request: vi.fn(),
    remove: vi.fn(),
  };
  const directory = {
    add: vi.fn((_event: NostrEvent) => true),
    close: vi.fn(),
    welcomeInboxes: vi.fn(async () => []),
  };
  const network = new MarmotNetwork(
    pool as unknown as RelayPool,
    ["wss://bootstrap.test"],
    directory as unknown as Directory,
    { signEvent: vi.fn() },
  );
  return { pool, directory, network };
}

describe("web Nostr adapter", () => {
  it("returns only verified fetched events and forwards public-query auth options", async () => {
    const { pool, directory, network } = fixture();
    const valid = { id: "valid" } as NostrEvent;
    const invalid = { id: "invalid" } as NostrEvent;
    directory.add.mockImplementation(
      (event: NostrEvent) => event.id === "valid",
    );
    pool.request.mockReturnValue(of(valid, invalid));
    expect(
      await network.request([], { kinds: [30443] }, { waitForAuth: false }),
    ).toEqual([valid]);
    expect(pool.request).toHaveBeenCalledWith(
      ["wss://bootstrap.test"],
      { kinds: [30443] },
      { waitForAuth: false },
    );
    network.close();
  });

  it("rejects a publication when no relay acknowledges it", async () => {
    const { pool, network } = fixture();
    pool.publish.mockResolvedValue([{ from: "wss://relay.test", ok: false }]);
    await expect(network.publish([], {} as NostrEvent)).rejects.toThrow(
      "No relay acknowledged",
    );
    network.close();
  });

  it("does not substitute our bootstrap relays for another user's missing inbox", async () => {
    const { network } = fixture();
    expect(await network.getUserInboxRelays("11".repeat(32))).toEqual([]);
    network.close();
  });

  it("cancels in-flight requests and clears challenged connections on account teardown", async () => {
    const { pool, network } = fixture();
    const teardown = vi.fn();
    pool.request.mockReturnValue(new Observable(() => teardown));
    const pending = network.request([], { kinds: [30443] });
    const relay = {
      challenge: "pending",
      authenticated: false,
      url: "wss://relay.test",
      challenge$: new BehaviorSubject<string | null>("pending"),
      authRequiredForRead$: new BehaviorSubject(false),
      authRequiredForPublish$: new BehaviorSubject(false),
      authenticate: vi.fn(),
    };
    pool.relays.set(relay.url, relay);
    network.close();
    expect(await pending).toEqual([]);
    expect(teardown).toHaveBeenCalledOnce();
    expect(pool.remove).toHaveBeenCalledWith(relay);
  });
});

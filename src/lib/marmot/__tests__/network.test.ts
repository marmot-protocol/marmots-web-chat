import { BehaviorSubject, Observable, of, Subject } from "rxjs";
import type { RelayPool } from "applesauce-relay";
import type { NostrEvent } from "applesauce-core/helpers";
import { describe, expect, it, vi } from "vitest";

import { MarmotNetwork } from "@/lib/marmot/network";
import type { Directory } from "@/lib/marmot/discovery";

function fixture() {
  const pool = {
    relays: new Map(),
    add$: new Subject(),
    remove$: new Subject(),
    publish: vi.fn(),
    request: vi.fn(),
    subscription: vi.fn(),
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
      expect.objectContaining({
        waitForAuth: false,
        onAuthRequired: expect.any(Function),
      }),
    );
    network.close();
  });

  it("propagates failed or timed-out backfill instead of returning partial history", async () => {
    const { pool, network } = fixture();
    pool.request.mockReturnValue(
      new Observable((subscriber) => {
        subscriber.next({ id: "one" } as NostrEvent);
        subscriber.error(new Error("request timed out"));
      }),
    );
    await expect(
      network.request([], { kinds: [445], limit: 500 }),
    ).rejects.toThrow("timed out");
    network.close();
  });

  it("bounds a relay that ignores page limits and deduplicates results", async () => {
    const { pool, network } = fixture();
    const events = Array.from(
      { length: 1000 },
      (_, index) => ({ id: String(index) }) as NostrEvent,
    );
    pool.request.mockReturnValue(of(...events));
    expect(await network.request([], { kinds: [445], limit: 3 })).toEqual(
      events.slice(0, 3),
    );
    pool.request.mockReturnValue(of(events[0], events[0], events[1]));
    expect(await network.request([], { kinds: [445] })).toEqual(
      events.slice(0, 2),
    );
    network.close();
    await expect(network.request([], { kinds: [445] })).rejects.toThrow(
      "closed",
    );
  });

  it("does not let duplicates or invalid events consume a backfill page", async () => {
    const { pool, directory, network } = fixture();
    directory.add.mockImplementation((event) => event.id !== "invalid");
    const first = { id: "first" } as NostrEvent;
    const second = { id: "second" } as NostrEvent;
    pool.request.mockReturnValue(
      of({ id: "invalid" } as NostrEvent, first, first, second),
    );
    expect(await network.request([], { kinds: [445], limit: 2 })).toEqual([
      first,
      second,
    ]);
    network.close();
  });

  it("closes live subscriptions and refuses late subscription after account teardown", () => {
    const { pool, network } = fixture();
    const teardown = vi.fn();
    pool.subscription.mockReturnValue(new Observable(() => teardown));
    const stream = network.subscription([], { kinds: [445] });
    stream.subscribe({});
    network.close();
    expect(teardown).toHaveBeenCalledOnce();
    const complete = vi.fn();
    stream.subscribe({ complete });
    expect(complete).toHaveBeenCalledOnce();
    expect(pool.subscription).toHaveBeenCalledOnce();
  });

  it("passes operation-scoped authentication to publications", async () => {
    const { pool, network } = fixture();
    pool.publish.mockResolvedValue([{ from: "wss://relay.test", ok: true }]);
    await network.publish([], {} as NostrEvent);
    expect(pool.publish).toHaveBeenCalledWith(
      ["wss://bootstrap.test"],
      {},
      { onAuthRequired: expect.any(Function) },
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
    await expect(pending).rejects.toThrow("cancelled");
    expect(teardown).toHaveBeenCalledOnce();
    expect(pool.remove).toHaveBeenCalledWith(relay);
  });
});

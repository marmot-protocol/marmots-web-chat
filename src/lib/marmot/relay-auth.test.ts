import { BehaviorSubject, Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import type { AuthSigner } from "applesauce-relay/types";

import { autoAuthenticateRelays, type AuthWatchableRelay } from "./relay-auth";

function fixture() {
  const relay = {
    url: "wss://auth.test",
    challenge$: new BehaviorSubject<string | null>(null),
    authRequiredForRead$: new BehaviorSubject(false),
    authRequiredForPublish$: new BehaviorSubject(false),
    authenticate: vi.fn().mockResolvedValue({ ok: true }),
  };
  const pool = {
    relays: new Map<string, AuthWatchableRelay>([[relay.url, relay]]),
    add$: new Subject<AuthWatchableRelay>(),
    remove$: new Subject<AuthWatchableRelay>(),
  };
  const signer: AuthSigner = { signEvent: vi.fn() };
  const log = vi.fn();
  const handle = autoAuthenticateRelays(pool, signer, log);
  return { relay, pool, signer, log, handle };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("on-demand relay authentication", () => {
  it("does not disclose identity on a bare challenge; authenticates once when required", async () => {
    const { relay, signer, handle } = fixture();
    relay.challenge$.next("challenge");
    await flush();
    expect(relay.authenticate).not.toHaveBeenCalled();
    relay.authRequiredForRead$.next(true);
    relay.authRequiredForPublish$.next(true);
    await flush();
    expect(relay.authenticate).toHaveBeenCalledExactlyOnceWith(signer);
    relay.challenge$.next("new challenge");
    await flush();
    expect(relay.authenticate).toHaveBeenCalledTimes(2);
    handle.unsubscribe();
  });

  it("does not authenticate a superseded challenge twice", async () => {
    const { relay, handle } = fixture();
    relay.authRequiredForRead$.next(true);
    relay.challenge$.next("old");
    relay.challenge$.next("new");
    await flush();
    expect(relay.authenticate).toHaveBeenCalledOnce();
    handle.unsubscribe();
  });

  it("cancels queued authentication when switching accounts or removing a relay", async () => {
    const { relay, handle } = fixture();
    relay.challenge$.next("challenge");
    relay.authRequiredForRead$.next(true);
    handle.unsubscribe();
    await flush();
    expect(relay.authenticate).not.toHaveBeenCalled();
    const second = fixture();
    second.relay.challenge$.next("challenge");
    second.relay.authRequiredForRead$.next(true);
    second.pool.remove$.next(second.relay);
    await flush();
    expect(second.relay.authenticate).not.toHaveBeenCalled();
    second.handle.unsubscribe();
  });

  it("watches new relays and contains signing failures without retry loops", async () => {
    const { pool, log, handle } = fixture();
    const relay = {
      url: "wss://later.test",
      challenge$: new BehaviorSubject<string | null>("challenge"),
      authRequiredForRead$: new BehaviorSubject(true),
      authRequiredForPublish$: new BehaviorSubject(false),
      authenticate: vi.fn().mockRejectedValue(new Error("signing refused")),
    };
    pool.add$.next(relay);
    await flush();
    relay.authRequiredForRead$.next(true);
    await flush();
    expect(relay.authenticate).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      "auth failed for %s: %O",
      relay.url,
      expect.any(Error),
    );
    handle.unsubscribe();
  });
});

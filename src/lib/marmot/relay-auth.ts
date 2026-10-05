import type { AuthSigner, PublishResponse } from "applesauce-relay/types";

/** Minimal `{ unsubscribe(): void }` handle, matching RxJS `Subscription`. */
export interface Unsubscribable {
  unsubscribe(): void;
}

/**
 * Minimal subscribable of `T`, matching the subset of RxJS `Observable<T>`
 * this module needs. `BehaviorSubject`-backed observables (like `challenge$`
 * and the `authRequiredFor*$` streams) emit their current value synchronously
 * on `subscribe`, so watcher state must be declared before subscribing.
 */
export interface Subscribable<T> {
  subscribe(next: (value: T) => void): Unsubscribable;
}

/** Structural shape of an `applesauce-relay` `Relay` this module watches. */
export interface AuthWatchableRelay {
  readonly url: string;
  challenge$: Subscribable<string | null>;
  authRequiredForRead$: Subscribable<boolean>;
  authRequiredForPublish$: Subscribable<boolean>;
  authenticate(signer: AuthSigner): Promise<PublishResponse>;
}

/** Structural shape of an `applesauce-relay` `RelayPool` this module watches. */
export interface AuthWatchablePool {
  readonly relays: ReadonlyMap<string, AuthWatchableRelay>;
  add$: Subscribable<AuthWatchableRelay>;
  remove$: Subscribable<AuthWatchableRelay>;
}

type LogFn = (formatter: string, ...args: unknown[]) => void;

const relayAuthLog: LogFn = (message, ...args) =>
  console.debug(`[marmot:relay-auth] ${message}`, ...args);

/** Live per-relay subscriptions, detachable as a unit. */
interface RelayWatcher {
  unsubscribe(): void;
}

/**
 * Watches every relay in `pool` (present now and added later via `add$`) and
 * answers a NIP-42 AUTH challenge with `signer` as soon as that relay has
 * both received a challenge and flagged itself `auth-required` for read or
 * publish. At most one authenticate attempt is made per (relay, challenge
 * string); a fresh challenge after reconnect (applesauce resets state on
 * disconnect) is authenticated again if auth is still required. Failures
 * (thrown, rejected, or `ok: false`) are logged via `log` and never thrown or
 * left as unhandled rejections.
 *
 * @param pool - Shared relay pool.
 * @param signer - Active account auth signer.
 * @param log - Authentication diagnostics.
 * @returns A handle that detaches all authentication watchers.
 *
 * Call `unsubscribe()` on the returned handle to stop watching — this detaches
 * every relay watcher and the pool's `add$`/`remove$` subscriptions, and is
 * idempotent.
 */
export function autoAuthenticateRelays(
  pool: AuthWatchablePool,
  signer: AuthSigner,
  log: LogFn = relayAuthLog,
): Unsubscribable {
  let closed = false;
  const watched = new Map<AuthWatchableRelay, RelayWatcher>();

  function attach(relay: AuthWatchableRelay): void {
    if (closed || watched.has(relay)) return;

    // Declared before subscribing: the BehaviorSubject-backed streams emit
    // their current value synchronously on subscribe.
    let detached = false;
    let challenge: string | null = null;
    let readRequired = false;
    let publishRequired = false;
    let lastAttempted: string | null = null;

    function maybeAuthenticate(): void {
      if (closed || detached) return;
      if (challenge === null) return;
      if (!(readRequired || publishRequired)) return;
      if (challenge === lastAttempted) return;
      // One attempt per challenge, set before calling, so a thrown/rejected/
      // ok:false outcome is never retried for the same challenge.
      const attemptedChallenge = challenge;
      lastAttempted = attemptedChallenge;
      Promise.resolve()
        .then(() => {
          if (closed || detached || challenge !== attemptedChallenge) return;
          return relay.authenticate(signer);
        })
        .then((response: PublishResponse | undefined) => {
          if (!response) return;
          if (response.ok) {
            log("authenticated to %s", relay.url);
          } else {
            log("auth rejected by %s: %s", relay.url, response.message);
          }
        })
        .catch((error: unknown) => {
          log("auth failed for %s: %O", relay.url, error);
        });
    }

    const challengeSub = relay.challenge$.subscribe((value) => {
      challenge = value;
      maybeAuthenticate();
    });
    const readSub = relay.authRequiredForRead$.subscribe((value) => {
      readRequired = value;
      maybeAuthenticate();
    });
    const publishSub = relay.authRequiredForPublish$.subscribe((value) => {
      publishRequired = value;
      maybeAuthenticate();
    });

    watched.set(relay, {
      unsubscribe(): void {
        detached = true;
        challengeSub.unsubscribe();
        readSub.unsubscribe();
        publishSub.unsubscribe();
      },
    });
  }

  function detach(relay: AuthWatchableRelay): void {
    const watcher = watched.get(relay);
    if (!watcher) return;
    watcher.unsubscribe();
    watched.delete(relay);
  }

  for (const relay of pool.relays.values()) attach(relay);

  const addSub = pool.add$.subscribe((relay) => attach(relay));
  const removeSub = pool.remove$.subscribe((relay) => detach(relay));

  return {
    unsubscribe(): void {
      if (closed) return;
      closed = true;
      addSub.unsubscribe();
      removeSub.unsubscribe();
      for (const watcher of watched.values()) watcher.unsubscribe();
      watched.clear();
    },
  };
}

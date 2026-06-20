import { AccountManager, type SerializedAccount } from "applesauce-accounts";
import {
  PrivateKeyAccount,
  registerCommonAccountTypes,
} from "applesauce-accounts/accounts";
import { castUser } from "applesauce-common/casts/user";
import { chainable } from "applesauce-common/observable/chainable";
import { safeParse } from "applesauce-core/helpers";
import { map, Observable, of, switchMap } from "rxjs";

import { eventStore } from "./nostr";
import { createController, type NewAccountSetup } from "./marmot/setup";
import type { MarmotController } from "./marmot/controller";

/** Account manager — this build only supports local private-key accounts. */
export const accounts = new AccountManager();
registerCommonAccountTypes(accounts);

// Load persisted accounts.
const json = safeParse<SerializedAccount<unknown, unknown>[]>(
  localStorage.getItem("accounts") ?? "[]",
);
if (json) accounts.fromJSON(json, true);

accounts.accounts$.subscribe(() => {
  localStorage.setItem("accounts", JSON.stringify(accounts.toJSON()));
});

const active = localStorage.getItem("active");
if (active) {
  try {
    accounts.setActive(active);
  } catch {}
}

accounts.active$.subscribe((account) => {
  if (account) localStorage.setItem("active", account.id);
  else localStorage.removeItem("active");
});

/**
 * One-shot setup details for accounts created in this session, consumed by the
 * controller factory so a freshly-created account publishes its initial profile
 * and relay lists. Keyed by pubkey.
 */
const pendingNewAccounts = new Map<string, NewAccountSetup>();

/** Create, persist, and activate a brand-new local-key account. */
export function createNewAccount(
  setup: NewAccountSetup & { secret?: Uint8Array | string },
): PrivateKeyAccount<unknown> {
  const account = setup.secret
    ? PrivateKeyAccount.fromKey<unknown>(setup.secret)
    : PrivateKeyAccount.generateNew<unknown>();
  pendingNewAccounts.set(account.pubkey, {
    name: setup.name,
    relays: setup.relays,
  });
  accounts.addAccount(account);
  accounts.setActive(account.id);
  return account;
}

/** Import an existing local-key account from a raw secret (hex or nsec). */
export function importAccount(
  secret: Uint8Array | string,
): PrivateKeyAccount<unknown> {
  const account = PrivateKeyAccount.fromKey<unknown>(secret);
  const existing = accounts.getAccountForPubkey(account.pubkey);
  if (existing) {
    accounts.setActive(existing.id);
    return existing as PrivateKeyAccount<unknown>;
  }
  accounts.addAccount(account);
  accounts.setActive(account.id);
  return account;
}

/** An observable of the current active user (applesauce cast). */
export const user$ = chainable(
  accounts.active$.pipe(
    map((account) => account && castUser(account.pubkey, eventStore)),
  ),
);

/**
 * The live {@link MarmotController} for the active account. Building one is
 * async (load stores, ensure key package); the observable emits null while
 * starting, then the started controller. Switching accounts stops the previous
 * controller.
 */
export const marmotController$: Observable<MarmotController | null> =
  accounts.active$.pipe(
    switchMap((account) => {
      if (!account || !(account instanceof PrivateKeyAccount)) return of(null);
      return new Observable<MarmotController | null>((subscriber) => {
        let controller: MarmotController | null = null;
        let cancelled = false;
        const setup = pendingNewAccounts.get(account.pubkey);
        pendingNewAccounts.delete(account.pubkey);
        subscriber.next(null);
        createController(account as PrivateKeyAccount<unknown>, setup)
          .then(async (c) => {
            if (cancelled) {
              c.stop();
              return;
            }
            controller = c;
            subscriber.next(c);
            await c.start();
          })
          .catch((err) => {
            console.error("[marmot] failed to start controller", err);
            if (!cancelled) subscriber.next(null);
          });
        return () => {
          cancelled = true;
          controller?.stop();
        };
      });
    }),
  );

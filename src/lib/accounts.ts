import { AccountManager, type SerializedAccount } from "applesauce-accounts";
import {
  ExtensionAccount,
  ReadonlyAccount,
  PrivateKeyAccount,
  registerCommonAccountTypes,
} from "applesauce-accounts/accounts";
import { castUser } from "applesauce-common/casts/user";
import { chainable } from "applesauce-common/observable/chainable";
import { safeParse } from "applesauce-core/helpers";
import { map, Observable, of, shareReplay, switchMap } from "rxjs";

import { eventStore } from "./nostr";
import { createAccount, type NewAccountSetup } from "./marmot/setup";
import type { MarmotAccount } from "./marmot/account";

/** Account manager for local and NIP-07 extension identities. */
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
 * account factory so a freshly-created account publishes its initial profile
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

/** Connect and persist the browser's NIP-07 signer.
 * @returns The activated extension account.
 */
export async function connectExtensionAccount(): Promise<ExtensionAccount> {
  const account = await ExtensionAccount.fromExtension();
  const existing = accounts.getAccountForPubkey(account.pubkey);
  if (existing instanceof ExtensionAccount) {
    accounts.setActive(existing.id);
    return existing;
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
 * The live {@link MarmotAccount} runtime for the active account. Building one
 * is async (open stores); the observable emits null while building, then the
 * account as it starts. Switching accounts stops the previous one.
 */
export const marmotAccount$: Observable<MarmotAccount | null> =
  accounts.active$.pipe(
    switchMap((account) => {
      if (!account || account instanceof ReadonlyAccount) return of(null);
      return new Observable<MarmotAccount | null>((subscriber) => {
        let started: MarmotAccount | null = null;
        let cancelled = false;
        const setup = pendingNewAccounts.get(account.pubkey);
        pendingNewAccounts.delete(account.pubkey);
        subscriber.next(null);
        createAccount(account, setup)
          .then(async (c) => {
            if (cancelled) {
              c.stop();
              return;
            }
            started = c;
            subscriber.next(c);
            await c.start();
          })
          .catch((err) => {
            console.error("[marmot] failed to start account", err);
            if (!cancelled) {
              if (started) started.notifyError(err);
              else subscriber.next(null);
            }
          });
        return () => {
          cancelled = true;
          started?.stop();
        };
      });
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

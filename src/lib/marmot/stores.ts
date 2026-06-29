import localforage from "localforage";

import type { GenericKeyValueStore } from "@internet-privacy/marmot-ts/utils";

/**
 * A {@link GenericKeyValueStore} backed by a LocalForage (IndexedDB) instance.
 *
 * IndexedDB's structured-clone storage round-trips `Uint8Array` and `bigint`
 * natively, so MLS binary state and epoch counters persist without the JSON
 * tagging the SQLite reference store needs.
 */
export class LocalForageStore<T> implements GenericKeyValueStore<T> {
  readonly #store: LocalForage;

  constructor(name: string, storeName: string) {
    this.#store = localforage.createInstance({
      name,
      storeName,
      driver: localforage.INDEXEDDB,
    });
  }

  async getItem(key: string): Promise<T | null> {
    return (await this.#store.getItem<T>(key)) ?? null;
  }

  async setItem(key: string, value: T): Promise<T> {
    return this.#store.setItem<T>(key, value);
  }

  removeItem(key: string): Promise<void> {
    return this.#store.removeItem(key);
  }

  clear(): Promise<void> {
    return this.#store.clear();
  }

  keys(): Promise<string[]> {
    return this.#store.keys();
  }
}

/** Build a per-account KV store for one logical table (groups, keypackages, …). */
export function makeStore<T>(pubkey: string, table: string): LocalForageStore<T> {
  return new LocalForageStore<T>(`marmot:${pubkey}`, table);
}

/** Delete every persisted table for an account (logout / reset). */
export async function purgeAccountStores(pubkey: string): Promise<void> {
  for (const table of [
    "groups",
    "keypackages",
    "invites",
    "messages",
    "media",
  ]) {
    await new LocalForageStore(pubkey, table).clear();
  }
}

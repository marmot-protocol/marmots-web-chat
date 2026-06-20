import type { GenericKeyValueStore } from "@internet-privacy/marmot-ts/utils";

/**
 * Wraps a single {@link GenericKeyValueStore} so a caller sees only the keys
 * under a fixed `prefix`. Each group's rumor-history backend is handed a store
 * scoped to `${groupHex}:`, so groups never read or clear each other's rumors
 * inside one shared messages store.
 */
export class PrefixedKeyValueStore<T> implements GenericKeyValueStore<T> {
  readonly #inner: GenericKeyValueStore<T>;
  readonly #prefix: string;

  constructor(inner: GenericKeyValueStore<T>, prefix: string) {
    this.#inner = inner;
    this.#prefix = prefix;
  }

  getItem(key: string): Promise<T | null> {
    return this.#inner.getItem(this.#prefix + key);
  }

  setItem(key: string, value: T): Promise<T> {
    return this.#inner.setItem(this.#prefix + key, value);
  }

  removeItem(key: string): Promise<void> {
    return this.#inner.removeItem(this.#prefix + key);
  }

  async clear(): Promise<void> {
    for (const key of await this.keys()) await this.removeItem(key);
  }

  async keys(): Promise<string[]> {
    const all = await this.#inner.keys();
    return all
      .filter((key) => key.startsWith(this.#prefix))
      .map((key) => key.slice(this.#prefix.length));
  }
}

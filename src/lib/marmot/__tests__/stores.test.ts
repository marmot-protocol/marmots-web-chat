import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeStore, purgeAccountStores } from "@/lib/marmot/stores";

const { databases } = vi.hoisted(() => ({
  databases: new Map<string, Map<string, unknown>>(),
}));
vi.mock("localforage", () => ({
  default: {
    INDEXEDDB: "indexeddb",
    createInstance: ({
      name,
      storeName,
    }: {
      name: string;
      storeName: string;
    }) => {
      const key = `${name}/${storeName}`;
      if (!databases.has(key)) databases.set(key, new Map());
      const data = databases.get(key)!;
      return {
        getItem: async (key: string) => data.get(key),
        setItem: async (key: string, value: unknown) => {
          data.set(key, value);
          return value;
        },
        removeItem: async (key: string) => {
          data.delete(key);
        },
        keys: async () => [...data.keys()],
        clear: async () => {
          data.clear();
        },
      };
    },
  },
}));

beforeEach(() => databases.clear());

describe("account persistence", () => {
  it("purges the actual account database including recovery stores, preserving other accounts", async () => {
    const tables = [
      "groups",
      "keypackages",
      "invites",
      "messages",
      "media",
      "rewind",
      "ingest",
      "removed",
    ];
    for (const table of tables) {
      await makeStore("alice", table).setItem("saved", new Uint8Array([1]));
      await makeStore("bob", table).setItem("saved", new Uint8Array([2]));
    }
    await purgeAccountStores("alice");
    for (const table of tables) {
      expect(await makeStore("alice", table).keys()).toEqual([]);
      expect(await makeStore("bob", table).getItem("saved")).toEqual(
        new Uint8Array([2]),
      );
    }
  });
});

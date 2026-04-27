import { Rumor } from "applesauce-common/helpers";
import {
  bytesToHex,
  Filter,
  matchFilter,
  NostrEvent,
} from "applesauce-core/helpers";
import { IDBPDatabase, openDB } from "idb";
import localforage from "localforage";
import {
  GroupHistoryFactory,
  GroupMediaBackend,
  GroupMediaFactory,
  GroupMediaStore,
  GroupRumorHistory,
  GroupRumorHistoryBackend,
  type SerializedClientState,
  type StoredInviteEntry,
  type StoredKeyPackage,
  type StoredMedia,
} from "@internet-privacy/marmot-ts";
import { ingestResultsDatabaseName } from "@/lib/group-subscription-manager";

interface GenericKeyValueStore<T> {
  getItem(key: string): Promise<T | null>;
  setItem(key: string, value: T): Promise<T>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}

const DB_VERSION = 1;

export interface StoredRumor {
  groupId: string;
  created_at: number;
  id: string;
  rumor: Rumor;
}

/** Schema for an indexeddb for a single account */
export type RumorDatabaseSchema = {
  rumors: {
    value: StoredRumor;
    key: [string, string]; // [groupId, rumorId]
    indexes: { by_group_created_at: [string, number] }; // [groupId, created_at]
  };
};

/**
 * IndexedDB-backed implementation of {@link GroupRumorHistoryBackend}.
 * Stores and retrieves group history (MIP-03 rumors) using the `idb` package.
 *
 * NOTE: This is kept here for app-specific schema control. The marmot-ts package
 * provides a reference implementation at `marmot-ts/backends/indexeddb` that can
 * be used as an alternative.
 */
class IdbRumorHistoryBackend implements GroupRumorHistoryBackend {
  private groupKey: string;
  private database: IDBPDatabase<RumorDatabaseSchema>;

  constructor(
    database: IDBPDatabase<RumorDatabaseSchema>,
    groupId: Uint8Array,
  ) {
    this.database = database;
    this.groupKey = bytesToHex(groupId);
  }

  /** Load rumors from the indexeddb database based on the given filter */
  async queryRumors(filter: Filter): Promise<Rumor[]> {
    const { since, until, limit } = filter;

    // Always use a bounded range so we only get this group's rumors (avoids
    // lowerBound/upperBound including other groups when groupId hex is a prefix).
    const range = IDBKeyRange.bound(
      [this.groupKey, since ?? 0],
      [this.groupKey, until ?? Number.MAX_SAFE_INTEGER],
      false,
      false,
    );

    const tx = this.database.transaction("rumors", "readonly");
    const index = tx.objectStore("rumors").index("by_group_created_at");
    const cursor = await index.openCursor(range, "prev");
    const stored: StoredRumor[] = [];
    let cur = cursor;
    while (cur && (limit === undefined || stored.length < limit)) {
      stored.push(cur.value);
      cur = await cur.continue();
    }

    return (
      stored
        .map((s) => s.rumor)
        // Filter down by extra nostr filters if provided
        .filter((r) => matchFilter(filter, r as NostrEvent))
    );
  }

  /** Saves a new rumor event to the database */
  async addRumor(rumor: Rumor): Promise<void> {
    const entry: StoredRumor = {
      groupId: this.groupKey,
      created_at: rumor.created_at,
      id: rumor.id,
      rumor: rumor,
    };
    await this.database.put("rumors", entry);
  }

  /** Clear all stored rumors for the group */
  async clear(): Promise<void> {
    const range = IDBKeyRange.bound(
      [this.groupKey, 0],
      [this.groupKey, Number.MAX_SAFE_INTEGER],
      false,
      false,
    );

    // Get all keys for the groups rumors
    const keys = await this.database.getAllKeysFromIndex(
      "rumors",
      "by_group_created_at",
      range,
    );

    // Delete all keys
    const tx = this.database.transaction("rumors", "readwrite");
    const store = tx.objectStore("rumors");
    for (const key of keys) {
      await store.delete(key);
    }
    await tx.done;
  }
}

/**
 * Wraps a localforage store as a {@link GroupMediaBackend}.
 *
 * localforage natively handles `Uint8Array` / `ArrayBuffer` in IndexedDB, but
 * when values are round-tripped the binary `data` field may come back as an
 * `ArrayBuffer`. This wrapper ensures `data` is always returned as a
 * `Uint8Array` so the rest of the app never has to deal with the discrepancy.
 */
function createLocalforageMediaBackend(store: LocalForage): GroupMediaBackend {
  return {
    async getItem(key: string): Promise<StoredMedia | null> {
      const raw = await store.getItem<StoredMedia>(key);
      if (!raw) return null;
      // Normalise data to Uint8Array in case IndexedDB returned an ArrayBuffer
      return {
        ...raw,
        data:
          raw.data instanceof Uint8Array
            ? raw.data
            : new Uint8Array(raw.data as unknown as ArrayBuffer),
      };
    },
    async setItem(key: string, value: StoredMedia): Promise<StoredMedia> {
      await store.setItem(key, value);
      return value;
    },
    async removeItem(key: string): Promise<void> {
      await store.removeItem(key);
    },
    async clear(): Promise<void> {
      await store.clear();
    },
    async keys(): Promise<string[]> {
      return store.keys();
    },
  };
}

type StorageInterfaces = {
  groupStateStore: GenericKeyValueStore<SerializedClientState>;
  historyFactory: GroupHistoryFactory<GroupRumorHistory>;
  mediaFactory: GroupMediaFactory<GroupMediaStore>;
  keyPackageStore: GenericKeyValueStore<StoredKeyPackage>;
  inviteStore: GenericKeyValueStore<StoredInviteEntry>;
};

/** A singleton class that manages databases for  */
export class MultiAccountDatabaseBroker {
  private customDatabases: Map<
    string,
    | IDBPDatabase<RumorDatabaseSchema>
    | Promise<IDBPDatabase<RumorDatabaseSchema>>
  > = new Map();

  /** Get, open, or create a database for a given account */
  private async getCustomDatabaseForAccount(
    pubkey: string,
  ): Promise<IDBPDatabase<RumorDatabaseSchema>> {
    const existing = this.customDatabases.get(pubkey);
    if (existing) return existing;

    // Create a new database for the account
    const db = openDB<RumorDatabaseSchema>(pubkey, DB_VERSION, {
      upgrade(db) {
        const rumors = db.createObjectStore("rumors", {
          keyPath: ["groupId", "id"],
        });
        rumors.createIndex("by_group_created_at", ["groupId", "created_at"]);
      },
    }).then((open) => {
      this.customDatabases.set(pubkey, open);
      return open;
    });

    this.customDatabases.set(pubkey, db);
    return db;
  }

  #storageInterfaces = new Map<string, StorageInterfaces>();

  /** Gets or creates a set of storage interfaces for a given account */
  async getStorageInterfacesForAccount(pubkey: string) {
    const existing = this.#storageInterfaces.get(pubkey);
    if (existing) return existing;

    const databaseKey = `${pubkey}-key-value`;

    const groupStateStore = localforage.createInstance({
      name: databaseKey,
      storeName: "groups",
    });

    const keyPackageStore = localforage.createInstance({
      name: databaseKey,
      storeName: "keyPackages",
    });

    const rumorDatabase = await this.getCustomDatabaseForAccount(pubkey);
    const historyFactory = (groupId: Uint8Array) =>
      new GroupRumorHistory(new IdbRumorHistoryBackend(rumorDatabase, groupId));

    // Create a per-group media factory — each group gets its own localforage
    // store (named by hex group ID) inside the shared key-value database,
    // backed by a GroupMediaStore so group.media is always a GroupMediaStore.
    const mediaFactory: GroupMediaFactory<GroupMediaStore> = (
      groupId: Uint8Array,
    ) => {
      const groupIdHex = bytesToHex(groupId);
      const mediaStore = localforage.createInstance({
        name: databaseKey,
        storeName: `media-${groupIdHex}`,
      });
      return new GroupMediaStore(createLocalforageMediaBackend(mediaStore));
    };

    const inviteStore = localforage.createInstance({
      name: databaseKey,
      storeName: "invites",
    });

    const storageInterfaces: StorageInterfaces = {
      groupStateStore,
      historyFactory,
      mediaFactory,
      keyPackageStore,
      inviteStore,
    };

    this.#storageInterfaces.set(pubkey, storageInterfaces);
    return storageInterfaces;
  }

  /**
   * Purges all databases for a given account.
   * This includes:
   * - IndexedDB rumors database
   * - LocalForage group state
   * - LocalForage key packages
   * - LocalForage invite stores
   * - LocalForage per-group ingest-results stores
   *
   * @param pubkey - The public key of the account to purge
   */
  async purgeDatabase(pubkey: string): Promise<void> {
    const databaseKey = `${pubkey}-key-value`;

    // Close and delete IndexedDB database
    const db = this.customDatabases.get(pubkey);
    if (db) {
      const resolvedDb = await db;
      resolvedDb.close();
      this.customDatabases.delete(pubkey);
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(pubkey);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => {
          console.warn(`Database ${pubkey} deletion blocked`);
        };
      });
    }

    // Drop the entire account-scoped LocalForage DB so dynamic stores
    // (e.g. media-*) cannot be orphaned regardless of which group IDs are known.
    await localforage.dropInstance({ name: databaseKey });

    // Drop the entire ingest-results DB as well.
    const ingestDbName = ingestResultsDatabaseName(pubkey);
    await localforage.dropInstance({ name: ingestDbName });

    // Remove from in-memory cache
    this.#storageInterfaces.delete(pubkey);
  }
}

// Create singleton instance of the database broker
const databaseBroker = new MultiAccountDatabaseBroker();

export default databaseBroker;

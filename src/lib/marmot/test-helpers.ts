import { PrivateKeySigner } from "applesauce-signers";
import {
  GroupMediaStore,
  GroupRumorHistory,
  MarmotClient,
} from "@internet-privacy/marmot-ts";
import {
  KeyValueRumorHistoryBackend,
  InMemoryKeyValueStore,
} from "@internet-privacy/marmot-ts/extra";
import type { NostrNetworkInterface } from "@internet-privacy/marmot-ts/client";

/** Construct a real client with isolated in-memory storage for integration tests. */
export function makeTestClient(network: NostrNetworkInterface) {
  const local = new PrivateKeySigner();
  // Deliberately hide raw key access, as a NIP-07 / NIP-46 signer would.
  const signer = {
    getPublicKey: () => local.getPublicKey(),
    signEvent: local.signEvent.bind(local),
    nip44: local.nip44,
  };
  return new MarmotClient({
    signer,
    network,
    clientId: "test-device",
    groupStateStore: new InMemoryKeyValueStore(),
    keyPackageStore: new InMemoryKeyValueStore(),
    inviteStore: new InMemoryKeyValueStore(),
    historyFactory: () =>
      new GroupRumorHistory(
        new KeyValueRumorHistoryBackend(new InMemoryKeyValueStore()),
      ),
    mediaFactory: () => new GroupMediaStore(),
  });
}

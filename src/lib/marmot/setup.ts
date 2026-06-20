import type { PrivateKeyAccount } from "applesauce-accounts/accounts";
import { relaySet } from "applesauce-core/helpers";
import { normalizeRelayUrl } from "applesauce-core/helpers";
import type { Rumor } from "applesauce-common/helpers/gift-wrap";

import { GroupRumorHistory, MarmotClient } from "@internet-privacy/marmot-ts";
import { KeyValueRumorHistoryBackend } from "@internet-privacy/marmot-ts/extra";

import { eventStore, pool } from "@/lib/nostr";
import { extraRelays$, DEFAULT_NEW_ACCOUNT_RELAY } from "@/lib/settings";

import { resolveAccountProofSigner } from "./account-proof";
import { Directory } from "./discovery";
import { MarmotNetwork } from "./network";
import { PrefixedKeyValueStore } from "./prefixed-store";
import { makeStore } from "./stores";
import { MarmotController } from "./controller";

/** This device's key-package slot (`d` tag). One web client per account. */
const CLIENT_ID = "marmot-web";

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function normalizeRelayList(relays: string[]): string[] {
  return relaySet(
    relays.flatMap((relay) => {
      try {
        return [normalizeRelayUrl(relay)];
      } catch {
        return [];
      }
    }),
  );
}

export interface NewAccountSetup {
  /** Display name published as the new account's kind 0 profile. */
  name?: string;
  /** Relays seeding the account's outbox + inbox; empty falls back to default. */
  relays?: string[];
}

/**
 * Build (but don't start) a {@link MarmotController} for an account. A fresh
 * account operates on the relays the user chose; a returning account bootstraps
 * discovery from the configured extra relays, then adopts its published lists.
 */
export async function createController(
  account: PrivateKeyAccount<unknown>,
  newAccount?: NewAccountSetup,
): Promise<MarmotController> {
  const fresh = Boolean(newAccount);
  const pubkey = await account.signer.getPublicKey();

  const proofSigner = resolveAccountProofSigner(account);
  if (!proofSigner) {
    throw new Error(
      "this account cannot publish darkmatter key packages (no raw key access)",
    );
  }

  const chosenRelays = fresh
    ? normalizeRelayList(
        newAccount?.relays?.length
          ? newAccount.relays
          : [DEFAULT_NEW_ACCOUNT_RELAY],
      )
    : [];
  const bootstrapRelays = chosenRelays.length
    ? chosenRelays
    : relaySet(extraRelays$.value);

  const directory = new Directory(eventStore);
  const network = new MarmotNetwork(pool, bootstrapRelays, directory);

  // One shared messages store; each group scoped to `${groupHex}:`.
  const messagesStore = makeStore<Rumor>(pubkey, "messages");
  const historyFactory = GroupRumorHistory.makeFactory(
    (groupId) =>
      new KeyValueRumorHistoryBackend(
        new PrefixedKeyValueStore(messagesStore, bytesToHex(groupId) + ":"),
      ),
  );

  const client = new MarmotClient({
    signer: account.signer,
    accountProofSigner: proofSigner,
    network,
    groupStateStore: makeStore(pubkey, "groups"),
    keyPackageStore: makeStore(pubkey, "keypackages"),
    inviteStore: makeStore(pubkey, "invites"),
    historyFactory,
    clientId: CLIENT_ID,
  });

  return new MarmotController({
    client,
    network,
    directory,
    eventStore,
    signer: account.signer,
    pubkey,
    relays: bootstrapRelays,
    fresh,
    clientId: CLIENT_ID,
    initialProfileName: newAccount?.name?.trim() || undefined,
  });
}

import type { IAccount } from "applesauce-accounts";
import { bytesToHex, relaySet } from "applesauce-core/helpers";
import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import {
  DEFAULT_CONVERGENCE_POLICY,
  GroupMediaStore,
  GroupRumorHistory,
  MarmotClient,
  type StoredMedia,
} from "@internet-privacy/marmot-ts";
import {
  AuditEmitter,
  deriveAccountRef,
  deriveEngineId,
  type AuditContextOptions,
} from "@internet-privacy/marmot-ts/audit";
import { KeyValueRumorHistoryBackend } from "@internet-privacy/marmot-ts/extra";

import { eventStore, pool } from "@/lib/nostr";
import {
  extraRelays$,
  lookupRelays$,
  DEFAULT_NEW_ACCOUNT_RELAY,
  auditEnabled$,
  auditUploadEndpoint$,
  auditUploadToken$,
  debugMode$,
} from "@/lib/settings";
import {
  APP_VERSION,
  type AuditUploadConfig,
  BrowserAuditRecorder,
  auditFileName,
  getDeviceId,
} from "@/lib/marmot/audit";
import { Directory } from "@/lib/marmot/discovery";
import { getKeyPackageSlot } from "@/lib/marmot/key-package-slot";
import { MarmotNetwork } from "@/lib/marmot/network";
import { PrefixedKeyValueStore } from "@/lib/marmot/prefixed-store";
import { makeStore } from "@/lib/marmot/stores";
import { MarmotAccount } from "@/lib/marmot/account";

/** Stable per-browser slot so devices do not replace each other's packages. */
const CLIENT_ID = getKeyPackageSlot();

/** Initial profile and relay preferences chosen when creating an account. */
export interface NewAccountSetup {
  /** Display name published as the new account's kind 0 profile. */
  name?: string;
  /** Relays seeding the account's outbox + inbox; empty falls back to default. */
  relays?: string[];
}

/**
 * Build (but don't start) a {@link MarmotAccount} runtime for an account. A fresh
 * account operates on the relays the user chose; a returning account bootstraps
 * discovery from the configured extra relays, then adopts its published lists.
 * @param account - Account whose signer and storage namespace the client uses.
 * @param newAccount - Initial preferences for a newly generated account.
 * @returns An account ready for start(); stop it before switching accounts.
 */
export async function createAccount(
  account: IAccount,
  newAccount?: NewAccountSetup,
): Promise<MarmotAccount> {
  const fresh = Boolean(newAccount);
  const pubkey = await account.signer.getPublicKey();

  const chosenRelays = fresh
    ? relaySet(
        newAccount?.relays?.length
          ? newAccount.relays
          : [DEFAULT_NEW_ACCOUNT_RELAY],
      )
    : [];
  const bootstrapRelays = chosenRelays.length
    ? chosenRelays
    : relaySet(extraRelays$.value);

  const directory = new Directory(eventStore);
  const network = new MarmotNetwork(
    pool,
    bootstrapRelays,
    directory,
    account.signer,
  );

  // One shared messages store; each group scoped to `${groupHex}:`.
  const messagesStore = makeStore<Rumor>(pubkey, "messages");
  const historyFactory = GroupRumorHistory.makeFactory(
    (groupId) =>
      new KeyValueRumorHistoryBackend(
        new PrefixedKeyValueStore(messagesStore, bytesToHex(groupId) + ":"),
      ),
  );

  // One shared media store; each group scoped to `${groupHex}:`. Decrypted
  // plaintext cache is application-owned. Reads still verify ciphertext,
  // attachment metadata, and authenticated source state before displaying it.
  const mediaStore = makeStore<StoredMedia>(pubkey, "media");
  const mediaFactory = (groupId: Uint8Array) =>
    new GroupMediaStore(
      new PrefixedKeyValueStore(mediaStore, bytesToHex(groupId) + ":"),
    );

  // Opt-in forensic audit logging. When enabled, a per-account+device JSONL
  // recorder is wired into the marmot client; the source-context row carries the
  // (hashed) account ref. The recorder is also handed to the account runtime so the
  // user can upload it to a Goggles tracker on demand. Disabled accounts pass no
  // sink, so the library never records.
  let audit: BrowserAuditRecorder | undefined;
  let auditContext: AuditContextOptions | undefined;
  let auditUpload: AuditUploadConfig | undefined;
  if (auditEnabled$.value) {
    const deviceId = getDeviceId();
    const engineId = deriveEngineId(pubkey, deviceId);
    audit = await BrowserAuditRecorder.open(auditFileName(engineId));
    auditContext = {
      engineId,
      accountRef: deriveAccountRef(pubkey),
      recorderSessionId: crypto.randomUUID(),
      dataMode: "obfuscated_sensitive_data",
      source: {
        device_id: deviceId,
        platform: "web",
        app_version: APP_VERSION,
        upload_trigger: "marmot_web",
      },
    };
    const emitter = new AuditEmitter({ ...auditContext, sink: audit });
    emitter.emit({ type: "recorder_started", recorder: "marmot-web" });
    emitter.emit({ type: "source_context", source: auditContext.source! });

    const endpoint = auditUploadEndpoint$.value.trim();
    if (endpoint) {
      auditUpload = {
        endpoint,
        // Only non-identifying client labels become headers; the account ref
        // stays inside the JSONL rows.
        bearerToken: auditUploadToken$.value.trim() || undefined,
        source: {
          deviceLabel: "marmot-web",
          platform: "web",
          appVersion: APP_VERSION,
        },
      };
    }
  }

  // Developer debug mode: configure the engine to retain and process
  // EVERYTHING, the same way the `marmot-tunnels` debugger does. A dedicated
  // `rewind` store persists each group's full fork-history tree so it survives a
  // reload; the convergence policy keeps forks of any age eligible and never
  // expires an app-payload witness; and the ingestion pool holds undecryptable
  // events indefinitely for retry. Disabled accounts use the library defaults
  // (bounded retention with durable recovery and delivery evidence).
  const debug = debugMode$.value;
  const debugRetention = debug
    ? {
        convergencePolicy: {
          ...DEFAULT_CONVERGENCE_POLICY,
          maxRewindCommits: Infinity,
          appPayloadPastEpochLimit: Infinity,
        },
        ingestionPool: { maxSize: Infinity, maxEpochAge: Infinity },
      }
    : {};

  const client = new MarmotClient({
    signer: account.signer,
    network,
    audit,
    auditContext,
    groupStateStore: makeStore(pubkey, "groups"),
    keyPackageStore: makeStore(pubkey, "keypackages"),
    inviteStore: makeStore(pubkey, "invites"),
    ingestStateStore: makeStore<Uint8Array>(pubkey, "ingest"),
    rewindStore: makeStore<Uint8Array>(pubkey, "rewind"),
    removedMarkerStore: makeStore<boolean>(pubkey, "removed"),
    historyFactory,
    mediaFactory,
    clientId: CLIENT_ID,
    ...debugRetention,
  });

  return new MarmotAccount({
    client,
    network,
    directory,
    eventStore,
    signer: account.signer,
    pubkey,
    relays: bootstrapRelays,
    fresh,
    clientId: CLIENT_ID,
    audit,
    auditUpload,
    lookupRelays: () => lookupRelays$.value,
    initialProfileName: newAccount?.name?.trim() || undefined,
  });
}

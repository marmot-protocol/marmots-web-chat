import type { PrivateKeyAccount } from "applesauce-accounts/accounts";
import { relaySet } from "applesauce-core/helpers";
import { normalizeRelayUrl } from "applesauce-core/helpers";
import type { Rumor } from "applesauce-common/helpers/gift-wrap";

import {
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
  DEFAULT_NEW_ACCOUNT_RELAY,
  auditEnabled$,
  auditUploadEndpoint$,
  auditUploadToken$,
} from "@/lib/settings";

import { resolveAccountProofSigner } from "./account-proof";
import {
  APP_VERSION,
  BrowserAuditRecorder,
  auditFileName,
  getDeviceId,
} from "./audit";
import { Directory } from "./discovery";
import { MarmotNetwork } from "./network";
import { PrefixedKeyValueStore } from "./prefixed-store";
import { makeStore } from "./stores";
import { MarmotController, type AuditUploadConfig } from "./controller";

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

  // One shared media store; each group scoped to `${groupHex}:`. Decrypted
  // plaintext is cached by ciphertext SHA-256 so re-rendering or reloading a
  // message never re-downloads the ciphertext or re-derives its key.
  const mediaStore = makeStore<StoredMedia>(pubkey, "media");
  const mediaFactory = (groupId: Uint8Array) =>
    new GroupMediaStore(
      new PrefixedKeyValueStore(mediaStore, bytesToHex(groupId) + ":"),
    );

  // Opt-in forensic audit logging. When enabled, a per-account+device JSONL
  // recorder is wired into the marmot client; the source-context row carries the
  // (hashed) account ref. The recorder is also handed to the controller so the
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

  const client = new MarmotClient({
    signer: account.signer,
    accountProofSigner: proofSigner,
    network,
    audit,
    auditContext,
    groupStateStore: makeStore(pubkey, "groups"),
    keyPackageStore: makeStore(pubkey, "keypackages"),
    inviteStore: makeStore(pubkey, "invites"),
    historyFactory,
    mediaFactory,
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
    audit,
    auditUpload,
    initialProfileName: newAccount?.name?.trim() || undefined,
  });
}

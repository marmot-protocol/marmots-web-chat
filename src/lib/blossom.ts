import { randomBytes } from "@noble/hashes/utils.js";
import type { ISigner } from "applesauce-signers";
import { PrivateKeySigner } from "applesauce-signers";
import { createUploadAuth } from "blossom-client-sdk/auth";
import { multiServerUpload } from "blossom-client-sdk/actions/multi-server";
import type {
  BlobDescriptor,
  Signer as BlossomSigner,
} from "blossom-client-sdk";
import { firstValueFrom } from "rxjs";

import { accounts } from "@/lib/accounts";
import { eventStore } from "@/lib/nostr";
import { blossomServers$, blossomSigningMode$ } from "@/lib/settings";

// ─── Signer adapter ───────────────────────────────────────────────────────────

/**
 * Wraps an applesauce ISigner into the blossom-client-sdk Signer function shape.
 *
 * blossom-client-sdk Signer: `(draft: EventTemplate) => Promise<SignedEvent>`
 * applesauce ISigner:         `{ signEvent(template): Promise<NostrEvent> }`
 */
function toBlossomSigner(signer: ISigner): BlossomSigner {
  return (draft) => signer.signEvent(draft) as ReturnType<BlossomSigner>;
}

/**
 * Returns the appropriate BlossomSigner based on the user's blossomSigningMode setting.
 *
 * - `"account"` — uses the active Nostr account signer (identity visible to server)
 * - `"ephemeral"` — generates a fresh random keypair per upload session (anonymous)
 */
async function resolveBlossomSigner(): Promise<BlossomSigner> {
  const mode = blossomSigningMode$.getValue();

  if (mode === "ephemeral") {
    return toBlossomSigner(new PrivateKeySigner(randomBytes(32)));
  }

  const account = await firstValueFrom(accounts.active$);
  if (!account?.signer) {
    throw new Error("No active account signer available for Blossom upload");
  }
  return toBlossomSigner(account.signer as ISigner);
}

/**
 * Returns the list of Blossom server URLs to upload to, based on the
 * current signing mode:
 *
 * - `"ephemeral"` — reads from the local `blossomServers$` BehaviorSubject
 * - `"account"` — reads from the user's kind-10063 Blossom server list event
 *   stored in the applesauce EventStore
 */
async function resolveBlossomServers(): Promise<string[]> {
  const mode = blossomSigningMode$.getValue();

  if (mode === "ephemeral") {
    return blossomServers$.getValue();
  }

  // Account mode: read the user's kind-10063 server list from the EventStore
  const account = await firstValueFrom(accounts.active$);
  if (!account) {
    throw new Error("No active account for Blossom upload");
  }

  const urlObjects = await firstValueFrom(
    eventStore.blossomServers(account.pubkey),
  );

  return (urlObjects ?? []).map((u) => u.toString().replace(/\/$/, ""));
}

// ─── Multi-server upload ──────────────────────────────────────────────────────

/**
 * Uploads an encrypted blob to the user's configured Blossom servers using the
 * blossom-client-sdk multiServerUpload helper (uploads to first server, mirrors
 * to the rest automatically).
 *
 * Server list source depends on the signing mode setting:
 * - `"ephemeral"` → local `blossomServers$` list
 * - `"account"` → user's kind-10063 Blossom server list
 *
 * Returns the URL from the first successful upload.
 *
 * @param blob - Encrypted bytes to upload (e.g. from MIP-04 encryptMediaFile)
 * @throws If no servers are configured, or if all servers fail
 */
export async function uploadToConfiguredBlossomServers(
  blob: Uint8Array,
): Promise<string> {
  const servers = await resolveBlossomServers();
  if (servers.length === 0) {
    const mode = blossomSigningMode$.getValue();
    const hint =
      mode === "ephemeral"
        ? "Add one in Settings → Media."
        : "Add one in Settings → Media (your Nostr kind-10063 list is empty).";
    throw new Error(`No Blossom servers configured. ${hint}`);
  }

  const signer = await resolveBlossomSigner();

  // blossom-client-sdk works with Blob/File; wrap the Uint8Array
  const blobFile = new Blob([blob.buffer as ArrayBuffer], {
    type: "application/octet-stream",
  });

  const results: Map<string, BlobDescriptor> = await multiServerUpload(
    servers,
    blobFile,
    {
      auth: true,
      onAuth: async (_server: string, sha256: string) =>
        createUploadAuth(signer, sha256),
      onError: (server: string, _sha256: string, _blob: Blob, error: Error) => {
        console.warn(`Blossom upload failed for ${server}:`, error);
      },
    },
  );

  // Return the URL from the first successful result
  for (const [, descriptor] of results) {
    if (descriptor.url) return descriptor.url;
  }

  throw new Error(
    "All Blossom servers failed. Check Settings → Media for server configuration.",
  );
}

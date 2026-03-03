import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  canonicalizeMimeType,
  deriveMip04FileKey,
  encryptMediaFile,
  type Mip04MediaAttachment,
} from "@internet-privacy/marmots";
import type { GroupRumorHistory, MarmotGroup } from "@internet-privacy/marmots";
import { useCallback, useState } from "react";

import { uploadToConfiguredBlossomServers } from "@/lib/blossom";
import { keyFingerprint } from "@/lib/utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns true if the MIME type should be sent inline as an `imeta` tag on a
 * kind-9 chat message (images and video). Everything else (audio, documents,
 * archives, etc.) is sent as a separate kind-1063 file metadata rumor.
 */
export function isInlineMediaType(mimeType: string): boolean {
  return mimeType.startsWith("image/") || mimeType.startsWith("video/");
}

// ─── State shape ──────────────────────────────────────────────────────────────

export type MediaUploadState =
  | { status: "idle" }
  | { status: "uploading"; file: File; progress?: number }
  | { status: "ready"; file: File; attachment: Mip04MediaAttachment }
  | { status: "error"; file: File; error: string };

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages a single pending media attachment for a group chat message.
 *
 * Call `upload(file)` as soon as a file is picked — the hook encrypts it with
 * MIP-04 and uploads the ciphertext to the user's configured Blossom servers
 * in the background. When done, `state.attachment` contains a fully-populated
 * {@link Mip04MediaAttachment} (including the `url`) ready to be serialised
 * into an `imeta` tag via `createImetaTagForAttachment`.
 *
 * Call `clear()` after the message has been sent (or to cancel a selection).
 *
 * @param group - The active MarmotGroup (provides MLS state for key derivation)
 */
export function useMediaUpload(group: MarmotGroup<GroupRumorHistory>) {
  const [state, setState] = useState<MediaUploadState>({ status: "idle" });

  const upload = useCallback(
    async (file: File) => {
      setState({ status: "uploading", file });

      try {
        // 1. Read file into bytes
        const t0 = performance.now();
        console.debug(
          `[mip04] ${file.name} reading file (${file.size} bytes)…`,
        );
        const arrayBuffer = await file.arrayBuffer();
        const plaintext = new Uint8Array(arrayBuffer);
        console.debug(
          `[mip04] ${file.name} read in ${(performance.now() - t0).toFixed(1)} ms`,
        );

        // 2. Compute SHA-256 of the plaintext (becomes the `x` imeta field)
        const sha256Hex = bytesToHex(sha256(plaintext));
        console.debug(`[mip04] ${file.name} sha256=${sha256Hex.slice(0, 16)}…`);

        // 3. Canonicalize MIME type per MIP-04
        const mimeType = canonicalizeMimeType(
          file.type || "application/octet-stream",
        );

        // 4. Build the partial attachment needed for key derivation
        const partialAttachment = {
          sha256: sha256Hex,
          type: mimeType,
          filename: file.name,
        };

        const label = `[mip04] ${file.name} (${sha256Hex.slice(0, 8)}…)`;

        // 5. Derive the per-file encryption key from the MLS epoch exporter secret
        console.debug(`${label} deriving file key…`);
        const t1 = performance.now();
        const fileKey = await deriveMip04FileKey(
          group.state,
          group.ciphersuite,
          partialAttachment,
        );
        console.debug(
          `${label} key derived in ${(performance.now() - t1).toFixed(1)} ms — key fingerprint: ${keyFingerprint(fileKey)}`,
        );

        // 6. Encrypt the file — also fills in `nonce` and `version` on the attachment
        console.debug(`${label} encrypting…`);
        const t2 = performance.now();
        const { encrypted, attachment } = encryptMediaFile(
          plaintext,
          fileKey,
          partialAttachment,
        );
        console.debug(
          `${label} encrypted ${plaintext.byteLength}→${encrypted.byteLength} bytes in ${(performance.now() - t2).toFixed(1)} ms`,
        );

        // 7. Upload the encrypted blob to configured Blossom servers
        console.debug(`${label} uploading ${encrypted.byteLength} bytes…`);
        const t3 = performance.now();
        const url = await uploadToConfiguredBlossomServers(encrypted);
        console.debug(
          `${label} uploaded in ${(performance.now() - t3).toFixed(1)} ms — url: ${url}`,
        );

        // 8. Attach the URL and store the completed attachment
        const completedAttachment: Mip04MediaAttachment = {
          ...attachment,
          url,
        };

        console.debug(`${label} ready`);
        setState({ status: "ready", file, attachment: completedAttachment });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        console.error(`[mip04] ${file.name} upload failed:`, err);
        setState({ status: "error", file, error: message });
      }
    },
    [group],
  );

  const clear = useCallback(() => {
    setState({ status: "idle" });
  }, []);

  return { state, upload, clear };
}

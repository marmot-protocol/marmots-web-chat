import type { MediaAttachment } from "@internet-privacy/marmots";
import type { AppGroup } from "@/lib/marmot-client";
import { useCallback, useState } from "react";

import { uploadToConfiguredBlossomServers } from "@/lib/blossom";

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
  | { status: "ready"; file: File; attachment: MediaAttachment }
  | { status: "error"; file: File; error: string };

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages a single pending media attachment for a group chat message.
 *
 * Call `upload(file)` as soon as a file is picked — the hook encrypts it with
 * MIP-04 via `group.encryptMedia()` and uploads the ciphertext to the user's
 * configured Blossom servers in the background. When done, `state.attachment`
 * contains a fully-populated {@link MediaAttachment} (including the `url`)
 * ready to be serialised into an `imeta` tag via `createImetaTagForAttachment`.
 *
 * Call `clear()` after the message has been sent (or to cancel a selection).
 *
 * @param group - The active MarmotGroup (provides MLS state for key derivation)
 */
export function useMediaUpload(group: AppGroup) {
  const [state, setState] = useState<MediaUploadState>({ status: "idle" });

  const upload = useCallback(
    async (file: File) => {
      setState({ status: "uploading", file });

      try {
        const t0 = performance.now();
        console.debug(
          `[mip04] ${file.name} encrypting & uploading (${file.size} bytes)…`,
        );

        // 1. Encrypt the file using the group's MLS epoch key via group.encryptMedia()
        const blob = new Blob([file], {
          type: file.type || "application/octet-stream",
        });
        const { encrypted, attachment } = await group.encryptMedia(blob, {
          filename: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
        });

        console.debug(
          `[mip04] ${file.name} encrypted in ${(performance.now() - t0).toFixed(1)} ms`,
        );

        // 2. Upload the encrypted blob to configured Blossom servers
        console.debug(
          `[mip04] ${file.name} uploading ${encrypted.byteLength} bytes…`,
        );
        const t1 = performance.now();
        const url = await uploadToConfiguredBlossomServers(encrypted);
        console.debug(
          `[mip04] ${file.name} uploaded in ${(performance.now() - t1).toFixed(1)} ms — url: ${url}`,
        );

        // 3. Attach the URL and store the completed attachment
        const completedAttachment: MediaAttachment = {
          ...attachment,
          url,
        };

        console.debug(`[mip04] ${file.name} ready`);
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

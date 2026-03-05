import type { MediaAttachment } from "@internet-privacy/marmot-ts";
import { useEffect, useState } from "react";
import type { AppGroup } from "@/lib/marmot-client";

// ─── State ────────────────────────────────────────────────────────────────────

export type DecryptAttachmentState =
  | { status: "idle" }
  | { status: "decrypting" }
  | { status: "ready"; objectUrl: string }
  | { status: "error"; error: string };

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Downloads and decrypts a MIP-04 encrypted media attachment from a Blossom
 * server, returning an object URL suitable for use in `<img>`, `<video>`, or
 * `<audio>` elements.
 *
 * Uses `group.decryptMedia()` which handles key derivation and caches the
 * decrypted result so subsequent renders don't re-derive keys.
 *
 * The object URL is revoked automatically when the component unmounts or when
 * the attachment changes.
 *
 * @param attachment - The MIP-04 attachment from the message's `imeta` tag
 * @param group - The active MarmotGroup (provides MLS state and media cache)
 */
export function useDecryptAttachment(
  attachment: MediaAttachment,
  group: AppGroup,
) {
  const [state, setState] = useState<DecryptAttachmentState>({
    status: "idle",
  });

  useEffect(() => {
    let cancelled = false;
    let createdObjectUrl: string | null = null;

    const run = async () => {
      setState({ status: "decrypting" });

      const label = `[mip04] ${attachment.filename} (${attachment.sha256?.slice(0, 8)}…)`;

      try {
        // 1. Fetch the encrypted blob from Blossom
        console.debug(`${label} fetching from ${attachment.url}`);
        const t0 = performance.now();
        const response = await fetch(attachment.url!);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch encrypted media (${response.status})`,
          );
        }
        const encrypted = new Uint8Array(await response.arrayBuffer());
        console.debug(
          `${label} fetched ${encrypted.byteLength} bytes in ${(performance.now() - t0).toFixed(1)} ms`,
        );

        if (cancelled) return;

        // 2. Decrypt via group.decryptMedia() — handles key derivation and caching
        console.debug(`${label} decrypting…`);
        const t1 = performance.now();
        const { data: plaintext } = await group.decryptMedia(
          encrypted,
          attachment,
        );
        console.debug(
          `${label} decrypted ${plaintext.byteLength} bytes in ${(performance.now() - t1).toFixed(1)} ms`,
        );

        if (cancelled) return;

        // 3. Create a browser object URL for rendering
        const blob = new Blob([plaintext as Uint8Array<ArrayBuffer>], {
          type: attachment.type ?? "application/octet-stream",
        });
        const objectUrl = URL.createObjectURL(blob);
        createdObjectUrl = objectUrl;

        console.debug(`${label} ready — objectUrl created`);
        setState({ status: "ready", objectUrl });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Decryption failed";
        console.error(`${label} failed:`, err);
        setState({ status: "error", error: message });
      }
    };

    run();

    return () => {
      cancelled = true;
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
    // Re-run if the attachment URL or the group MLS state epoch changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachment.url, attachment.sha256, group]);

  return state;
}

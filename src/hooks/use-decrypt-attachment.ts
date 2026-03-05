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
 * Returns an object URL for a MIP-04 encrypted media attachment, suitable for
 * use in `<img>`, `<video>`, or `<audio>` elements.
 *
 * Resolution order:
 * 1. **Cache hit** — if `group.media` already holds the decrypted plaintext
 *    for `attachment.sha256`, the object URL is created immediately with no
 *    network request.
 * 2. **Cache miss** — the encrypted blob is downloaded from Blossom, then
 *    decrypted via `group.decryptMedia()` (which derives the MLS epoch key
 *    and stores the plaintext in `group.media` for future calls).
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
        let plaintext: Uint8Array;

        // 1. Check group.media cache before downloading
        const cached = await group.media?.getMedia(attachment.sha256);
        if (cached) {
          console.debug(`${label} cache hit — skipping download`);
          plaintext = cached.data as Uint8Array;
        } else {
          // 2. Cache miss — fetch the encrypted blob from Blossom
          console.debug(
            `${label} cache miss — fetching from ${attachment.url}`,
          );
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

          // 3. Decrypt via group.decryptMedia() — handles key derivation and populates cache
          console.debug(`${label} decrypting…`);
          const t1 = performance.now();
          const result = await group.decryptMedia(encrypted, attachment);
          console.debug(
            `${label} decrypted ${result.data.byteLength} bytes in ${(performance.now() - t1).toFixed(1)} ms`,
          );
          plaintext = result.data as Uint8Array;
        }

        if (cancelled) return;

        // 4. Create a browser object URL for rendering
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

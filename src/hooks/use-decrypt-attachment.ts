import {
  decryptMediaFile,
  deriveMip04FileKey,
  type GroupRumorHistory,
  type Mip04MediaAttachment,
  MarmotGroup,
} from "@internet-privacy/marmots";
import { useEffect, useState } from "react";

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
 * The object URL is revoked automatically when the component unmounts or when
 * the attachment changes.
 *
 * @param attachment - The MIP-04 attachment from the message's `imeta` tag
 * @param group - The active MarmotGroup (provides MLS state for key derivation)
 */
export function useDecryptAttachment(
  attachment: Mip04MediaAttachment,
  group: MarmotGroup<GroupRumorHistory>,
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
        // 1. Derive the per-file decryption key from the MLS epoch exporter secret
        console.debug(`${label} deriving file key…`);
        const t0 = performance.now();
        const fileKey = await deriveMip04FileKey(
          group.state,
          group.ciphersuite,
          attachment,
        );
        console.debug(
          `${label} key derived in ${(performance.now() - t0).toFixed(1)} ms`,
        );

        // 2. Fetch the encrypted blob from Blossom
        console.debug(`${label} fetching from ${attachment.url}`);
        const t1 = performance.now();
        const response = await fetch(attachment.url!);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch encrypted media (${response.status})`,
          );
        }
        const encrypted = new Uint8Array(await response.arrayBuffer());
        console.debug(
          `${label} fetched ${encrypted.byteLength} bytes in ${(performance.now() - t1).toFixed(1)} ms`,
        );

        if (cancelled) return;

        // 3. Decrypt — also verifies AEAD tag and SHA-256 integrity
        console.debug(`${label} decrypting…`);
        const t2 = performance.now();
        const plaintext = decryptMediaFile(encrypted, fileKey, attachment);
        console.debug(
          `${label} decrypted ${plaintext.byteLength} bytes in ${(performance.now() - t2).toFixed(1)} ms`,
        );

        if (cancelled) return;

        // 4. Create a browser object URL for rendering
        const blob = new Blob([plaintext.buffer as ArrayBuffer], {
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

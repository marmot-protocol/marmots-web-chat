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

      try {
        // 1. Derive the per-file decryption key from the MLS epoch exporter secret
        const fileKey = await deriveMip04FileKey(
          group.state,
          group.ciphersuite,
          attachment,
        );

        // 2. Fetch the encrypted blob from Blossom
        const response = await fetch(attachment.url!);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch encrypted media (${response.status})`,
          );
        }
        const encrypted = new Uint8Array(await response.arrayBuffer());

        if (cancelled) return;

        // 3. Decrypt — also verifies AEAD tag and SHA-256 integrity
        const plaintext = decryptMediaFile(encrypted, fileKey, attachment);

        if (cancelled) return;

        // 4. Create a browser object URL for rendering
        const blob = new Blob([plaintext.buffer as ArrayBuffer], {
          type: attachment.type ?? "application/octet-stream",
        });
        const objectUrl = URL.createObjectURL(blob);
        createdObjectUrl = objectUrl;

        setState({ status: "ready", objectUrl });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Decryption failed";
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

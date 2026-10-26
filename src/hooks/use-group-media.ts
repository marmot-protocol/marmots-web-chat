import { useEffect, useState } from "react";
import type { HistoricalMediaAttachment } from "@internet-privacy/marmot-ts";

import { useController } from "./use-marmot";

export type MediaState =
  | { status: "loading" }
  | { status: "ready"; objectUrl: string; mediaType: string; size: number }
  | { status: "error"; error: string };

/**
 * Lazily download + decrypt one attachment for display, exposing it as an
 * object URL. Historical references retain their explicit version. The effect
 * uses the rumor ID and ciphertext hash to avoid repeated downloads on render.
 * Object URLs are revoked and downloads cancelled on cleanup.
 * @param groupId - Owning group.
 * @param attachment - Validated attachment reference.
 * @param rumorId - Canonical inner rumor ID for source evidence.
 * @param enabled - Start after optimistic delivery completes.
 * @returns Loading, ready, or unavailable media state.
 * @example useGroupMedia(groupId, attachment, message.id)
 */
export function useGroupMedia(
  groupId: string,
  attachment: HistoricalMediaAttachment,
  rumorId: string,
  enabled = true,
): MediaState {
  const controller = useController();
  const [state, setState] = useState<MediaState>({ status: "loading" });

  useEffect(() => {
    if (!controller || !enabled) return;
    const abort = new AbortController();
    let cancelled = false;
    let objectUrl: string | undefined;
    setState({ status: "loading" });
    controller
      .fetchAndDecryptMedia(groupId, attachment, rumorId, abort.signal)
      .then(({ data, mediaType }) => {
        if (cancelled) return;
        const blob = new Blob([data as BlobPart], { type: mediaType });
        objectUrl = URL.createObjectURL(blob);
        setState({
          status: "ready",
          objectUrl,
          mediaType,
          size: data.byteLength,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, groupId, rumorId, enabled, attachment.ciphertextSha256]);

  return state;
}

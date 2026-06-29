import { useEffect, useState } from "react";
import type { MediaAttachment } from "@internet-privacy/marmot-ts";

import { useController } from "./use-marmot";

export type MediaState =
  | { status: "loading" }
  | { status: "ready"; objectUrl: string; mediaType: string; size: number }
  | { status: "error"; error: string };

/**
 * Lazily download + decrypt one attachment for display, exposing it as an
 * object URL. Keyed on `attachment.ciphertextSha256` (stable across the new
 * attachment objects `getMediaAttachments` returns each render); the object URL
 * is revoked on unmount or when the attachment changes.
 */
export function useGroupMedia(
  groupId: string,
  attachment: MediaAttachment,
): MediaState {
  const controller = useController();
  const [state, setState] = useState<MediaState>({ status: "loading" });

  useEffect(() => {
    if (!controller) return;
    let cancelled = false;
    let objectUrl: string | undefined;
    setState({ status: "loading" });
    controller
      .fetchAndDecryptMedia(groupId, attachment)
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
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, groupId, attachment.ciphertextSha256]);

  return state;
}

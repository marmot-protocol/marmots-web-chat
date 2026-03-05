import type { MediaAttachment } from "@internet-privacy/marmot-ts";
import type { AppGroup } from "@/lib/marmot-client";
import {
  DownloadIcon,
  FileIcon,
  Loader2Icon,
  TriangleAlertIcon,
} from "lucide-react";

import { useDecryptAttachment } from "@/hooks/use-decrypt-attachment";

// ─── Helper ───────────────────────────────────────────────────────────────────

function isImageType(mimeType?: string) {
  return !!mimeType?.startsWith("image/");
}

function isVideoType(mimeType?: string) {
  return !!mimeType?.startsWith("video/");
}

function isAudioType(mimeType?: string) {
  return !!mimeType?.startsWith("audio/");
}

function formatSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Download helper ──────────────────────────────────────────────────────────

function triggerDownload(objectUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.click();
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Mip04MediaProps {
  attachment: MediaAttachment;
  group: AppGroup;
}

/**
 * Renders a MIP-04 encrypted media attachment inline in a chat message.
 *
 * - Images: decrypts and renders `<img>` inline
 * - Video: decrypts and renders `<video controls>`
 * - Audio: decrypts and renders `<audio controls>`
 * - Other: shows a download card with filename and size
 *
 * While decrypting, shows a loading spinner. On error, shows a small inline
 * error badge. The object URL is revoked when the component unmounts.
 */
export function Mip04Media({ attachment, group }: Mip04MediaProps) {
  const state = useDecryptAttachment(attachment, group);

  // ── Loading state ──
  if (state.status === "idle" || state.status === "decrypting") {
    return (
      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
        <Loader2Icon className="w-4 h-4 animate-spin shrink-0" />
        <span>Decrypting media…</span>
      </div>
    );
  }

  // ── Error state ──
  if (state.status === "error") {
    return (
      <div className="flex items-center gap-1.5 mt-1 text-sm text-destructive">
        <TriangleAlertIcon className="w-4 h-4 shrink-0" />
        <span>Failed to decrypt: {state.error}</span>
      </div>
    );
  }

  // ── Ready ──
  const { objectUrl } = state;
  const { filename, type, size } = attachment;

  if (isImageType(type)) {
    return (
      <img
        src={objectUrl}
        alt={filename}
        className="mt-1 max-h-80 max-w-full rounded-md object-contain"
        loading="lazy"
      />
    );
  }

  if (isVideoType(type)) {
    return (
      <video
        src={objectUrl}
        controls
        className="mt-1 max-h-80 max-w-full rounded-md"
      />
    );
  }

  if (isAudioType(type)) {
    return <audio src={objectUrl} controls className="mt-1 w-full max-w-xs" />;
  }

  // Generic file download card
  return (
    <button
      onClick={() => triggerDownload(objectUrl, filename)}
      className="mt-1 flex items-center gap-2 px-3 py-2 rounded-md border bg-muted hover:bg-muted/80 transition-colors text-sm text-left"
    >
      <FileIcon className="w-8 h-8 text-muted-foreground shrink-0" />
      <div className="flex flex-col min-w-0">
        <span className="truncate font-medium text-foreground">{filename}</span>
        {size != null && (
          <span className="text-xs text-muted-foreground">
            {formatSize(size)}
          </span>
        )}
      </div>
      <DownloadIcon className="w-4 h-4 text-muted-foreground shrink-0 ml-2" />
    </button>
  );
}

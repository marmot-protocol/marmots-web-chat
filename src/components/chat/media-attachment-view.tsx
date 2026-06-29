import { memo } from "react";
import { Download, FileWarning, ImageIcon } from "lucide-react";
import type { MediaAttachment } from "@internet-privacy/marmot-ts";

import { cn } from "@/lib/utils";
import { useGroupMedia } from "@/hooks/use-group-media";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

function aspectRatio(dim?: string): string | undefined {
  if (!dim) return undefined;
  const [w, h] = dim.split("x").map((n) => Number.parseInt(n, 10));
  return w > 0 && h > 0 ? `${w} / ${h}` : undefined;
}

/**
 * Renders one decrypted attachment: images inline (click to open full size),
 * everything else as a download chip. Decryption/transport is handled by
 * {@link useGroupMedia}.
 */
export const MediaAttachmentView = memo(function MediaAttachmentView({
  groupId,
  attachment,
  mine,
}: {
  groupId: string;
  attachment: MediaAttachment;
  mine: boolean;
}) {
  const media = useGroupMedia(groupId, attachment);
  const isImage = attachment.mediaType.startsWith("image/");

  if (media.status === "loading") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-xs",
          mine ? "bg-primary-foreground/10" : "bg-background/50",
        )}
        style={
          isImage ? { aspectRatio: aspectRatio(attachment.dim) } : undefined
        }
      >
        <ImageIcon className="size-4 shrink-0 animate-pulse" />
        <span className="truncate opacity-70">
          Loading {attachment.filename}…
        </span>
      </div>
    );
  }

  if (media.status === "error") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
        <FileWarning className="size-4 shrink-0" />
        <span className="truncate">
          Couldn’t load {attachment.filename}: {media.error}
        </span>
      </div>
    );
  }

  if (isImage) {
    return (
      <a
        href={media.objectUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <img
          src={media.objectUrl}
          alt={attachment.filename}
          className="max-h-80 max-w-full rounded-lg object-contain"
          style={{ aspectRatio: aspectRatio(attachment.dim) }}
        />
      </a>
    );
  }

  return (
    <a
      href={media.objectUrl}
      download={attachment.filename}
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent",
        mine ? "border-primary-foreground/30" : "border-foreground/20",
      )}
    >
      <Download className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{attachment.filename}</span>
      <span className="shrink-0 text-xs opacity-70">
        {formatBytes(media.size)}
      </span>
    </a>
  );
});

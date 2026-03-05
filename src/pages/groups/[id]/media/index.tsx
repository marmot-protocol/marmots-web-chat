import type { MediaAttachment } from "@internet-privacy/marmots";
import { unixNow } from "@internet-privacy/marmots";
import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import { use$ } from "applesauce-react/hooks";
import {
  DownloadIcon,
  FileAudioIcon,
  FileIcon,
  FileImageIcon,
  FileVideoIcon,
  ImageOffIcon,
  Loader2Icon,
  UploadIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useGroup } from "@/contexts/group-context";
import { useMediaUpload } from "@/hooks/use-media-upload";
import { accounts } from "@/lib/accounts";
import type { AppGroup } from "@/lib/marmot-client";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageType(type?: string) {
  return !!type?.startsWith("image/");
}

function isVideoType(type?: string) {
  return !!type?.startsWith("video/");
}

function isAudioType(type?: string) {
  return !!type?.startsWith("audio/");
}

function MediaTypeIcon({ type }: { type?: string }) {
  if (isImageType(type))
    return <FileImageIcon className="w-8 h-8 text-muted-foreground shrink-0" />;
  if (isVideoType(type))
    return <FileVideoIcon className="w-8 h-8 text-muted-foreground shrink-0" />;
  if (isAudioType(type))
    return <FileAudioIcon className="w-8 h-8 text-muted-foreground shrink-0" />;
  return <FileIcon className="w-8 h-8 text-muted-foreground shrink-0" />;
}

// ─── Hook: subscribe to group.media ──────────────────────────────────────────

/**
 * Subscribes to the group's {@link GroupMediaStore} and returns a live list
 * of all cached {@link MediaAttachment} entries. Updates automatically
 * whenever a new file is decrypted and added to the cache.
 */
function useGroupMedia(group: AppGroup): MediaAttachment[] {
  const [attachments, setAttachments] = useState<MediaAttachment[]>([]);

  useEffect(() => {
    let active = true;
    const gen = group.media.subscribe();

    const run = async () => {
      for await (const list of gen) {
        if (!active) break;
        setAttachments(list);
      }
    };

    run().catch(console.error);

    return () => {
      active = false;
      gen.return(undefined).catch(() => {});
    };
  }, [group]);

  return attachments;
}

// ─── Component: MediaItem ─────────────────────────────────────────────────────

interface MediaItemProps {
  attachment: MediaAttachment;
  group: AppGroup;
}

/**
 * Renders a single cached media item. The plaintext bytes are already in the
 * media store — no re-decryption is needed. Creates an object URL on demand
 * when the user opens or downloads the file.
 */
function MediaItem({ attachment, group }: MediaItemProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Revoke the object URL on unmount or when the attachment changes
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachment.sha256]);

  const getObjectUrl = async (): Promise<string | null> => {
    if (objectUrl) return objectUrl;
    setLoading(true);
    setError(null);
    try {
      const stored = await group.media.getMedia(attachment.sha256);
      if (!stored) {
        setError("Not in cache");
        return null;
      }
      const blob = new Blob([stored.data as Uint8Array<ArrayBuffer>], {
        type: attachment.type ?? "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);
      setObjectUrl(url);
      return url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    const url = await getObjectUrl();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = attachment.filename;
    a.click();
  };

  const handleImageClick = async () => {
    const url = await getObjectUrl();
    if (url) window.open(url, "_blank");
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      {/* Thumbnail for images, icon for everything else */}
      <div className="relative flex items-center justify-center rounded-md bg-muted overflow-hidden aspect-square w-full">
        {loading && (
          <Loader2Icon className="w-6 h-6 animate-spin text-muted-foreground" />
        )}

        {!loading && isImageType(attachment.type) && objectUrl ? (
          <button
            onClick={handleImageClick}
            className="w-full h-full"
            title="Open full size"
          >
            <img
              src={objectUrl}
              alt={attachment.filename}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </button>
        ) : !loading && isImageType(attachment.type) ? (
          <button
            onClick={handleImageClick}
            className="flex flex-col items-center gap-1 p-2 text-muted-foreground hover:text-foreground transition-colors"
            title={error ?? "Click to preview"}
          >
            {error ? (
              <ImageOffIcon className="w-8 h-8" />
            ) : (
              <FileImageIcon className="w-8 h-8" />
            )}
            <span className="text-xs">{error ?? "Preview"}</span>
          </button>
        ) : (
          !loading && <MediaTypeIcon type={attachment.type} />
        )}
      </div>

      {/* File info */}
      <div className="flex flex-col min-w-0 gap-0.5">
        <span
          className="text-sm font-medium truncate leading-snug"
          title={attachment.filename}
        >
          {attachment.filename}
        </span>
        <span className="text-xs text-muted-foreground">
          {attachment.type}
          {attachment.size != null && ` · ${formatSize(attachment.size)}`}
        </span>
      </div>

      {/* Download button */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={loading}
        className="w-full"
      >
        {loading ? (
          <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <DownloadIcon className="w-3.5 h-3.5" />
        )}
        <span className="ml-1">Download</span>
      </Button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * Media tab for a group — shows all decrypted media files cached in the
 * group's persistent {@link GroupMediaStore}. The list updates automatically
 * as new files are decrypted while reading messages in the Chat tab and
 * persists across page reloads thanks to the IndexedDB-backed store.
 */
export default function GroupMediaPage() {
  const { group } = useGroup();
  const attachments = useGroupMedia(group);
  const account = use$(() => accounts.active$, []);
  const { state: uploadState, upload, clear } = useMediaUpload(group);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Once a file is encrypted + uploaded, immediately send a kind-1063 rumor.
  useEffect(() => {
    if (uploadState.status !== "ready" || !account) return;

    const { attachment } = uploadState;

    const fileTags: string[][] = [
      ["url", attachment.url ?? ""],
      ["m", attachment.type ?? "application/octet-stream"],
      ["x", attachment.sha256 ?? ""],
      ["filename", attachment.filename],
      ["n", attachment.nonce],
      ["v", attachment.version],
    ];
    if (attachment.size != null)
      fileTags.push(["size", String(attachment.size)]);

    const fileRumor: Omit<Rumor, "id"> = {
      kind: 1063,
      content: "",
      created_at: unixNow(),
      pubkey: account.pubkey,
      tags: fileTags,
    };

    setSendError(null);
    group
      .sendApplicationRumor(fileRumor as Rumor)
      .then(() => clear())
      .catch((err: unknown) => {
        setSendError(err instanceof Error ? err.message : "Failed to send");
        clear();
      });
  }, [uploadState, account, group, clear]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSendError(null);
      upload(file);
    }
    // Reset input so the same file can be re-selected if needed
    e.target.value = "";
  };

  const isUploading = uploadState.status === "uploading";

  return (
    <div className="flex flex-col h-[calc(100vh-118px)] p-4">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Media</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {attachments.length === 0
              ? "No media cached yet — files appear here after being decrypted in the Chat tab."
              : `${attachments.length} ${attachments.length === 1 ? "file" : "files"} cached`}
          </p>
          {(uploadState.status === "error" || sendError) && (
            <p className="text-xs text-destructive mt-1">
              {uploadState.status === "error" ? uploadState.error : sendError}
            </p>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          disabled={isUploading}
        />

        <Button
          variant="outline"
          size="sm"
          disabled={isUploading || !account}
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0"
        >
          {isUploading ? (
            <Loader2Icon className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <UploadIcon className="w-3.5 h-3.5" />
          )}
          <span className="ml-1">{isUploading ? "Uploading…" : "Upload"}</span>
        </Button>
      </div>

      {/* Empty state */}
      {attachments.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center">
          <FileImageIcon className="w-12 h-12 text-muted-foreground/40" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">
              No media yet
            </p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Encrypted media files will appear here after they are viewed and
              decrypted in the Chat tab.
            </p>
          </div>
        </div>
      ) : (
        /* Responsive grid */
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 pb-4">
            {attachments.map((attachment) => (
              <MediaItem
                key={attachment.sha256}
                attachment={attachment}
                group={group}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

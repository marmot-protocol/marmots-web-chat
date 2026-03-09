import type { AppGroup } from "@/lib/marmot-client";
import type { MediaAttachment } from "@internet-privacy/marmot-ts";
import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import {
  FileIcon,
  Loader2,
  LoaderCircle,
  Paperclip,
  Reply,
  SendIcon,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { UserName } from "@/components/nostr-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMediaUpload } from "@/hooks/use-media-upload";
import { useIsMobile } from "../../../../hooks/use-mobile";

export interface MessageFormProps {
  group: AppGroup;
  isSending: boolean;
  onSend: (text: string, attachment?: MediaAttachment) => Promise<void>;
  replyTo: Rumor | null;
  onCancelReply: () => void;
}

export function MessageForm({
  group,
  isSending,
  onSend,
  replyTo,
  onCancelReply,
}: MessageFormProps) {
  const input = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [messageText, setMessageText] = useState("");
  const isMobile = useIsMobile();

  const {
    state: uploadState,
    upload,
    clear: clearUpload,
  } = useMediaUpload(group);
  const isUploading = uploadState.status === "uploading";
  const hasAttachment = uploadState.status === "ready";
  const attachmentError =
    uploadState.status === "error" ? uploadState.error : null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    upload(file);
    // Reset the input so the same file can be re-selected after clearing
    e.target.value = "";
  };

  const handleSubmit = async () => {
    if (isSending || isUploading) return;
    const text = messageText.trim();
    // Allow sending with attachment even if text is empty
    if (!text && !hasAttachment) return;
    try {
      const attachment =
        uploadState.status === "ready" ? uploadState.attachment : undefined;
      await onSend(text, attachment);
      setMessageText("");
      clearUpload();
      // Defer focus so it runs after React re-renders with isSending=false
      // (the input is disabled while sending, so focusing before the re-render is a no-op)
      setTimeout(() => input.current?.focus(), 0);
    } catch {
      // Error shown by parent; keep draft
    }
  };

  // Helper: format file size for the preview label
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const attachedFile = uploadState.status !== "idle" ? uploadState.file : null;
  const isImage = attachedFile?.type.startsWith("image/") ?? false;
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Generate a local preview URL for images while uploading/ready
  useEffect(() => {
    if (!attachedFile || !isImage) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(attachedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachedFile, isImage]);

  const canSend =
    !isSending && !isUploading && (!!messageText.trim() || hasAttachment);

  return (
    <div className="flex flex-col gap-2">
      {/* Reply banner */}
      {replyTo && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted border text-sm text-muted-foreground">
          <Reply className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate min-w-0">
            Replying to{" "}
            <span className="font-medium text-foreground">
              <UserName pubkey={replyTo.pubkey} />
            </span>
            {replyTo.content ? (
              <>
                {": "}
                <span className="italic">
                  {replyTo.content.slice(0, 80)}
                  {replyTo.content.length > 80 ? "…" : ""}
                </span>
              </>
            ) : null}
          </span>
          <button
            onClick={onCancelReply}
            className="ml-auto shrink-0 flex items-center justify-center w-5 h-5 rounded-full hover:bg-background transition-colors"
            aria-label="Cancel reply"
            title="Cancel reply"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Attachment preview — shown while uploading or when ready */}
      {attachedFile && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted border text-sm">
          {/* Thumbnail or file icon */}
          {isImage && previewUrl ? (
            <img
              src={previewUrl}
              alt={attachedFile.name}
              className="h-10 w-10 rounded object-cover shrink-0"
            />
          ) : (
            <FileIcon className="w-8 h-8 text-muted-foreground shrink-0" />
          )}

          <div className="flex flex-col min-w-0 flex-1">
            <span className="truncate font-medium text-foreground">
              {attachedFile.name}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatSize(attachedFile.size)}
              {isUploading && " · Encrypting & uploading…"}
              {hasAttachment && " · Ready"}
              {attachmentError && (
                <span className="text-destructive"> · {attachmentError}</span>
              )}
            </span>
          </div>

          {/* Upload spinner or clear button */}
          {isUploading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
          ) : (
            <button
              onClick={clearUpload}
              className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full hover:bg-background transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Remove attachment"
              title="Remove attachment"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Input row */}
      <div className="flex gap-2">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,audio/*,.pdf,.zip,.txt"
          className="hidden"
          onChange={handleFileChange}
          disabled={isUploading}
        />

        {/* Paperclip attachment button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || isSending}
          aria-label="Attach file"
          title="Attach file"
        >
          <Paperclip className="w-4 h-4" />
        </Button>

        <Input
          ref={input}
          type="text"
          placeholder={replyTo ? "Write a reply…" : "Type your message…"}
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && canSend) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          disabled={isSending}
          className="flex-1"
        />
        {/* <TranscriptionButton onTranscription={(text) => setMessageText(text)} /> */}
        {isMobile ? (
          <Button
            onClick={handleSubmit}
            disabled={!canSend}
            size="icon"
            aria-label="Send message"
          >
            {isSending ? <LoaderCircle /> : <SendIcon />}
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={!canSend}
            aria-label="Send message"
          >
            {isSending ? "Sending..." : "Send"}
          </Button>
        )}
      </div>
    </div>
  );
}

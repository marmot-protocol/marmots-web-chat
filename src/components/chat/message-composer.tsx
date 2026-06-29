import { useEffect, useRef, useState } from "react";
import { Paperclip, SendHorizonal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserName } from "@/components/user";
import { DEFAULT_BLOSSOM_SERVERS } from "@/lib/marmot/controller";
import { useChat, useController } from "@/hooks/use-marmot";
import { cn } from "@/lib/utils";
import type { ReplyTarget } from "./types";

/** One selected-but-unsent file, shown as a chip (thumbnail for images). */
function FilePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="flex items-center gap-1.5 rounded border bg-background py-1 pr-1 pl-2 text-xs">
      {url ? (
        <img
          src={url}
          alt={file.name}
          className="size-6 rounded object-cover"
        />
      ) : (
        <Paperclip className="size-3.5 opacity-60" />
      )}
      <span className="max-w-32 truncate">{file.name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-0.5 hover:bg-accent"
        aria-label={`Remove ${file.name}`}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

/**
 * The message input form. Owns its own `text`/`files` state so keystrokes
 * re-render only this component, never the message list. Sends text via
 * `sendText` and each attachment via `sendMedia`; the attach button is gated on
 * the group's encrypted-media policy (offering admins a one-click enable).
 */
export function MessageComposer({
  groupId,
  reply,
  onClearReply,
}: {
  groupId: string;
  reply: ReplyTarget | null;
  onClearReply: () => void;
}) {
  const controller = useController();
  const snapshot = useChat();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const me = snapshot?.me.pubkey;
  const mediaEnabled = controller
    ? !!controller.getGroupMediaPolicy(groupId)
    : false;
  const isAdmin = me
    ? (controller?.getGroup(groupId)?.groupData?.adminPubkeys ?? []).includes(
        me,
      )
    : false;

  const addFiles = (incoming: FileList | File[] | null) => {
    const list = incoming ? [...incoming] : [];
    if (list.length) {
      setFiles((prev) => [...prev, ...list]);
      setError(null);
    }
  };

  const send = async () => {
    if (!controller || sending) return;
    const value = text.trim();
    if (!value && files.length === 0) return;
    const replyTo = reply ? { id: reply.id, pubkey: reply.pubkey } : undefined;
    setSending(true);
    setError(null);
    try {
      if (files.length > 0) {
        // The caption (if any) rides along with the first attachment only.
        for (let i = 0; i < files.length; i++) {
          await controller.sendMedia(
            groupId,
            files[i],
            i === 0 ? value || undefined : undefined,
            replyTo,
          );
        }
      } else {
        await controller.sendText(groupId, value, replyTo);
      }
      setText("");
      setFiles([]);
      onClearReply();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const onAttachClick = () => {
    if (mediaEnabled) {
      fileInput.current?.click();
    } else if (isAdmin && controller) {
      void controller.setGroupMediaPolicy(groupId, DEFAULT_BLOSSOM_SERVERS);
    }
  };

  const canSend = !sending && (!!text.trim() || files.length > 0);

  return (
    <div
      className={cn("border-t p-2", dragging && "bg-accent/50")}
      onDragOver={(e) => {
        if (!mediaEnabled) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!mediaEnabled) return;
        e.preventDefault();
        setDragging(false);
        addFiles(e.dataTransfer.files);
      }}
    >
      {reply && (
        <div className="mb-2 flex items-center justify-between rounded bg-muted px-2 py-1 text-xs">
          <span className="truncate">
            Replying to{" "}
            <UserName pubkey={reply.pubkey} className="font-medium" />:{" "}
            <span className="text-muted-foreground">
              {reply.content.slice(0, 60)}
            </span>
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-5"
            onClick={onClearReply}
          >
            <X className="size-3" />
          </Button>
        </div>
      )}

      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {files.map((file, i) => (
            <FilePreview
              key={`${file.name}-${i}`}
              file={file}
              onRemove={() =>
                setFiles((prev) => prev.filter((_, idx) => idx !== i))
              }
            />
          ))}
        </div>
      )}

      {error && <div className="mb-2 text-xs text-destructive">{error}</div>}

      <div className="flex items-end gap-2">
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Button
          size="icon"
          variant="ghost"
          onClick={onAttachClick}
          disabled={sending || (!mediaEnabled && !isAdmin)}
          title={
            mediaEnabled
              ? "Attach files"
              : isAdmin
                ? "Enable encrypted media for this group"
                : "Media isn’t enabled for this group"
          }
        >
          <Paperclip className="size-4" />
        </Button>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            if (!mediaEnabled) return;
            const pasted = [...e.clipboardData.files];
            if (pasted.length) {
              e.preventDefault();
              addFiles(pasted);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Type a message…"
          rows={1}
          className="max-h-32 min-h-9 resize-none"
        />
        <Button size="icon" onClick={() => void send()} disabled={!canSend}>
          <SendHorizonal className="size-4" />
        </Button>
      </div>
    </div>
  );
}

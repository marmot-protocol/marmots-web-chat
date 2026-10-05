import { memo, useMemo } from "react";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { getMediaAttachments } from "@internet-privacy/marmot-ts";

import { IconCheck, IconLoader2 } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import type { OutgoingMessage } from "@/lib/marmot/message-outbox";
import { cn } from "@/lib/utils";
import { UserAvatar, UserName } from "@/components/user";
import { useController } from "@/hooks/use-marmot";
import {
  getReplyToId,
  useGroupEvent,
  useMessageReactions,
} from "@/hooks/use-group-chat";
import { MediaAttachmentView } from "./media-attachment-view";
import { MessageActionsMenu } from "./message-actions-menu";
import type { ReplyTarget } from "./types";

function formatTime(seconds: number): string {
  return new Date(seconds * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const MessageItem = memo(function MessageItem({
  groupId,
  message,
  mine,
  onReply,
  readOnly = false,
  delivery,
}: {
  groupId: string;
  message: NostrEvent;
  mine: boolean;
  onReply?: (target: ReplyTarget) => void;
  readOnly?: boolean;
  delivery?: OutgoingMessage;
}) {
  const controller = useController();
  const reactions = useMessageReactions(groupId, message.id);
  const replyToId = getReplyToId(message);
  const parent = useGroupEvent(groupId, replyToId);

  const grouped = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of reactions) {
      const emoji = r.content || "👍";
      map.set(emoji, (map.get(emoji) ?? 0) + 1);
    }
    return [...map.entries()];
  }, [reactions]);

  const attachments = useMemo(
    () => getMediaAttachments(message.tags),
    [message.tags],
  );

  const react = (emoji: string) =>
    controller?.sendReaction(
      groupId,
      { id: message.id, pubkey: message.pubkey },
      emoji,
    );

  return (
    <div className={cn("flex gap-2 px-3 py-1", mine && "flex-row-reverse")}>
      <UserAvatar pubkey={message.pubkey} size={28} className="mt-1" />
      <div
        className={cn("max-w-[75%] min-w-0", mine && "items-end text-right")}
      >
        <div
          className={cn(
            "flex items-baseline gap-2",
            mine && "flex-row-reverse",
          )}
        >
          <UserName
            pubkey={message.pubkey}
            className="text-xs font-medium text-muted-foreground"
          />
          <span className="text-[10px] text-muted-foreground/70">
            {formatTime(message.created_at)}
          </span>
        </div>
        <MessageActionsMenu
          groupId={groupId}
          message={message}
          onReply={onReply}
          readOnly={readOnly}
        >
          <div
            className={cn(
              "inline-block rounded-2xl px-3 py-1.5 text-sm whitespace-pre-wrap break-words text-left cursor-default",
              mine ? "bg-primary text-primary-foreground" : "bg-muted",
            )}
          >
            {replyToId && (
              <div
                className={cn(
                  "mb-1 rounded border-l-2 px-2 py-0.5 text-xs",
                  mine
                    ? "border-primary-foreground/40 bg-primary-foreground/10"
                    : "border-foreground/30 bg-background/50",
                )}
              >
                {parent ? (
                  <>
                    <UserName
                      pubkey={parent.pubkey}
                      className="font-medium opacity-80"
                    />
                    <div className="truncate opacity-70">{parent.content}</div>
                  </>
                ) : (
                  <span className="opacity-60">
                    replying to an earlier message…
                  </span>
                )}
              </div>
            )}
            {attachments.length > 0 && (
              <div className="flex flex-col gap-1.5 py-0.5">
                {attachments.map((attachment) => (
                  <MediaAttachmentView
                    key={attachment.ciphertextSha256}
                    groupId={groupId}
                    attachment={attachment}
                    mine={mine}
                  />
                ))}
              </div>
            )}
            {delivery?.fileName && (
              <div className="mb-1 text-xs">
                Attachment: {delivery.fileName}
              </div>
            )}
            {message.content}
          </div>
        </MessageActionsMenu>
        {delivery && (
          <div
            role={delivery.status === "failed" ? "alert" : "status"}
            className={cn(
              "mt-1 flex items-center justify-end gap-1 text-xs text-muted-foreground",
              delivery.status === "failed" && "text-destructive",
            )}
          >
            {delivery.status === "sending" && (
              <>
                <IconLoader2 className="size-3 animate-spin" /> Sending…
              </>
            )}
            {delivery.status === "sent" && (
              <>
                <IconCheck className="size-3" /> Sent · confirmed by relay
              </>
            )}
            {delivery.status === "failed" && (
              <>
                <span>Send failed: {delivery.error}</span>
                <Button size="sm" variant="outline" onClick={delivery.retry}>
                  Retry
                </Button>
              </>
            )}
          </div>
        )}
        {grouped.length > 0 && (
          <div
            className={cn(
              "mt-0.5 flex items-center gap-1",
              mine && "justify-end",
            )}
          >
            {grouped.map(([emoji, count]) => (
              <button
                key={emoji}
                disabled={readOnly}
                onClick={() => react(emoji)}
                className="rounded-full border bg-background px-1.5 py-0.5 text-xs hover:bg-accent"
              >
                {emoji} {count}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

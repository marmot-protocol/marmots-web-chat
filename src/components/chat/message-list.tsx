import { use$ } from "applesauce-react/hooks";
import { memo, useEffect, useMemo, useRef } from "react";

import { Button } from "@/components/ui/button";
import { useChat, useController } from "@/hooks/use-marmot";
import { useGroupMessages } from "@/hooks/use-group-chat";
import { getMessageOutbox } from "@/lib/marmot/message-outbox";
import { MessageItem } from "./message-item";
import type { ReplyTarget } from "./types";

/**
 * The scrolling message list for a group. Memoized so it only re-renders when
 * its own data changes (messages, pagination, identity) — not when sibling UI
 * state like the composer's text or reply target changes.
 */
export const MessageList = memo(function MessageList({
  groupId,
  onReply,
  readOnly = false,
}: {
  groupId: string;
  onReply?: (target: ReplyTarget) => void;
  readOnly?: boolean;
}) {
  const controller = useController();
  const snapshot = useChat();
  const messages = useGroupMessages(groupId);
  const outgoing = use$(
    () => (controller ? getMessageOutbox(controller).messages$ : undefined),
    [controller],
  );
  const rows = useMemo(() => {
    const local = (outgoing ?? []).filter((entry) => entry.groupId === groupId);
    const localIds = new Set(local.map((entry) => entry.message.id));
    return [
      ...messages
        .filter((message) => !localIds.has(message.id))
        .map((message) => ({
          key: message.id,
          message,
          delivery: undefined as (typeof local)[number] | undefined,
          time: message.created_at,
        })),
      ...local.map((entry) => ({
        key: entry.key,
        message: entry.message,
        delivery: entry,
        time: entry.submittedAt,
      })),
    ].sort((a, b) => a.time - b.time);
  }, [messages, outgoing, groupId]);
  const me = snapshot?.me.pubkey;
  const pagination = snapshot?.pagination[groupId];
  const bottomRef = useRef<HTMLDivElement>(null);

  // Stick to bottom on new messages.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [rows.length, groupId]);

  return (
    <div className="flex-1 overflow-y-auto py-2">
      {!pagination?.exhausted && messages.length > 0 && (
        <div className="flex justify-center py-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={pagination?.loadingOlder}
            onClick={() => controller?.loadOlder(groupId)}
          >
            {pagination?.loadingOlder ? "Loading…" : "Load older messages"}
          </Button>
        </div>
      )}
      {rows.length === 0 && (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          No messages yet — say hello.
        </div>
      )}
      {rows.map(({ key, message, delivery }) => (
        <MessageItem
          key={key}
          groupId={groupId}
          message={message}
          mine={message.pubkey === me}
          onReply={onReply}
          readOnly={readOnly || (!!delivery && delivery.status !== "sent")}
          delivery={delivery}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
});

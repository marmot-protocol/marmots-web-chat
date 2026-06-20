import { memo, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { useChat, useController } from "@/hooks/use-marmot";
import { useGroupMessages } from "@/hooks/use-group-chat";
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
}: {
  groupId: string;
  onReply: (target: ReplyTarget) => void;
}) {
  const controller = useController();
  const snapshot = useChat();
  const messages = useGroupMessages(groupId);
  const me = snapshot?.me.pubkey;
  const pagination = snapshot?.pagination[groupId];
  const bottomRef = useRef<HTMLDivElement>(null);

  // Stick to bottom on new messages.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, groupId]);

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
      {messages.length === 0 && (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          No messages yet — say hello.
        </div>
      )}
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          groupId={groupId}
          message={message}
          mine={message.pubkey === me}
          onReply={onReply}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
});

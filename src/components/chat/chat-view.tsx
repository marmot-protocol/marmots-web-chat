import { useEffect, useRef, useState } from "react";
import { SendHorizonal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserName } from "@/components/user";
import { useChat, useController } from "@/hooks/use-marmot";
import { useGroupMessages } from "@/hooks/use-group-chat";
import { MessageItem } from "./message-item";

interface ReplyTarget {
  id: string;
  pubkey: string;
  content: string;
}

export function ChatView({ groupId }: { groupId: string }) {
  const controller = useController();
  const snapshot = useChat();
  const messages = useGroupMessages(groupId);
  const me = snapshot?.me.pubkey;

  const [text, setText] = useState("");
  const [reply, setReply] = useState<ReplyTarget | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const pagination = snapshot?.pagination[groupId];

  // Stick to bottom on new messages.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, groupId]);

  const send = async () => {
    const value = text.trim();
    if (!value || !controller) return;
    setText("");
    const replyTo = reply ? { id: reply.id, pubkey: reply.pubkey } : undefined;
    setReply(null);
    await controller.sendText(groupId, value, replyTo);
  };

  return (
    <div className="flex h-full flex-col">
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
            onReply={setReply}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t p-2">
        {reply && (
          <div className="mb-2 flex items-center justify-between rounded bg-muted px-2 py-1 text-xs">
            <span className="truncate">
              Replying to <UserName pubkey={reply.pubkey} className="font-medium" />:{" "}
              <span className="text-muted-foreground">{reply.content.slice(0, 60)}</span>
            </span>
            <Button variant="ghost" size="icon" className="size-5" onClick={() => setReply(null)}>
              <X className="size-3" />
            </Button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
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
          <Button size="icon" onClick={() => void send()} disabled={!text.trim()}>
            <SendHorizonal className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

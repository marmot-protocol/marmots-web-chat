import { useState } from "react";
import { SendHorizonal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserName } from "@/components/user";
import { useController } from "@/hooks/use-marmot";
import type { ReplyTarget } from "./types";

/**
 * The message input form. Owns its own `text` state so keystrokes re-render
 * only this component, never the message list or the rest of the chat view.
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
  const [text, setText] = useState("");

  const send = async () => {
    const value = text.trim();
    if (!value || !controller) return;
    setText("");
    const replyTo = reply ? { id: reply.id, pubkey: reply.pubkey } : undefined;
    onClearReply();
    await controller.sendText(groupId, value, replyTo);
  };

  return (
    <div className="border-t p-2">
      {reply && (
        <div className="mb-2 flex items-center justify-between rounded bg-muted px-2 py-1 text-xs">
          <span className="truncate">
            Replying to <UserName pubkey={reply.pubkey} className="font-medium" />:{" "}
            <span className="text-muted-foreground">{reply.content.slice(0, 60)}</span>
          </span>
          <Button variant="ghost" size="icon" className="size-5" onClick={onClearReply}>
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
  );
}

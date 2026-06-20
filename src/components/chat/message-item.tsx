import { memo, useMemo } from "react";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { SmilePlus, Reply } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { UserAvatar, UserName } from "@/components/user";
import { useController } from "@/hooks/use-marmot";
import {
  getReplyToId,
  useGroupEvent,
  useMessageReactions,
} from "@/hooks/use-group-chat";

const QUICK_EMOJI = ["👍", "❤️", "😂", "🎉", "🙏", "🔥"];

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
}: {
  groupId: string;
  message: NostrEvent;
  mine: boolean;
  onReply: (target: { id: string; pubkey: string; content: string }) => void;
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

  const react = (emoji: string) =>
    controller?.sendReaction(groupId, { id: message.id, pubkey: message.pubkey }, emoji);

  return (
    <div className={cn("group flex gap-2 px-3 py-1", mine && "flex-row-reverse")}>
      <UserAvatar pubkey={message.pubkey} size={28} className="mt-1" />
      <div className={cn("max-w-[75%] min-w-0", mine && "items-end text-right")}>
        <div className={cn("flex items-baseline gap-2", mine && "flex-row-reverse")}>
          <UserName
            pubkey={message.pubkey}
            className="text-xs font-medium text-muted-foreground"
          />
          <span className="text-[10px] text-muted-foreground/70">
            {formatTime(message.created_at)}
          </span>
        </div>
        <div
          className={cn(
            "inline-block rounded-2xl px-3 py-1.5 text-sm whitespace-pre-wrap break-words text-left",
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
                <span className="opacity-60">replying to an earlier message…</span>
              )}
            </div>
          )}
          {message.content}
        </div>
        <div className={cn("mt-0.5 flex items-center gap-1", mine && "justify-end")}>
          {grouped.map(([emoji, count]) => (
            <button
              key={emoji}
              onClick={() => react(emoji)}
              className="rounded-full border bg-background px-1.5 py-0.5 text-xs hover:bg-accent"
            >
              {emoji} {count}
            </button>
          ))}
          <div className="opacity-0 group-hover:opacity-100 flex">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="size-6">
                  <SmilePlus className="size-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="flex w-auto gap-1 p-1">
                {QUICK_EMOJI.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => react(emoji)}
                    className="rounded p-1 text-lg hover:bg-accent"
                  >
                    {emoji}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() =>
                onReply({
                  id: message.id,
                  pubkey: message.pubkey,
                  content: message.content,
                })
              }
            >
              <Reply className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});

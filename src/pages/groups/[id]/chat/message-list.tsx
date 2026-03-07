import type { AppGroup } from "@/lib/marmot-client";
import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import { kinds } from "applesauce-core/helpers";
import { memo, useEffect, useRef } from "react";

import { MessageItem } from "./message-item";

export interface MessageListProps {
  messages: Rumor[];
  group: AppGroup;
  onLaunch: (webxdcId: string, xdcUrl: string) => void;
  onAddReaction: (
    targetId: string,
    authorPubkey: string,
    emoji: string,
  ) => void;
  onReply: (rumor: Rumor) => void;
}

/** Threshold in pixels from the bottom considered "near the bottom". */
const SCROLL_THRESHOLD = 100;

export const MessageList = memo(function MessageList({
  messages,
  group,
  onLaunch,
  onAddReaction,
  onReply,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // On initial render always scroll to the bottom
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
      return;
    }

    // For subsequent updates only scroll if the user is already near the bottom
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom <= SCROLL_THRESHOLD) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Render kind-9 chat messages and kind-1063 file events; kind-7 reactions are handled per-message
  const chatMessages = messages.filter(
    (r) => r.kind === kinds.ChatMessage || r.kind === 1063,
  );

  if (chatMessages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>No messages yet. Start the conversation!</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      {chatMessages.map((rumor, index) => (
        <MessageItem
          key={`${rumor.id}-${index}`}
          rumor={rumor}
          group={group}
          onLaunch={onLaunch}
          onAddReaction={(emoji) =>
            onAddReaction(rumor.id, rumor.pubkey, emoji)
          }
          onReply={onReply}
        />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
});

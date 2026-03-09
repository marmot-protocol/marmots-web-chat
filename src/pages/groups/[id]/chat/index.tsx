import {
  getNostrGroupIdHex,
  type MediaAttachment,
  unixNow,
} from "@internet-privacy/marmot-ts";
import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import { kinds } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { map } from "rxjs";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { WebxdcRuntime } from "@/components/webxdc-runtime";
import { useGroup } from "@/contexts/group-context";
import { useGroupEventStore } from "@/contexts/group-event-store-context";
import { useSendReaction } from "@/hooks/use-send-reaction";
import { getGroupSubscriptionManager } from "@/lib/runtime";

import { MessageForm } from "./message-form";
import { MessageList } from "./message-list";
import { useMessageSender } from "./use-message-sender";

export default function GroupChatPage() {
  const { group, loadingMore, loadingDone, loadMoreMessages } = useGroup();

  // Per-group EventStore — provided by the [id].tsx layout via context.
  // Contains all group-private rumors (kind 9 messages, kind 7 reactions, etc.)
  const groupEventStore = useGroupEventStore();

  // Reactive chat messages from the group store. timeline() returns newest-first
  // (descending created_at). We reverse to ascending so the MessageList renders
  // oldest→newest in DOM order, which pairs correctly with the flex-col-reverse
  // outer scroll container that keeps the view pinned to the bottom.
  const messages = use$(
    () =>
      groupEventStore
        .timeline({
          kinds: [kinds.ChatMessage, kinds.FileMetadata],
        })
        .pipe(map((events) => [...events].reverse())),
    [groupEventStore],
  );

  const { sendReaction } = useSendReaction(group ?? null);

  const handleAddReaction = async (
    targetId: string,
    authorPubkey: string,
    emoji: string,
  ) => {
    await sendReaction(targetId, authorPubkey, emoji);
  };

  const groupIdHex = getNostrGroupIdHex(group.state);

  // Active webxdc app session (if any)
  const [activeWebxdc, setActiveWebxdc] = useState<{
    webxdcId: string;
    xdcUrl: string;
  } | null>(null);

  const handleLaunch = (webxdcId: string, xdcUrl: string) => {
    setActiveWebxdc({ webxdcId, xdcUrl });
  };

  // Reply state — holds the rumor we are replying to, or null
  const [replyTo, setReplyTo] = useState<Rumor | null>(null);

  // Mark group as seen when new messages arrive
  useEffect(() => {
    if (!groupIdHex) return;
    const subscriptionManager = getGroupSubscriptionManager();
    if (!subscriptionManager) return;
    subscriptionManager.markGroupSeen(groupIdHex, unixNow());
  }, [groupIdHex, messages?.length]);

  // Message sender — receives replyTo so it can build the q tag + NIP-21 content
  const {
    sendMessage,
    isSending,
    error: sendError,
  } = useMessageSender(group ?? null, replyTo);

  // Handle sending messages (text + optional MIP-04 attachment passed from MessageForm)
  const handleSendMessage = async (
    text: string,
    attachment?: MediaAttachment,
  ) => {
    if (!text.trim() && !attachment) return;

    try {
      await sendMessage(text, attachment);
      setReplyTo(null);
    } catch {
      // Ignore errors for now
    }
  };

  return (
    <>
      <div className="flex flex-col-reverse flex-1 h-0 overflow-y-auto overflow-x-hidden px-2 pt-10">
        <MessageList
          messages={messages as Rumor[]}
          group={group}
          onLaunch={handleLaunch}
          onAddReaction={handleAddReaction}
          onReply={setReplyTo}
        />
        {!loadingDone && (
          <div className="flex justify-center py-2">
            <Button onClick={loadMoreMessages} disabled={loadingMore}>
              {loadingMore ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                "Load older messages"
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Message Input - sticky at bottom; state lives in MessageForm to avoid full-page re-renders on typing */}
      <div className="border-t p-2 bg-background shrink-0">
        <MessageForm
          group={group}
          isSending={isSending}
          onSend={handleSendMessage}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      </div>

      {/* Webxdc runtime modal */}
      {activeWebxdc && (
        <WebxdcRuntime
          group={group}
          webxdcId={activeWebxdc.webxdcId}
          xdcUrl={activeWebxdc.xdcUrl}
          onClose={() => setActiveWebxdc(null)}
        />
      )}
    </>
  );
}

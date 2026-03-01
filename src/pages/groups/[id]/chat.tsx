import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import { getEventHash, kinds, neventEncode } from "applesauce-core/helpers";
import type { ComponentMap } from "applesauce-react/helpers";
import { use$, useRenderedContent } from "applesauce-react/hooks";
import { Bug, Loader2, Reply, X, XCircle } from "lucide-react";
import {
  getNostrGroupIdHex,
  type GroupRumorHistory,
  MarmotGroup,
  unixNow,
} from "@internet-privacy/marmots";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router";

import { defaultContentComponents } from "@/components/content-renderers";
import { GroupChatMentionRenderer } from "@/components/content-renderers/group-chat-mention";
import { MessageReactions } from "@/components/message-reactions";
import { UserAvatar, UserName } from "@/components/nostr-user";
import { TranscriptionButton } from "@/components/transcription-button";
import { WebxdcAppCard } from "@/components/webxdc-app-card";
import { WebxdcRuntime } from "@/components/webxdc-runtime";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useGroupEventStore } from "@/contexts/group-event-store-context";
import { useSendReaction } from "@/hooks/use-send-reaction";
import { accounts } from "@/lib/accounts";
import { getGroupSubscriptionManager } from "@/lib/runtime";
import { isWebxdcMessage } from "@/lib/webxdc";

// Component map that overrides the mention renderer with a group-context-aware
// version that can resolve private kind-9 rumours as inline quote blocks.
// Also overrides the text renderer to suppress pure-whitespace nodes that
// appear between a quote block and the reply text (the "\n" separator that
// NIP-C7 mandates between the nostr:nevent URI and message content would
// otherwise produce a visible blank line due to whitespace-pre-wrap).
const groupChatContentComponents: ComponentMap = {
  ...defaultContentComponents,
  mention: GroupChatMentionRenderer,
  text: ({ node }: { node: { value: string } }) => {
    if (node.value.trim() === "") return null;
    return <span>{node.value}</span>;
  },
};

// ============================================================================
// Types for outlet context
// ============================================================================

interface GroupOutletContext {
  group: MarmotGroup<GroupRumorHistory>;
  groupDetails: {
    name: string;
    epoch: number;
    members: string[];
    admins: string[];
  } | null;
  isAdmin: boolean;
  loadingMore: boolean;
  loadingDone: boolean;
  loadMoreMessages: () => Promise<void>;
}

// ============================================================================
// Component: MessageItem
// ============================================================================

interface MessageItemProps {
  rumor: Rumor;
  onLaunch: (webxdcId: string, xdcUrl: string) => void;
  reactions: { emoji: string; by: string }[];
  onAddReaction: (emoji: string) => void;
  onReply: (rumor: Rumor) => void;
}

const MessageItem = memo(function MessageItem({
  rumor,
  onLaunch,
  reactions,
  onAddReaction,
  onReply,
}: MessageItemProps) {
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString();
  };

  const [debugOpen, setDebugOpen] = useState(false);

  const isWebxdc = isWebxdcMessage(rumor);
  const hasReactions = reactions.length > 0;

  // Render content with rich text formatting (for non-webxdc messages).
  // Uses the group-aware component map so that nevent mentions that reference
  // private kind-9 rumours are rendered as inline quote blocks.
  const content = useRenderedContent(
    isWebxdc ? { ...rumor, content: "" } : rumor,
    groupChatContentComponents,
  );

  return (
    // Avatar floats left, everything else stacks to its right
    <div className="flex items-start gap-2">
      <UserAvatar pubkey={rumor.pubkey} size="sm" />

      <div className="flex flex-col gap-0.5 min-w-0">
        {/* Title row: name · timestamp · action buttons (when no reactions yet) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-bold">
            <UserName pubkey={rumor.pubkey} />
          </span>
          <span className="text-sm text-muted-foreground/60">
            {formatTimestamp(rumor.created_at)}
          </span>
          {!hasReactions && (
            <div className="flex items-center gap-0.5">
              <MessageReactions
                rumorId={rumor.id}
                reactions={[]}
                onAddReaction={onAddReaction}
              />
              <button
                onClick={() => onReply(rumor)}
                className="flex items-center justify-center w-6 h-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Reply"
                title="Reply"
              >
                <Reply className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Message content */}
        {isWebxdc ? (
          <WebxdcAppCard rumor={rumor} onLaunch={onLaunch} />
        ) : (
          <div className="whitespace-pre-wrap break-words overflow-hidden">
            {content}
          </div>
        )}

        {/* Reactions row — only shown when there are reactions */}
        {hasReactions && (
          <div className="flex items-center gap-0.5">
            <MessageReactions
              rumorId={rumor.id}
              reactions={reactions}
              onAddReaction={onAddReaction}
            />
            <button
              onClick={() => onReply(rumor)}
              className="flex items-center justify-center w-6 h-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Reply"
              title="Reply"
            >
              <Reply className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

// ============================================================================
// Component: MessageList
// ============================================================================

interface MessageListProps {
  messages: Rumor[];
  reactionsMap: Map<string, { emoji: string; by: string }[]>;
  onLaunch: (webxdcId: string, xdcUrl: string) => void;
  onAddReaction: (
    targetId: string,
    authorPubkey: string,
    emoji: string,
  ) => void;
  onReply: (rumor: Rumor) => void;
}

const MessageList = memo(function MessageList({
  messages,
  reactionsMap,
  onLaunch,
  onAddReaction,
  onReply,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Only render kind-9 chat messages; kind-7 reactions are handled via reactionsMap
  const chatMessages = messages.filter((r) => r.kind === kinds.ChatMessage);

  if (chatMessages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>No messages yet. Start the conversation!</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {chatMessages.map((rumor, index) => (
        <MessageItem
          key={`${rumor.id}-${index}`}
          rumor={rumor}
          onLaunch={onLaunch}
          reactions={reactionsMap.get(rumor.id) ?? []}
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

// ============================================================================
// Component: MessageForm (owns draft state so typing does not re-render page)
// ============================================================================

interface MessageFormProps {
  isSending: boolean;
  onSend: (text: string) => Promise<void>;
  replyTo: Rumor | null;
  onCancelReply: () => void;
}

function MessageForm({
  isSending,
  onSend,
  replyTo,
  onCancelReply,
}: MessageFormProps) {
  const input = useRef<HTMLInputElement>(null);
  const [messageText, setMessageText] = useState("");

  const handleSubmit = async () => {
    const text = messageText.trim();
    if (!text) return;
    try {
      await onSend(text);
      setMessageText("");

      // Focus the input after sending
      input.current?.focus();
    } catch {
      // Error shown by parent; keep draft
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Reply banner — shown only when replying to a message */}
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

      <div className="flex gap-2">
        <Input
          ref={input}
          type="text"
          placeholder={replyTo ? "Write a reply…" : "Type your message…"}
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          disabled={isSending}
          className="flex-1"
        />
        <TranscriptionButton onTranscription={(text) => setMessageText(text)} />
        <Button
          onClick={handleSubmit}
          disabled={isSending || !messageText.trim()}
        >
          {isSending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            "Send"
          )}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Hook: useMessageSender
// ============================================================================

function useMessageSender(
  group: MarmotGroup<GroupRumorHistory> | null,
  replyTo: Rumor | null,
) {
  const account = use$(accounts.active$);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = async (messageText: string): Promise<Rumor | null> => {
    if (!group || !account || !messageText.trim()) return null;

    try {
      setIsSending(true);
      setError(null);

      const pubkey = await account.signer.getPublicKey();

      // Build tags and content per NIP-C7 reply spec:
      // - q tag: ["q", <event-id>, <relay-hint>, <author-pubkey>]
      // - content prefixed with nostr:nevent1... URI on its own line
      let tags: string[][] = [];
      let content = messageText.trim();

      if (replyTo) {
        const encoded = neventEncode({
          id: replyTo.id,
          author: replyTo.pubkey,
        });
        tags = [["q", replyTo.id, "", replyTo.pubkey]];
        content = `nostr:${encoded}\n${content}`;
      }

      // Create rumor (unsigned Nostr event)
      const rumor: Rumor = {
        id: "", // Will be computed
        kind: 9, // Chat message kind
        pubkey,
        created_at: unixNow(),
        content,
        tags,
      };

      // Compute event ID
      rumor.id = getEventHash(rumor);

      // Send via group
      await group.sendApplicationRumor(rumor);

      return rumor;
    } catch (err) {
      console.error("Failed to send message:", err);
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setIsSending(false);
    }
  };

  return { sendMessage, isSending, error };
}

// ============================================================================
// Main Component
// ============================================================================

export default function GroupChatPage() {
  const { group, loadingMore, loadingDone, loadMoreMessages } =
    useOutletContext<GroupOutletContext>();

  // Per-group EventStore — provided by the [id].tsx layout via context.
  // Contains all group-private rumors (kind 9 messages, kind 7 reactions, etc.)
  const groupEventStore = useGroupEventStore();

  // Reactive chat messages from the group store. timeline() returns newest-first
  // (descending created_at). We reverse to ascending so the MessageList renders
  // oldest→newest in DOM order, which pairs correctly with the flex-col-reverse
  // outer scroll container that keeps the view pinned to the bottom.
  const messagesDesc = use$(
    () => groupEventStore.timeline({ kinds: [kinds.ChatMessage] }),
    [groupEventStore],
  );
  const messages = useMemo(
    () => (messagesDesc ? [...messagesDesc].reverse() : []),
    [messagesDesc],
  );

  // Reactive reactions from the group store — grouped by target event id
  const reactionEvents = use$(
    () => groupEventStore.timeline({ kinds: [kinds.Reaction] }),
    [groupEventStore],
  );

  // Build a map of targetId → ReactionItem[] from all kind-7 rumors in the store
  const reactionsMap = useMemo(() => {
    const map = new Map<string, { emoji: string; by: string }[]>();
    for (const event of reactionEvents ?? []) {
      const eTags = event.tags.filter((t) => t[0] === "e");
      if (eTags.length === 0) continue;
      const targetId = eTags[eTags.length - 1][1];
      if (!targetId) continue;
      const emoji =
        !event.content || event.content === "+" ? "👍" : event.content;
      const existing = map.get(targetId) ?? [];
      existing.push({ emoji, by: event.pubkey });
      map.set(targetId, existing);
    }
    return map;
  }, [reactionEvents]);

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
  }, [groupIdHex, messages.length]);

  // Message sender — receives replyTo so it can build the q tag + NIP-21 content
  const {
    sendMessage,
    isSending,
    error: sendError,
  } = useMessageSender(group ?? null, replyTo);

  // Handle sending messages (text passed from MessageForm so page doesn't re-render on typing)
  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;

    try {
      const sentRumor = await sendMessage(text);

      // Optimistically save the rumor to the group history. The
      // useGroupEventStore listener will pick it up via the "rumor" event and
      // add it to the store — no manual store.add() needed here.
      if (sentRumor && group?.history) await group.history.saveRumor(sentRumor);

      // Clear the reply context after a successful send
      setReplyTo(null);
    } catch {
      // Error is already set by useMessageSender
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-118px)]">
      {/* Error Display */}
      {sendError && (
        <div className="p-4">
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>Error: {sendError}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Messages - flex-col-reverse for scroll-to-bottom behavior.
          The GroupEventStoreContext (provided by the layout) is used by the
          group-aware mention renderer to resolve nevent references to private
          kind-9 rumours as inline quote blocks. */}
      <div className="flex flex-col-reverse h-full overflow-y-auto overflow-x-hidden px-2 pt-10">
        <MessageList
          messages={messages as Rumor[]}
          reactionsMap={reactionsMap}
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
      <div className="border-t p-4 bg-background">
        <MessageForm
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
    </div>
  );
}

import { Rumor } from "applesauce-common/helpers/gift-wrap";
import { getEventHash } from "applesauce-core/helpers";
import { use$, useRenderedContent } from "applesauce-react/hooks";
import { Loader2, XCircle } from "lucide-react";
import { getNostrGroupIdHex, MarmotGroup, unixNow } from "marmot-ts";
import { memo, useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router";

import { defaultContentComponents } from "@/components/content-renderers";
import { UserBadge } from "@/components/nostr-user";
import { TranscriptionButton } from "@/components/transcription-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGroupMessages } from "@/hooks/use-group-messages";
import { accounts } from "@/lib/accounts";
import { getGroupSubscriptionManager } from "@/lib/runtime";

// ============================================================================
// Types for outlet context
// ============================================================================

interface GroupOutletContext {
  group: MarmotGroup<any>;
  groupDetails: {
    name: string;
    epoch: number;
    members: string[];
    admins: string[];
  } | null;
  isAdmin: boolean;
}

// ============================================================================
// Component: MessageItem
// ============================================================================

const MessageItem = memo(function MessageItem({ rumor }: { rumor: Rumor }) {
  const account = use$(accounts.active$);
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString();
  };

  const isOwnMessage = rumor.pubkey === account?.pubkey;

  // Render content with rich text formatting
  const content = useRenderedContent(rumor, defaultContentComponents);

  return (
    <div
      className={`flex flex-col gap-1 ${
        isOwnMessage ? "items-end" : "items-start"
      }`}
    >
      <div className="flex items-center gap-2">
        <UserBadge pubkey={rumor.pubkey} size="sm" />
        <span className="text-xs text-muted-foreground/70">
          {formatTimestamp(rumor.created_at)}
        </span>
      </div>
      <div
        className={`p-3 max-w-[80%] rounded-lg ${
          isOwnMessage
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        }`}
      >
        <div className="text-sm whitespace-pre-wrap break-words overflow-hidden">
          {content}
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// Component: MessageList
// ============================================================================

const MessageList = memo(function MessageList({
  messages,
}: {
  messages: Rumor[];
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>No messages yet. Start the conversation!</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.map((rumor, index) => (
        <MessageItem key={`${rumor.id}-${index}`} rumor={rumor} />
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
}

function MessageForm({ isSending, onSend }: MessageFormProps) {
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
    <div className="flex gap-2">
      <Input
        ref={input}
        type="text"
        placeholder="Type your message..."
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
  );
}

// ============================================================================
// Hook: useMessageSender
// ============================================================================

function useMessageSender(group: MarmotGroup<any> | null) {
  const account = use$(accounts.active$);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = async (messageText: string): Promise<Rumor | null> => {
    if (!group || !account || !messageText.trim()) return null;

    try {
      setIsSending(true);
      setError(null);

      // Create rumor (unsigned Nostr event)
      const pubkey = await account.signer.getPublicKey();
      const rumor: Rumor = {
        id: "", // Will be computed
        kind: 9, // Chat message kind
        pubkey,
        created_at: unixNow(),
        content: messageText.trim(),
        tags: [],
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
  const { group } = useOutletContext<GroupOutletContext>();

  const { messages, loadMoreMessages, loadingMore, loadingDone } =
    useGroupMessages(group ?? null);

  const groupIdHex = getNostrGroupIdHex(group.state);

  // Mark group as seen when new messages arrive
  useEffect(() => {
    if (!groupIdHex) return;
    const subscriptionManager = getGroupSubscriptionManager();
    if (!subscriptionManager) return;
    subscriptionManager.markGroupSeen(groupIdHex, unixNow());
  }, [groupIdHex, messages.length]);

  // Message sender
  const {
    sendMessage,
    isSending,
    error: sendError,
  } = useMessageSender(group ?? null);

  // Handle sending messages (text passed from MessageForm so page doesn't re-render on typing)
  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;

    try {
      const sentRumor = await sendMessage(text);

      // Optimistically save new messages to the groups history for immediate feedback
      if (sentRumor && group?.history) await group.history.saveRumor(sentRumor);
    } catch (err) {
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

      {/* Messages - flex-col-reverse for scroll-to-bottom behavior */}
      <div className="flex flex-col-reverse h-full overflow-y-auto overflow-x-hidden px-2 pt-10">
        <MessageList messages={messages} />
        {loadMoreMessages && !loadingDone && (
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
        <MessageForm isSending={isSending} onSend={handleSendMessage} />
      </div>
    </div>
  );
}

import {
  getMediaAttachments,
  getNostrGroupIdHex,
  type MediaAttachment,
  unixNow,
} from "@internet-privacy/marmots";
import type { AppGroup } from "@/lib/marmot-client";
import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import { createImetaTagForAttachment } from "applesauce-common/helpers";
import { kinds, neventEncode } from "applesauce-core/helpers";
import type { ComponentMap } from "applesauce-react/helpers";
import { use$, useRenderedContent } from "applesauce-react/hooks";
import {
  Bug,
  FileIcon,
  Loader2,
  Paperclip,
  Reply,
  X,
  XCircle,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router";

import { defaultContentComponents } from "@/components/content-renderers";
import { GroupChatMentionRenderer } from "@/components/content-renderers/group-chat-mention";
import { Mip04Media } from "@/components/mip04-media";
import { MessageReactions } from "@/components/message-reactions";
import { UserAvatar, UserName } from "@/components/nostr-user";
import { TranscriptionButton } from "@/components/transcription-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { WebxdcAppCard } from "@/components/webxdc-app-card";
import { WebxdcRuntime } from "@/components/webxdc-runtime";
import { useGroupEventStore } from "@/contexts/group-event-store-context";
import { isInlineMediaType, useMediaUpload } from "@/hooks/use-media-upload";

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
  group: AppGroup;
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
  group: AppGroup;
  onLaunch: (webxdcId: string, xdcUrl: string) => void;
  reactions: { emoji: string; by: string }[];
  onAddReaction: (emoji: string) => void;
  onReply: (rumor: Rumor) => void;
}

const MessageItem = memo(function MessageItem({
  rumor,
  group,
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

  // Parse MIP-04 imeta tags from the rumor — validates version, nonce, and
  // filename fields and returns fully-typed MediaAttachment objects.
  const mip04Attachments = useMemo(
    () => getMediaAttachments(rumor.tags),
    [rumor.tags],
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
              <button
                onClick={() => setDebugOpen(true)}
                className="flex items-center justify-center w-6 h-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Debug rumor"
                title="Debug: view raw rumor"
              >
                <Bug className="w-3.5 h-3.5" />
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

        {/* MIP-04 encrypted media attachments */}
        {mip04Attachments.map((attachment, i) => (
          <Mip04Media key={i} attachment={attachment} group={group} />
        ))}

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
            <button
              onClick={() => setDebugOpen(true)}
              className="flex items-center justify-center w-6 h-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Debug rumor"
              title="Debug: view raw rumor"
            >
              <Bug className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Debug dialog — raw rumor JSON */}
        <Dialog open={debugOpen} onOpenChange={setDebugOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Raw Nostr Rumor</DialogTitle>
            </DialogHeader>
            <pre className="overflow-auto text-xs font-mono bg-muted rounded p-3 flex-1">
              {JSON.stringify(rumor, null, 2)}
            </pre>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
});

// ============================================================================
// Component: MessageList
// ============================================================================

interface MessageListProps {
  messages: Rumor[];
  group: AppGroup;
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
  group,
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
          group={group}
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
  group: AppGroup;
  isSending: boolean;
  onSend: (text: string, attachment?: MediaAttachment) => Promise<void>;
  replyTo: Rumor | null;
  onCancelReply: () => void;
}

function MessageForm({
  group,
  isSending,
  onSend,
  replyTo,
  onCancelReply,
}: MessageFormProps) {
  const input = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [messageText, setMessageText] = useState("");

  const {
    state: uploadState,
    upload,
    clear: clearUpload,
  } = useMediaUpload(group);
  const isUploading = uploadState.status === "uploading";
  const hasAttachment = uploadState.status === "ready";
  const attachmentError =
    uploadState.status === "error" ? uploadState.error : null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    upload(file);
    // Reset the input so the same file can be re-selected after clearing
    e.target.value = "";
  };

  const handleSubmit = async () => {
    const text = messageText.trim();
    // Allow sending with attachment even if text is empty
    if (!text && !hasAttachment) return;
    try {
      const attachment =
        uploadState.status === "ready" ? uploadState.attachment : undefined;
      await onSend(text, attachment);
      setMessageText("");
      clearUpload();
      // Defer focus so it runs after React re-renders with isSending=false
      // (the input is disabled while sending, so focusing before the re-render is a no-op)
      setTimeout(() => input.current?.focus(), 0);
    } catch {
      // Error shown by parent; keep draft
    }
  };

  // Helper: format file size for the preview label
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const attachedFile = uploadState.status !== "idle" ? uploadState.file : null;
  const isImage = attachedFile?.type.startsWith("image/") ?? false;
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Generate a local preview URL for images while uploading/ready
  useEffect(() => {
    if (!attachedFile || !isImage) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(attachedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachedFile, isImage]);

  const canSend =
    !isSending && !isUploading && (!!messageText.trim() || hasAttachment);

  return (
    <div className="flex flex-col gap-2">
      {/* Reply banner */}
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

      {/* Attachment preview — shown while uploading or when ready */}
      {attachedFile && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted border text-sm">
          {/* Thumbnail or file icon */}
          {isImage && previewUrl ? (
            <img
              src={previewUrl}
              alt={attachedFile.name}
              className="h-10 w-10 rounded object-cover shrink-0"
            />
          ) : (
            <FileIcon className="w-8 h-8 text-muted-foreground shrink-0" />
          )}

          <div className="flex flex-col min-w-0 flex-1">
            <span className="truncate font-medium text-foreground">
              {attachedFile.name}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatSize(attachedFile.size)}
              {isUploading && " · Encrypting & uploading…"}
              {hasAttachment && " · Ready"}
              {attachmentError && (
                <span className="text-destructive"> · {attachmentError}</span>
              )}
            </span>
          </div>

          {/* Upload spinner or clear button */}
          {isUploading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
          ) : (
            <button
              onClick={clearUpload}
              className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full hover:bg-background transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Remove attachment"
              title="Remove attachment"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Input row */}
      <div className="flex gap-2">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,audio/*,.pdf,.zip,.txt"
          className="hidden"
          onChange={handleFileChange}
          disabled={isUploading}
        />

        {/* Paperclip attachment button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || isSending}
          aria-label="Attach file"
          title="Attach file"
        >
          <Paperclip className="w-4 h-4" />
        </Button>

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
        <Button onClick={handleSubmit} disabled={!canSend}>
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

function useMessageSender(group: AppGroup | null, replyTo: Rumor | null) {
  const account = use$(accounts.active$);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = async (
    messageText: string,
    attachment?: MediaAttachment,
  ) => {
    if (!group || !account) return null;
    if (!messageText.trim() && !attachment) return null;

    try {
      setIsSending(true);
      setError(null);

      // Build NIP-C7 reply prefix/tags when replying
      const replyTags: string[][] = replyTo
        ? [["q", replyTo.id, "", replyTo.pubkey]]
        : [];
      const replyPrefix = replyTo
        ? `nostr:${neventEncode({ id: replyTo.id, author: replyTo.pubkey })}\n`
        : "";

      if (attachment && !isInlineMediaType(attachment.type ?? "")) {
        // ── Non-inline attachment (audio, documents, etc.) ──
        // Send as a kind-1063 file metadata rumor so it can be discovered
        // and rendered by file-aware clients.
        const fileTags: string[][] = [
          // NIP-94 required tags
          ["url", attachment.url ?? ""],
          ["m", attachment.type ?? "application/octet-stream"],
          ["x", attachment.sha256 ?? ""],
          // MIP-04 extension fields
          ["filename", attachment.filename],
          ["n", attachment.nonce],
          ["v", attachment.version],
          ...replyTags,
        ];
        if (attachment.size != null)
          fileTags.push(["size", String(attachment.size)]);

        const fileRumor: Omit<Rumor, "id"> = {
          kind: 1063,
          content: messageText.trim(),
          created_at: unixNow(),
          pubkey: account.pubkey,
          tags: fileTags,
        };
        await group.sendApplicationRumor(fileRumor as Rumor);
      } else {
        // ── Inline attachment (image/video) or text-only ──
        // Send as a kind-9 chat message with an optional imeta tag.
        const tags: string[][] = [...replyTags];
        if (attachment) {
          // createImetaTagForAttachment only knows standard NIP-92 fields.
          // Append the three MIP-04-specific fields so receiving clients can
          // derive the decryption key and nonce from the same imeta tag.
          const imetaTag = [
            ...createImetaTagForAttachment(attachment),
            `filename ${attachment.filename}`,
            `n ${attachment.nonce}`,
            `v ${attachment.version}`,
          ];
          tags.push(imetaTag);
        }
        const content = `${replyPrefix}${messageText.trim()}`;
        await group.sendChatMessage(content, tags);
      }
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

  // Handle sending messages (text + optional MIP-04 attachment passed from MessageForm)
  const handleSendMessage = async (
    text: string,
    attachment?: MediaAttachment,
  ) => {
    if (!text.trim() && !attachment) return;

    try {
      const sentRumor = await sendMessage(text, attachment);

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
          group={group}
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
    </div>
  );
}

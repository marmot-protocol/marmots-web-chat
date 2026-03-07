import type { AppGroup } from "@/lib/marmot-client";
import {
  getMediaAttachmentFromFileEvent,
  getMediaAttachments,
} from "@internet-privacy/marmot-ts";
import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import { kinds } from "applesauce-core/helpers";
import type { ComponentMap } from "applesauce-react/helpers";
import { use$, useRenderedContent } from "applesauce-react/hooks";
import { Bug, Reply } from "lucide-react";
import { memo, useMemo, useState } from "react";

import { defaultContentComponents } from "@/components/content-renderers";
import { GroupChatMentionRenderer } from "@/components/content-renderers/group-chat-mention";
import { MessageReactions } from "@/components/message-reactions";
import { Mip04Media } from "@/components/mip04-media";
import { UserAvatar, UserName } from "@/components/nostr-user";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WebxdcAppCard } from "@/components/webxdc-app-card";
import { useGroupEventStore } from "@/contexts/group-event-store-context";
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

/**
 * Reactively subscribes to all kind-7 reactions targeting a specific rumor ID
 * from the per-group event store. Each `MessageItem` calls this independently
 * so the parent no longer needs to build or pass down a reactions map.
 */
function useMessageReactions(rumorId: string): { emoji: string; by: string }[] {
  const groupEventStore = useGroupEventStore();
  const reactionEvents = use$(
    () =>
      groupEventStore.timeline({
        kinds: [kinds.Reaction],
        "#e": [rumorId],
      }),
    [groupEventStore, rumorId],
  );

  return useMemo(
    () =>
      (reactionEvents ?? []).map((event) => ({
        emoji: !event.content || event.content === "+" ? "👍" : event.content,
        by: event.pubkey,
      })),
    [reactionEvents],
  );
}

export interface MessageItemProps {
  rumor: Rumor;
  group: AppGroup;
  onLaunch: (webxdcId: string, xdcUrl: string) => void;
  onAddReaction: (emoji: string) => void;
  onReply: (rumor: Rumor) => void;
}

export const MessageItem = memo(function MessageItem({
  rumor,
  group,
  onLaunch,
  onAddReaction,
  onReply,
}: MessageItemProps) {
  const reactions = useMessageReactions(rumor.id);

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

  // For kind-1063 file events, extract the single attachment from flat NIP-94 tags.
  const fileEventAttachment = useMemo(
    () =>
      rumor.kind === 1063
        ? // Rumor shares the same shape as NostrEvent (id, pubkey, kind, tags, content, created_at)
          getMediaAttachmentFromFileEvent(
            rumor as Parameters<typeof getMediaAttachmentFromFileEvent>[0],
          )
        : null,
    [rumor],
  );

  return (
    // Avatar floats left, everything else stacks to its right
    <div className="flex items-start gap-2">
      <UserAvatar pubkey={rumor.pubkey} size="sm" className="shrink-0" />

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

        {/* Message content — for kind-1063 only render content if non-empty (it's the caption) */}
        {isWebxdc ? (
          <WebxdcAppCard rumor={rumor} onLaunch={onLaunch} />
        ) : rumor.kind === 1063 ? (
          rumor.content.trim() ? (
            <div className="whitespace-pre-wrap break-words overflow-hidden">
              {content}
            </div>
          ) : null
        ) : (
          <div className="whitespace-pre-wrap break-words overflow-hidden">
            {content}
          </div>
        )}

        {/* kind-1063 file event attachment */}
        {fileEventAttachment && (
          <Mip04Media attachment={fileEventAttachment} group={group} />
        )}

        {/* MIP-04 encrypted media attachments (kind-9 imeta tags) */}
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

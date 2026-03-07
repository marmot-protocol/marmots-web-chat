import type { AppGroup } from "@/lib/marmot-client";
import {
  fetchNotificationServerConfig,
  isGroupNotificationEnabled,
  notificationServerPubkey,
} from "@/lib/notifications";
import { type MediaAttachment, unixNow } from "@internet-privacy/marmot-ts";
import { createImetaTagForAttachment } from "applesauce-common/helpers";
import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import { neventEncode } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { useState } from "react";

import { isInlineMediaType } from "@/hooks/use-media-upload";
import { accounts } from "@/lib/accounts";

export function useMessageSender(
  group: AppGroup | null,
  replyTo: Rumor | null,
) {
  const account = use$(accounts.active$);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = async (
    messageText: string,
    attachment?: MediaAttachment,
  ) => {
    if (!group) {
      throw new Error("Cannot send message: no active group context.");
    }
    if (!account) {
      throw new Error("Cannot send message: no active account.");
    }
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

      // MIP-05: trigger push notifications for group members that have
      // registered tokens. Fire-and-forget — must not block the send path.
      if (
        notificationServerPubkey &&
        group.notifications &&
        isGroupNotificationEnabled(group.idStr)
      ) {
        fetchNotificationServerConfig(notificationServerPubkey)
          .then((config) => {
            if (config && group.notifications) {
              return group.notifications.sendNotification(config);
            }
          })
          .catch(() => {
            // Non-critical — notification failures must not affect message delivery
          });
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

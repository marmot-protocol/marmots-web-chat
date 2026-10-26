import { kinds } from "applesauce-core/helpers/event";
import {
  ChatMessageFactory,
  ReactionFactory,
} from "applesauce-common/factories";
import { toRumor } from "applesauce-common/operations/gift-wrap";
import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import { createApplicationMessageIntent } from "@internet-privacy/marmot-ts/client";

import { requireActiveGroup } from "@/lib/marmot/actions/guards";
import type { GroupMedia } from "@/lib/marmot/media";
import type { AppGroup, AppMarmotClient } from "@/lib/marmot/types";

// marmot-ts gap: the library sends application rumors but has no helpers for
// chat messages, NIP-C7 replies, or reactions; applesauce factories build them.

/** A message being replied to or reacted to. */
export interface MessageTarget {
  id: string;
  pubkey: string;
}

/**
 * Send a chat message (kind 9), optionally as a NIP-C7 reply.
 * @param client - The account's Marmot client.
 * @param group - Active group.
 * @param text - Message content.
 * @param replyTo - Optional parent message.
 * @param onPrepared - Receives the rumor before it is published.
 */
export async function sendText(
  client: AppMarmotClient,
  group: AppGroup,
  text: string,
  replyTo?: MessageTarget,
  onPrepared?: (rumor: Rumor) => void,
): Promise<void> {
  requireActiveGroup(group);
  // `client_nonce` keeps identical messages sent in one second distinct.
  let message = ChatMessageFactory.create(text).modifyPublicTags((tags) => [
    ...tags,
    ["client_nonce", crypto.randomUUID()],
  ]);
  if (replyTo)
    message = message.replyTo({ id: replyTo.id, author: replyTo.pubkey });
  const rumor = await message.then(toRumor(group.signer));
  onPrepared?.(rumor);
  await client.groups.send(group.id, createApplicationMessageIntent(rumor));
}

/**
 * Encrypt and upload a file, then send a kind 9 message carrying its `imeta` tag.
 * @param client - The account's Marmot client.
 * @param media - The account's media helper, which retains the source guard.
 * @param group - Active group with an encrypted-media policy.
 * @param file - Attachment to upload.
 * @param caption - Optional message text.
 * @param replyTo - Optional parent message.
 * @param onPrepared - Receives the rumor before it is published.
 */
export async function sendMedia(
  client: AppMarmotClient,
  media: GroupMedia,
  group: AppGroup,
  file: File,
  caption?: string,
  replyTo?: MessageTarget,
  onPrepared?: (rumor: Rumor) => void,
): Promise<void> {
  requireActiveGroup(group);
  const rumor = await media.prepare(group, file, caption, replyTo);
  onPrepared?.(rumor);
  await sendPreparedMessage(client, media, group, rumor);
}

/**
 * Publish an already prepared message, preserving media's source-state guard.
 * @param client - The account's Marmot client.
 * @param media - The account's media helper.
 * @param group - Active group.
 * @param rumor - Rumor previously handed to `onPrepared`.
 */
export async function sendPreparedMessage(
  client: AppMarmotClient,
  media: GroupMedia,
  group: AppGroup,
  rumor: Rumor,
): Promise<void> {
  requireActiveGroup(group);
  await client.groups.send(group.id, media.intentFor(rumor));
}

/**
 * React to a chat message with an emoji (kind 7).
 * @param client - The account's Marmot client.
 * @param group - Active group.
 * @param target - Message being reacted to.
 * @param emoji - Reaction content.
 */
export async function sendReaction(
  client: AppMarmotClient,
  group: AppGroup,
  target: MessageTarget,
  emoji: string,
): Promise<void> {
  requireActiveGroup(group);
  const rumor = await ReactionFactory.create(
    { ...target, kind: kinds.ChatMessage },
    emoji,
  ).then(toRumor(group.signer));
  await client.groups.send(group.id, createApplicationMessageIntent(rumor));
}

import { ChatMessageFactory } from "applesauce-common/factories";
import type { Rumor } from "applesauce-core/helpers/event";
import {
  BLOSSOM_LOCATOR_KIND,
  StaleMediaPreparationError,
  deriveMediaEncryptionKeyV1,
  decryptMediaFileV1,
  mediaSourceStateToken,
  type HistoricalMediaAttachment,
} from "@internet-privacy/marmot-ts";
import {
  prepareMediaMessage,
  createBlossomMediaTransport,
  downloadMediaAttachment,
  createApplicationMessageIntent,
} from "@internet-privacy/marmot-ts/client";

import type { AppGroup } from "@/lib/marmot/types";

/** Suggested Blossom servers when enabling encrypted media on a group. */
export const DEFAULT_BLOSSOM_SERVERS = ["https://blossom.primal.net"];

/** Best-effort `<width>x<height>` render hint for an image file. */
async function imageDimensions(file: File): Promise<string | undefined> {
  if (!file.type.startsWith("image/")) return undefined;
  try {
    const bitmap = await createImageBitmap(file);
    const dim = `${bitmap.width}x${bitmap.height}`;
    bitmap.close();
    return dim;
  } catch {
    return undefined;
  }
}

/**
 * Account-scoped attachment preparation and downloads. MLS state, source evidence,
 * policy validation and cryptography stay in marmot-ts; this class owns only
 * browser metadata, cancellation and the source guard carried through UI retries.
 */
export class GroupMedia {
  readonly #signal: AbortSignal;
  readonly #prepared = new WeakMap<
    Rumor,
    Awaited<ReturnType<typeof prepareMediaMessage>>["intent"]
  >();

  constructor(signal: AbortSignal) {
    this.#signal = signal;
  }

  /** Prepare a fresh upload, retaining its guarded intent until this rumor is released. */
  async prepare(
    group: AppGroup,
    file: File,
    caption?: string,
    replyTo?: { id: string; pubkey: string },
  ): Promise<Rumor> {
    let message = ChatMessageFactory.create(caption);
    if (replyTo)
      message = message.replyTo({ id: replyTo.id, author: replyTo.pubkey });
    const draft = await message;
    const prepared = await prepareMediaMessage(
      group,
      [
        {
          blob: file,
          metadata: {
            filename: file.name,
            type: file.type || "application/octet-stream",
            dim: await imageDimensions(file),
          },
        },
      ],
      {
        transport: createBlossomMediaTransport({ signer: group.signer }),
        caption: draft.content,
        tags: [["client_nonce", crypto.randomUUID()], ...draft.tags],
        signal: this.#signal,
      },
    );
    this.#prepared.set(prepared.rumor, prepared.intent);
    return prepared.rumor;
  }

  /** Reuse the original source guard; an unknown attachment must be prepared again. */
  intentFor(rumor: Rumor): ReturnType<typeof createApplicationMessageIntent> {
    const prepared = this.#prepared.get(rumor);
    if (prepared) return prepared;
    if (rumor.tags.some((tag) => tag[0] === "imeta"))
      throw new StaleMediaPreparationError();
    return createApplicationMessageIntent(rumor);
  }

  /** Verify a historical or current attachment against its authenticated source state. */
  async download(
    group: AppGroup,
    attachment: HistoricalMediaAttachment,
    rumorId: string,
    signal?: AbortSignal,
  ): Promise<{ data: Uint8Array; mediaType: string }> {
    const sourceParent = await group.session.mediaSourceForRumor(rumorId);
    if (!sourceParent)
      throw new Error("This attachment's source keys are no longer available");
    const transport = createBlossomMediaTransport({ signer: group.signer });
    const combinedSignal = AbortSignal.any([
      this.#signal,
      ...(signal ? [signal] : []),
      AbortSignal.timeout(30_000),
    ]);
    if (attachment.version === "encrypted-media-v1") {
      const source = [group.state, ...group.session.retainedStates()].find(
        (state) => mediaSourceStateToken(state) === sourceParent,
      );
      if (!source)
        throw new Error(
          "This historical attachment's source keys are no longer available",
        );
      const key = await deriveMediaEncryptionKeyV1(
        source,
        group.ciphersuite,
        attachment,
      );
      let lastError: unknown;
      for (const locator of attachment.locators) {
        if (locator.kind !== BLOSSOM_LOCATOR_KIND) continue;
        try {
          const encrypted = await transport.fetch({
            url: locator.value,
            signal: combinedSignal,
            maxBytes: 32 * 1024 * 1024,
          });
          combinedSignal.throwIfAborted();
          return {
            data: decryptMediaFileV1(encrypted, key, attachment),
            mediaType: attachment.mediaType,
          };
        } catch (error) {
          lastError = error;
          combinedSignal.throwIfAborted();
        }
      }
      throw lastError ?? new Error("No available historical media locator");
    }
    const stored = await downloadMediaAttachment(
      group,
      attachment,
      sourceParent,
      {
        transport,
        signal: combinedSignal,
      },
    );
    return { data: stored.data, mediaType: stored.attachment.mediaType };
  }
}

import type { AppGroup } from "@/lib/marmot-client";
import { unixNow } from "@internet-privacy/marmot-ts";
import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import { getEventHash, kinds } from "applesauce-core/helpers";
import { useCallback, useState } from "react";

import { accounts } from "@/lib/accounts";

/**
 * Hook that sends a NIP-25 kind-7 reaction rumor through the MLS group,
 * keeping reactions encrypted and private to group members.
 *
 * @param group - The current MLS group, or null when none is selected
 * @returns `sendReaction` callback and `isSending` / `error` state
 *
 * @example
 * ```tsx
 * const { sendReaction } = useSendReaction(group);
 * await sendReaction(targetRumor.id, targetRumor.pubkey, "👍");
 * ```
 */
export function useSendReaction(group: AppGroup | null) {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendReaction = useCallback(
    async (
      targetId: string,
      targetAuthorPubkey: string,
      emoji: string,
    ): Promise<void> => {
      const account = accounts.active$.value;
      if (!group || !account) return;

      try {
        setIsSending(true);
        setError(null);

        const pubkey = await account.signer.getPublicKey();

        const rumor: Rumor = {
          id: "",
          kind: kinds.Reaction,
          pubkey,
          created_at: unixNow(),
          // "+" is the canonical "like"; pass emoji as-is for all others
          content: emoji === "👍" ? "+" : emoji,
          tags: [
            ["e", targetId],
            ["p", targetAuthorPubkey],
            ["k", String(kinds.ChatMessage)],
          ],
        };

        rumor.id = getEventHash(rumor);

        await group.sendApplicationRumor(rumor);

        // Optimistic save so the reaction shows immediately
        if (group.history) await group.history.saveRumor(rumor);
      } catch (err) {
        console.error("[useSendReaction] Failed to send reaction:", err);
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setIsSending(false);
      }
    },
    [group],
  );

  return { sendReaction, isSending, error };
}

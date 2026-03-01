import type { GroupRumorHistory, MarmotGroup } from "@internet-privacy/marmots";
import { unixNow } from "@internet-privacy/marmots";
import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import { castUser } from "applesauce-common/casts/user";
import { getEventHash } from "applesauce-core/helpers";
import { NutzapBlueprint } from "applesauce-wallet/blueprints";
import { verifyProofsLocked } from "applesauce-wallet/helpers";
import type { Proof } from "@cashu/cashu-ts";
import { getDecodedToken, sumProofs, Wallet } from "@cashu/cashu-ts";
import { useCallback, useState } from "react";

import { accounts, factory } from "@/lib/accounts";
import { eventStore } from "@/lib/nostr";

/**
 * Hook that sends a NIP-61 nutzap as a kind-9321 MLS group rumor, keeping
 * the payment fully private and encrypted to group members.
 *
 * The sender pastes a raw Cashu token string. The hook:
 * 1. Decodes the token with cashu-ts
 * 2. Looks up the recipient's kind:10019 nutzap info from the public EventStore
 *    (the eventLoader attached to the store fetches it from relays if needed)
 * 3. Verifies the token's mint is accepted by the recipient
 * 4. Swaps proofs at the mint P2PK-locked to the recipient's nutzap pubkey
 * 5. Verifies the P2PK lock is correct using applesauce-wallet's verifyProofsLocked
 * 6. Uses NutzapBlueprint + factory.stamp to build a properly-structured kind-9321 rumor
 * 7. Sends it via group.sendApplicationRumor() — fully encrypted inside MLS
 *
 * @param group - The active MLS group, or null
 * @param targetRumorId - The rumor ID of the message being nutzapped
 * @param recipientPubkey - The Nostr pubkey of the message author
 *
 * @example
 * ```tsx
 * const { sendNutzap, isSending, error } = useSendNutzap(group, rumor.id, rumor.pubkey);
 * await sendNutzap(cashuTokenString, "great post!");
 * ```
 */
export function useSendNutzap(
  group: MarmotGroup<GroupRumorHistory> | null,
  targetRumorId: string,
  recipientPubkey: string,
) {
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendNutzap = useCallback(
    async (rawTokenString: string, comment?: string): Promise<void> => {
      const account = accounts.active$.value;
      if (!group || !account) return;

      try {
        setIsSending(true);
        setError(null);

        // 1. Decode the pasted Cashu token
        const inputToken = getDecodedToken(rawTokenString.trim());
        const mintUrl = inputToken.mint;
        if (!mintUrl)
          throw new Error("Could not determine mint URL from token");

        const inputProofs = inputToken.proofs;
        if (!inputProofs || inputProofs.length === 0) {
          throw new Error("Token contains no proofs");
        }

        // 2. Look up recipient's kind:10019 nutzap info.
        // The eventLoader attached to the global eventStore will automatically
        // fetch it from relays if not already cached.
        const recipientUser = castUser(recipientPubkey, eventStore);
        const nutzapInfo = await recipientUser.nutzap$.$first(8_000, undefined);
        if (!nutzapInfo) {
          throw new Error(
            "Recipient has not published nutzap info (kind:10019). They cannot receive nutzaps.",
          );
        }

        // 3. Verify the token's mint is accepted by the recipient
        const acceptedMints = nutzapInfo.mints.map((m) => m.mint);
        const normalizedInputMint = mintUrl.replace(/\/$/, "");
        const mintAccepted = acceptedMints.some(
          (m) => m.replace(/\/$/, "") === normalizedInputMint,
        );
        if (!mintAccepted) {
          throw new Error(
            `Recipient does not accept mint ${mintUrl}. Accepted: ${acceptedMints.join(", ")}`,
          );
        }

        // 4. Get the recipient's P2PK pubkey from the NutzapInfo cast.
        // nutzapInfo.p2pk returns the "02"-prefixed compressed pubkey that
        // cashu-ts asP2PK() expects.
        const p2pkPubkey = nutzapInfo.p2pk;
        if (!p2pkPubkey) {
          throw new Error(
            "Recipient's nutzap info does not include a P2PK pubkey",
          );
        }

        // 5. Ensure proofs are P2PK-locked to the recipient.
        // If the token already passed verifyProofsLocked (e.g. proofs were
        // freshly minted P2PK-locked by the LN tab), skip the swap entirely —
        // we cannot spend someone else's P2PK-locked proofs, and doing so
        // would just waste a mint round-trip.
        let finalProofs: Proof[];
        const alreadyLocked = (() => {
          try {
            verifyProofsLocked(inputProofs, nutzapInfo.event);
            return true;
          } catch {
            return false;
          }
        })();

        if (alreadyLocked) {
          finalProofs = inputProofs;
        } else {
          // Swap unlocked proofs at the mint, P2PK-locking to the recipient
          const totalAmount = sumProofs(inputProofs);
          const cashuWallet = new Wallet(mintUrl, { unit: "sat" });
          await cashuWallet.loadMint();

          const { send } = await cashuWallet.ops
            .send(totalAmount, inputProofs)
            .asP2PK({ pubkey: p2pkPubkey })
            .run();
          finalProofs = send;

          // Confirm the swap produced correctly-locked proofs
          verifyProofsLocked(finalProofs, nutzapInfo.event);
        }

        // 6. Build the token object for the blueprint
        const token = {
          mint: mintUrl,
          proofs: finalProofs,
          unit: "sat" as const,
        };

        // 8. Build a fake target event shaped like the rumor so NutzapBlueprint
        // can set the "e" and "p" tags correctly. The blueprint only reads
        // event.id and event.pubkey from it. We cast as NostrEvent since the
        // blueprint doesn't need the sig field.
        const targetEventShape = {
          id: targetRumorId,
          pubkey: recipientPubkey,
          kind: 9,
          created_at: unixNow(),
          content: "",
          tags: [],
          sig: "",
        };

        // 9. Use NutzapBlueprint + factory.stamp to build the unsigned rumor.
        // factory.create() runs the blueprint operations and returns an
        // EventFactoryTemplate. factory.stamp() attaches the signer's pubkey
        // without signing (producing a valid rumor structure).
        const draft = await factory.create(
          NutzapBlueprint,
          targetEventShape,
          token,
          comment || undefined,
        );
        const stamped = await factory.stamp(draft);

        const rumor: Rumor = {
          ...stamped,
          id: getEventHash(stamped),
        };

        // 10. Send via MLS group (fully encrypted as a rumor)
        await group.sendApplicationRumor(rumor);

        // Optimistic save so the nutzap shows immediately
        if (group.history) await group.history.saveRumor(rumor);
      } catch (err) {
        console.error("[useSendNutzap] Failed to send nutzap:", err);
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        setIsSending(false);
      }
    },
    [group, targetRumorId, recipientPubkey],
  );

  return { sendNutzap, isSending, error };
}

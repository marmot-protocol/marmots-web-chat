import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import { kinds } from "applesauce-core/helpers";
import { useMemo } from "react";

import type { ReactionItem } from "@/components/message-reactions";

/**
 * Derives a map of `messageId → ReactionItem[]` from all rumors in the group
 * history. Kind-7 reaction rumors whose last `e` tag points to a message are
 * collected and grouped by target message id.
 *
 * @param rumors - Full list of all rumors for the group (messages + reactions)
 * @returns A Map keyed by target rumor id, value is the array of reactions.
 *
 * @example
 * ```tsx
 * const reactionsMap = useMessageReactions(messages);
 * const reactions = reactionsMap.get(rumor.id) ?? [];
 * ```
 */
export function useMessageReactions(
  rumors: Rumor[],
): Map<string, ReactionItem[]> {
  return useMemo(() => {
    const map = new Map<string, ReactionItem[]>();

    for (const rumor of rumors) {
      if (rumor.kind !== kinds.Reaction) continue;

      // NIP-25: the last `e` tag is the target event id
      const eTags = rumor.tags.filter((t) => t[0] === "e");
      if (eTags.length === 0) continue;
      const targetId = eTags[eTags.length - 1][1];
      if (!targetId) continue;

      // Normalise content: "+" or empty string → 👍
      const emoji =
        !rumor.content || rumor.content === "+" ? "👍" : rumor.content;

      const existing = map.get(targetId) ?? [];
      existing.push({ emoji, by: rumor.pubkey });
      map.set(targetId, existing);
    }

    return map;
  }, [rumors]);
}

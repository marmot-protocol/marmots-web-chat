import { npubEncode } from "applesauce-core/helpers/pointers";
import { use$ } from "applesauce-react/hooks";

import { eventStore } from "@/lib/nostr";

/** Reactive kind-0 profile for a pubkey (auto-fetched via the store loader). */
export function useProfile(pubkey: string | undefined) {
  return use$(
    () => (pubkey ? eventStore.profile(pubkey) : undefined),
    [pubkey],
  );
}

/** A short, human npub label. */
export function npubShort(pubkey: string): string {
  const npub = npubEncode(pubkey);
  return `${npub.slice(0, 10)}…${npub.slice(-4)}`;
}

/** Best display name for a pubkey, falling back to a short npub. */
export function useDisplayName(pubkey: string | undefined): string {
  const profile = useProfile(pubkey);
  if (!pubkey) return "unknown";
  return profile?.display_name || profile?.name || npubShort(pubkey);
}

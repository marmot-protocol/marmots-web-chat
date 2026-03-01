import { castUser } from "applesauce-common/casts/user";
import { use$ } from "applesauce-react/hooks";
import type { NutzapInfo } from "applesauce-wallet/casts";
import { NUTZAP_INFO_KIND } from "applesauce-wallet/helpers";

import { eventLoader, eventStore } from "@/lib/nostr";

/**
 * Reactively loads and returns a user's NIP-61 nutzap info (kind:10019).
 *
 * Proactively triggers a relay fetch via the global eventLoader so the data
 * is ready before the user clicks the zap button. Returns:
 * - `undefined` while loading (event not yet in the store)
 * - `null` after a fetch attempt where no event was found
 * - `NutzapInfo` cast once the kind:10019 event is in the store
 *
 * The `canReceiveNutzaps` boolean is true only when the info event exists
 * AND includes a P2PK pubkey — the minimum required to lock tokens to.
 *
 * @example
 * ```tsx
 * const { nutzapInfo, canReceiveNutzaps } = useNutzapInfo(pubkey);
 * if (!canReceiveNutzaps) return null; // hide zap button
 * ```
 */
export function useNutzapInfo(pubkey: string): {
  nutzapInfo: NutzapInfo | undefined | null;
  canReceiveNutzaps: boolean;
} {
  // Proactively fetch the kind:10019 event from relays.
  // The eventLoader batches requests and caches results in the eventStore.
  use$(
    () =>
      eventLoader({
        kind: NUTZAP_INFO_KIND,
        pubkey,
      }),
    [pubkey],
  );

  // Subscribe reactively — updates automatically if the event arrives later.
  // castUser(...).nutzap$ uses the eventStore's replaceable() subscription
  // which the eventLoader populates.
  const nutzapInfo = use$(() => castUser(pubkey, eventStore).nutzap$, [pubkey]);

  const canReceiveNutzaps = !!(nutzapInfo && nutzapInfo.p2pk);

  return { nutzapInfo, canReceiveNutzaps };
}

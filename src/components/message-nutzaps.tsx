import { IconBolt } from "@tabler/icons-react";

import { UserName } from "@/components/nostr-user";

export interface NutzapItem {
  /** Nostr pubkey of the sender */
  senderPubkey: string;
  /** Total amount in sats */
  amount: number;
  /** Optional comment from the nutzap content */
  comment?: string;
}

interface MessageNutzapsProps {
  nutzaps: NutzapItem[];
}

/**
 * Displays aggregated nutzaps received on a chat message as inline badges.
 * Each badge shows the amount and the sender's display name.
 */
export function MessageNutzaps({ nutzaps }: MessageNutzapsProps) {
  if (nutzaps.length === 0) return null;

  const totalAmount = nutzaps.reduce((sum, z) => sum + z.amount, 0);

  return (
    <div className="flex flex-wrap items-center gap-1 mt-0.5">
      {/* Total aggregate badge */}
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-xs font-medium border border-yellow-500/20">
        <IconBolt className="w-3 h-3" />
        {totalAmount} sat
      </span>

      {/* Per-sender details */}
      {nutzaps.map((z, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-xs"
          title={z.comment || undefined}
        >
          <IconBolt className="w-3 h-3 text-yellow-500" />
          {z.amount} sat{" "}
          <span className="text-foreground/70">
            <UserName pubkey={z.senderPubkey} />
          </span>
        </span>
      ))}
    </div>
  );
}

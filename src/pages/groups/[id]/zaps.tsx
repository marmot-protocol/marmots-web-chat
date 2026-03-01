import type { GroupRumorHistory, MarmotGroup } from "@internet-privacy/marmots";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { use$ } from "applesauce-react/hooks";
import {
  NUTZAP_KIND,
  getNutzapAmount,
  getNutzapComment,
  getNutzapMint,
  getNutzapProofs,
  isValidNutzap,
} from "applesauce-wallet/helpers";
import { getEncodedToken } from "@cashu/cashu-ts";
import { IconBolt, IconCopy, IconCheck, IconFilter } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { useOutletContext } from "react-router";

import { UserAvatar, UserName } from "@/components/nostr-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useGroupEventStore } from "@/contexts/group-event-store-context";
import { accounts } from "@/lib/accounts";

// ============================================================================
// Types
// ============================================================================

interface GroupOutletContext {
  group: MarmotGroup<GroupRumorHistory>;
}

type FilterMode = "all" | "received";

// ============================================================================
// Component: CopyTokenButton
// ============================================================================

interface CopyTokenButtonProps {
  event: NostrEvent;
}

/** Encodes the nutzap proofs back into a Cashu token string and copies it. */
function CopyTokenButton({ event }: CopyTokenButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const proofs = getNutzapProofs(event);
      const mint = getNutzapMint(event);
      if (!mint || proofs.length === 0) return;

      const tokenString = getEncodedToken({ mint, proofs });
      await navigator.clipboard.writeText(tokenString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy token:", err);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="gap-1.5 shrink-0"
    >
      {copied ? (
        <>
          <IconCheck className="w-3.5 h-3.5 text-green-500" />
          Copied
        </>
      ) : (
        <>
          <IconCopy className="w-3.5 h-3.5" />
          Copy token
        </>
      )}
    </Button>
  );
}

// ============================================================================
// Component: NutzapRow
// ============================================================================

interface NutzapRowProps {
  event: NostrEvent;
  isReceived: boolean;
}

function NutzapRow({ event, isReceived }: NutzapRowProps) {
  const amount = getNutzapAmount(event);
  const mint = getNutzapMint(event);
  const comment = getNutzapComment(event);

  const date = new Date(event.created_at * 1000);
  const formattedDate = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const formattedTime = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  const mintHost = useMemo(() => {
    try {
      return new URL(mint ?? "").hostname;
    } catch {
      return mint ?? "unknown mint";
    }
  }, [mint]);

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
      {/* Sender avatar */}
      <UserAvatar pubkey={event.pubkey} size="sm" />

      {/* Main content */}
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        {/* Header row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-sm">
            <UserName pubkey={event.pubkey} />
          </span>
          <span className="text-xs text-muted-foreground">
            {formattedDate} {formattedTime}
          </span>
          {isReceived && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              received
            </Badge>
          )}
        </div>

        {/* Amount + mint */}
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-0.5 text-yellow-600 dark:text-yellow-400 font-semibold">
            <IconBolt className="w-4 h-4" />
            {amount} sat
          </span>
          <span className="text-xs text-muted-foreground">
            via <span className="font-mono">{mintHost}</span>
          </span>
        </div>

        {/* Optional comment */}
        {comment && (
          <p className="text-sm text-muted-foreground italic">
            &ldquo;{comment}&rdquo;
          </p>
        )}
      </div>

      {/* Copy token button — only shown for nutzaps addressed to us */}
      {isReceived && <CopyTokenButton event={event} />}
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function GroupZapsPage() {
  useOutletContext<GroupOutletContext>();

  const account = use$(accounts.active$);
  const groupEventStore = useGroupEventStore();
  const [filter, setFilter] = useState<FilterMode>("all");

  // Reactive nutzap events from the private group store
  const allNutzapEvents = use$(
    () => groupEventStore.timeline({ kinds: [NUTZAP_KIND] }),
    [groupEventStore],
  );

  const myPubkey = account?.pubkey;

  // Validated nutzaps, sorted newest first
  const nutzaps = useMemo(() => {
    const events = allNutzapEvents ?? [];
    return events.filter(isValidNutzap);
  }, [allNutzapEvents]);

  // Filtered view
  const filteredNutzaps = useMemo(() => {
    if (filter === "received" && myPubkey) {
      return nutzaps.filter((e) => {
        const pTag = e.tags.find((t) => t[0] === "p");
        return pTag?.[1] === myPubkey;
      });
    }
    return nutzaps;
  }, [nutzaps, filter, myPubkey]);

  // Stats
  const totalReceived = useMemo(() => {
    if (!myPubkey) return 0;
    return nutzaps
      .filter((e) => {
        const pTag = e.tags.find((t) => t[0] === "p");
        return pTag?.[1] === myPubkey;
      })
      .reduce((sum, e) => sum + (getNutzapAmount(e) ?? 0), 0);
  }, [nutzaps, myPubkey]);

  const totalSent = useMemo(() => {
    if (!myPubkey) return 0;
    return nutzaps
      .filter((e) => e.pubkey === myPubkey)
      .reduce((sum, e) => sum + (getNutzapAmount(e) ?? 0), 0);
  }, [nutzaps, myPubkey]);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border bg-card p-3 flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">
            Received
          </span>
          <span className="text-2xl font-bold inline-flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
            <IconBolt className="w-5 h-5" />
            {totalReceived}
          </span>
          <span className="text-xs text-muted-foreground">sats</span>
        </div>
        <div className="rounded-lg border bg-card p-3 flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">
            Sent
          </span>
          <span className="text-2xl font-bold inline-flex items-center gap-1 text-muted-foreground">
            <IconBolt className="w-5 h-5" />
            {totalSent}
          </span>
          <span className="text-xs text-muted-foreground">sats</span>
        </div>
      </div>

      {/* Filter controls */}
      <div className="flex items-center gap-2">
        <IconFilter className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex gap-1">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
          >
            All ({nutzaps.length})
          </Button>
          <Button
            variant={filter === "received" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("received")}
          >
            Received (
            {myPubkey
              ? nutzaps.filter((e) => {
                  const pTag = e.tags.find((t) => t[0] === "p");
                  return pTag?.[1] === myPubkey;
                }).length
              : 0}
            )
          </Button>
        </div>
      </div>

      {/* Nutzap list */}
      {filteredNutzaps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <IconBolt className="w-10 h-10 opacity-30" />
          <p className="text-sm">
            {filter === "received"
              ? "You haven't received any nutzaps in this group yet."
              : "No nutzaps in this group yet."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredNutzaps.map((event) => {
            const pTag = event.tags.find((t) => t[0] === "p");
            const isReceived = pTag?.[1] === myPubkey;
            return (
              <NutzapRow key={event.id} event={event} isReceived={isReceived} />
            );
          })}
        </div>
      )}
    </div>
  );
}

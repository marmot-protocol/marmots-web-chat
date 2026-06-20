import { use$ } from "applesauce-react/hooks";
import { ExternalLink } from "lucide-react";

import { UserBadge } from "@/components/nostr-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { eventStore } from "@/lib/nostr";
import { AddressPointer, EventPointer } from "applesauce-core/helpers";

interface EventCardProps {
  pointer?: string | EventPointer | AddressPointer;
  author?: string;
  kind?: number;
  identifier?: string;
  encoded: string;
}

/**
 * Event kind to human-readable name mapping
 */
const EVENT_KIND_NAMES: Record<number, string> = {
  0: "Profile",
  1: "Note",
  3: "Contacts",
  4: "Encrypted Message",
  5: "Deletion",
  6: "Repost",
  7: "Reaction",
  9: "Group Chat Message",
  10: "Group Thread",
  11: "Group Thread Reply",
  40: "Channel Creation",
  41: "Channel Metadata",
  42: "Channel Message",
  43: "Channel Hide Message",
  44: "Channel Mute User",
  1063: "File Metadata",
  1984: "Reporting",
  9734: "Zap Request",
  9735: "Zap",
  10000: "Mute List",
  10001: "Pin List",
  10002: "Relay List Metadata",
  30000: "People List",
  30001: "Bookmarks",
  30008: "Profile Badges",
  30009: "Badge Definition",
  30017: "Create or Update Stall",
  30018: "Create or Update Product",
  30023: "Long-form Content",
  30078: "Application-specific Data",
  30311: "Live Event",
  30315: "User Status",
  31989: "Application Handler",
  31990: "Application Handler Information",
};

/**
 * Get event kind display name
 */
function getKindName(kind: number): string {
  return EVENT_KIND_NAMES[kind] || `Kind ${kind}`;
}

/**
 * Renders an inline event card with preview
 * Shows event kind, alt tag, author, and link to njump
 */
export function EventCard({ pointer, identifier, encoded }: EventCardProps) {
  // Load event from event store if we have an ID
  const event = use$(() => {
    if (!pointer) return undefined;
    return eventStore.event(pointer);
  }, [pointer]);

  // Use loaded event data if available, otherwise use props
  const actualKind = event?.kind;
  const actualAuthor = event?.pubkey;
  const altTag = event?.tags.find((t) => t[0] === "alt")?.[1];

  // Generate njump URL
  const njumpUrl = `https://njump.to/${encoded}`;

  // Determine what to show
  let preview: string | undefined;
  if (altTag) {
    preview = altTag;
  } else if (event?.content && actualKind === 1) {
    // For kind 1 notes, show truncated content
    preview =
      event.content.slice(0, 100) + (event.content.length > 100 ? "..." : "");
  }

  return (
    <Card className="my-2 max-w-md">
      <CardContent className="space-y-2">
        {/* Event kind badge */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {actualKind !== undefined ? getKindName(actualKind) : "Event"}
          </span>
          {identifier && (
            <span
              className="text-xs text-muted-foreground"
              title="Addressable event identifier"
            >
              {identifier}
            </span>
          )}
        </div>

        {/* Preview text */}
        {preview && (
          <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-3">
            {preview}
          </p>
        )}

        {/* Author badge */}
        {actualAuthor && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">by</span>
            <UserBadge pubkey={actualAuthor} size="sm" />
          </div>
        )}

        {/* Link to njump */}
        <Button variant="outline" size="sm" className="w-full" asChild>
          <a href={njumpUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3 w-3 mr-2" />
            View on njump
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

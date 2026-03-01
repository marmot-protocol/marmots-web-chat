import { SmilePlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { use$ } from "applesauce-react/hooks";

import { UserName } from "@/components/nostr-user";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { accounts } from "@/lib/accounts";

const DEFAULT_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

export interface ReactionItem {
  emoji: string;
  by: string;
}

interface MessageReactionsProps {
  rumorId: string;
  reactions: ReactionItem[];
  onAddReaction: (emoji: string) => void;
}

/** Groups reactions by emoji, returning sorted array of { emoji, count, byMe, reactors } */
function groupReactions(
  reactions: ReactionItem[],
  myPubkey: string | undefined,
) {
  const map = new Map<
    string,
    { count: number; byMe: boolean; reactors: string[] }
  >();
  for (const r of reactions) {
    const existing = map.get(r.emoji) ?? {
      count: 0,
      byMe: false,
      reactors: [],
    };
    map.set(r.emoji, {
      count: existing.count + 1,
      byMe: existing.byMe || r.by === myPubkey,
      reactors: [...existing.reactors, r.by],
    });
  }
  return Array.from(map.entries()).map(
    ([emoji, { count, byMe, reactors }]) => ({
      emoji,
      count,
      byMe,
      reactors,
    }),
  );
}

export function MessageReactions({
  rumorId,
  reactions,
  onAddReaction,
}: MessageReactionsProps) {
  const account = use$(accounts.active$);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pickerOpen]);

  const handleSelect = useCallback(
    (emoji: string) => {
      setPickerOpen(false);
      onAddReaction(emoji);
    },
    [onAddReaction],
  );

  const grouped = groupReactions(reactions, account?.pubkey);

  return (
    <div className="flex items-center gap-1 flex-wrap" data-rumor-id={rumorId}>
      {grouped.map(({ emoji, count, byMe, reactors }) => (
        <Popover key={emoji}>
          <PopoverTrigger asChild>
            <button
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors ${
                byMe
                  ? "bg-primary/15 border-primary/40 text-foreground"
                  : "bg-muted border-transparent text-foreground hover:border-border"
              }`}
            >
              <span>{emoji}</span>
              <span className="text-muted-foreground">{count}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-2 flex flex-col gap-1"
            side="top"
            align="start"
          >
            <p className="text-xs text-muted-foreground mb-1">
              Reacted with {emoji}
            </p>
            {reactors.map((pubkey) => (
              <div key={pubkey} className="text-sm font-medium">
                <UserName pubkey={pubkey} />
              </div>
            ))}
            <button
              onClick={() => onAddReaction(emoji)}
              className="mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors text-left"
            >
              {byMe ? "Remove your reaction" : "React with " + emoji}
            </button>
          </PopoverContent>
        </Popover>
      ))}

      <div className="relative">
        <button
          ref={buttonRef}
          onClick={() => setPickerOpen((o) => !o)}
          className="flex items-center justify-center w-6 h-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Add reaction"
          title="Add reaction"
        >
          <SmilePlus className="w-3.5 h-3.5" />
        </button>

        {pickerOpen && (
          <div
            ref={pickerRef}
            className="absolute bottom-full mb-1 left-0 z-50 flex gap-1 p-1.5 rounded-lg bg-popover border shadow-md"
          >
            {DEFAULT_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleSelect(emoji)}
                className="w-8 h-8 flex items-center justify-center rounded-md text-lg hover:bg-muted transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

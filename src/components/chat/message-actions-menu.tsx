import { useState } from "react";
import type { ReactNode } from "react";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { Copy, Reply } from "lucide-react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useController } from "@/hooks/use-marmot";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLongPress } from "@/hooks/use-long-press";
import type { ReplyTarget } from "./types";

const QUICK_EMOJI = ["👍", "❤️", "😂", "🎉", "🙏", "🔥"];

/**
 * Wraps a message bubble with its action menu. On desktop the menu opens on
 * right-click (context menu); on mobile it opens on long-press as a bottom
 * drawer with large touch targets. Both expose the same actions.
 */
export function MessageActionsMenu({
  groupId,
  message,
  onReply,
  children,
}: {
  groupId: string;
  message: NostrEvent;
  onReply: (target: ReplyTarget) => void;
  children: ReactNode;
}) {
  const controller = useController();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const longPress = useLongPress(() => setOpen(true));

  const react = (emoji: string) =>
    controller?.sendReaction(
      groupId,
      { id: message.id, pubkey: message.pubkey },
      emoji,
    );

  const reply = () =>
    onReply({
      id: message.id,
      pubkey: message.pubkey,
      content: message.content,
    });

  const copy = () => void navigator.clipboard?.writeText(message.content);

  if (isMobile) {
    return (
      <>
        <div {...longPress} className="select-none touch-pan-y">
          {children}
        </div>
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent>
            <DrawerHeader className="sr-only">
              <DrawerTitle>Message actions</DrawerTitle>
            </DrawerHeader>
            <div className="flex justify-around px-4 py-3">
              {QUICK_EMOJI.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    react(emoji);
                    setOpen(false);
                  }}
                  className="rounded-full p-2 text-2xl hover:bg-accent active:scale-110 transition-transform"
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div className="flex flex-col px-2 pb-6">
              <button
                onClick={() => {
                  reply();
                  setOpen(false);
                }}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm hover:bg-accent"
              >
                <Reply className="size-5" /> Reply
              </button>
              <button
                onClick={() => {
                  copy();
                  setOpen(false);
                }}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm hover:bg-accent"
              >
                <Copy className="size-5" /> Copy text
              </button>
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <div className="flex justify-between gap-0.5 p-1">
          {QUICK_EMOJI.map((emoji) => (
            <ContextMenuItem
              key={emoji}
              onSelect={() => react(emoji)}
              className="justify-center p-1.5 text-base"
            >
              {emoji}
            </ContextMenuItem>
          ))}
        </div>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={reply}>
          <Reply className="size-4" /> Reply
        </ContextMenuItem>
        <ContextMenuItem onSelect={copy}>
          <Copy className="size-4" /> Copy text
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

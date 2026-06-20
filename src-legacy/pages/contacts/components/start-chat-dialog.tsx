/**
 * Invite modal and hook for starting a secure 1:1 chat with a contact.
 * Creates a group, invites by key package, and navigates to the new group.
 *
 * Exports: `useStartChat`, `StartChatDialog`, `StartChatStep`, `UseStartChatReturn`
 */

import { getDisplayName } from "applesauce-core/helpers";
import type { NostrEvent } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { IconCircleCheck, IconLoader2, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import { UserAvatar, UserName } from "@/components/nostr-user";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import accounts from "@/lib/accounts";
import { marmotClient$ } from "@/lib/marmot-client";
import { eventStore } from "@/lib/nostr";
import { extraRelays$ } from "@/lib/settings";
import type { User } from "applesauce-common/casts/user";

export type StartChatStep =
  | { status: "creating" }
  | { status: "inviting" }
  | { status: "done" }
  | { status: "error"; message: string };

export interface UseStartChatReturn {
  /** Whether a group creation is currently in flight. */
  isCreating: boolean;
  /** Whether the progress dialog is open. */
  dialogOpen: boolean;
  /** Pubkey of the contact being chatted with. */
  dialogContact: string | null;
  /** Current step in the creation flow. */
  dialogStep: StartChatStep | null;
  /** Call this when the user taps "Start chat" on a contact. */
  startChat: (user: User, keyPackageEvent: NostrEvent) => Promise<void>;
  /** Call this to dismiss the error state and reset. */
  dismissError: () => void;
}

/**
 * Owns all state and async logic for creating a 1:1 group and immediately
 * inviting a contact. Pair with `StartChatDialog` to show progress.
 *
 * @example
 * ```tsx
 * const chat = useStartChat();
 * // pass chat.startChat to OnlineContactCard / OnlineContactListItem
 * // render <StartChatDialog {...chat} /> somewhere in the tree
 * ```
 */
export function useStartChat(): UseStartChatReturn {
  const client = use$(marmotClient$);
  const extraRelays = use$(extraRelays$);
  const navigate = useNavigate();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogContact, setDialogContact] = useState<string | null>(null);
  const [dialogStep, setDialogStep] = useState<StartChatStep | null>(null);

  async function startChat(user: User, keyPackageEvent: NostrEvent) {
    if (!client) return;

    setDialogContact(user.pubkey);
    setDialogOpen(true);
    setDialogStep({ status: "creating" });

    try {
      const acc = accounts.active;
      if (!acc) throw new Error("No active account");

      const profile = eventStore.getReplaceable(0, user.pubkey);
      const contactName = getDisplayName(profile, user.npub.slice(0, 12));

      const group = await client.groups.create(contactName, {
        adminPubkeys: [acc.pubkey],
        relays: extraRelays ?? [],
        ciphersuite: "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519",
      });

      setDialogStep({ status: "inviting" });
      await group.inviteByKeyPackageEvent(keyPackageEvent);

      setDialogStep({ status: "done" });
      // Brief pause so the user sees all steps complete before navigating
      await new Promise((r) => setTimeout(r, 600));

      navigate(`/groups/${group.idStr}`);
    } catch (err) {
      setDialogStep({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function dismissError() {
    setDialogOpen(false);
    setDialogStep(null);
    setDialogContact(null);
  }

  return {
    isCreating: dialogOpen,
    dialogOpen,
    dialogContact,
    dialogStep,
    startChat,
    dismissError,
  };
}

function StepRow({
  label,
  state,
}: {
  label: string;
  state: "pending" | "active" | "done" | "error";
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-5 shrink-0 flex justify-center">
        {state === "active" && (
          <IconLoader2 className="h-4 w-4 animate-spin text-primary" />
        )}
        {state === "done" && (
          <IconCircleCheck className="h-4 w-4 text-green-500" />
        )}
        {state === "error" && <IconX className="h-4 w-4 text-destructive" />}
        {state === "pending" && (
          <span className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 inline-block" />
        )}
      </div>
      <span
        className={
          state === "pending"
            ? "text-muted-foreground"
            : state === "error"
              ? "text-destructive"
              : "text-foreground"
        }
      >
        {label}
      </span>
    </div>
  );
}

/**
 * Modal dialog that shows live step-by-step progress while a 1:1 group is
 * being created and the contact is being invited.
 *
 * Pair with `useStartChat` — spread its return value directly as props:
 * ```tsx
 * <StartChatDialog {...chat} />
 * ```
 */
export function StartChatDialog({
  dialogOpen,
  dialogContact,
  dialogStep,
  dismissError,
}: Pick<
  UseStartChatReturn,
  "dialogOpen" | "dialogContact" | "dialogStep" | "dismissError"
>) {
  const isError = dialogStep?.status === "error";

  return (
    <Dialog open={dialogOpen} onOpenChange={isError ? dismissError : undefined}>
      <DialogContent
        className="max-w-sm"
        onInteractOutside={isError ? undefined : (e) => e.preventDefault()}
        onEscapeKeyDown={isError ? undefined : (e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isError ? (
              <>
                <IconX className="h-5 w-5 text-destructive" />
                Something went wrong
              </>
            ) : (
              <>
                {dialogStep?.status === "done" ? (
                  <IconCircleCheck className="h-5 w-5 text-green-500" />
                ) : (
                  <IconLoader2 className="h-5 w-5 animate-spin text-primary" />
                )}
                Starting secure chat…
              </>
            )}
          </DialogTitle>
          {dialogContact && (
            <DialogDescription className="flex items-center gap-2 pt-1">
              <UserAvatar pubkey={dialogContact} size="sm" />
              <UserName pubkey={dialogContact} />
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-3 py-2">
          {isError ? (
            <p className="text-sm text-destructive">
              {(dialogStep as { status: "error"; message: string }).message}
            </p>
          ) : (
            <>
              <StepRow
                label="Creating encrypted group"
                state={
                  dialogStep?.status === "creating"
                    ? "active"
                    : dialogStep?.status === "inviting" ||
                        dialogStep?.status === "done"
                      ? "done"
                      : "pending"
                }
              />
              <StepRow
                label="Sending invite to contact"
                state={
                  dialogStep?.status === "inviting"
                    ? "active"
                    : dialogStep?.status === "done"
                      ? "done"
                      : "pending"
                }
              />
              <StepRow
                label="Opening chat"
                state={dialogStep?.status === "done" ? "active" : "pending"}
              />
            </>
          )}
        </div>

        {isError && (
          <Button variant="outline" onClick={dismissError} className="w-full">
            Dismiss
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

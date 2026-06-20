import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserName } from "@/components/user";
import { useController, useWatchedInvites } from "@/hooks/use-marmot";
import type { InviteEntry, MarmotController } from "@/lib/marmot/controller";

type Preview = Awaited<ReturnType<MarmotController["previewInvite"]>>;

function useInviteName(entry: InviteEntry): string | null {
  const controller = useController();
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    controller
      ?.previewInvite(entry.invite)
      .then((p) => active && setName(p.group?.name ?? null))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [controller, entry.invite]);
  return name;
}

function InviteDetailsDialog({
  entry,
  open,
  onOpenChange,
  onJoin,
}: {
  entry: InviteEntry;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onJoin: () => void;
}) {
  const controller = useController();
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setPreview(null);
    controller
      ?.previewInvite(entry.invite)
      .then((p) => active && setPreview(p))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [open, controller, entry.invite]);

  const group = preview?.group;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{group?.name ?? "Group invite"}</DialogTitle>
          <DialogDescription>
            Invited by <UserName pubkey={entry.invite.pubkey} />
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          {group?.description && <p>{group.description}</p>}
          {!preview && <p className="text-muted-foreground">Decrypting preview…</p>}
          {preview && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {group?.relays && group.relays.length > 0 && (
                <>
                  <dt className="text-muted-foreground">Relays</dt>
                  <dd className="break-all">{group.relays.join(", ")}</dd>
                </>
              )}
              {preview.recipientCount !== undefined && (
                <>
                  <dt className="text-muted-foreground">Recipients</dt>
                  <dd>{preview.recipientCount}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Joinable</dt>
              <dd>{entry.joinable ? "yes" : "key package rotated"}</dd>
            </dl>
          )}
        </div>
        <DialogFooter className="justify-between sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => {
              controller?.dismissInvite(entry.invite.id);
              onOpenChange(false);
            }}
          >
            Dismiss
          </Button>
          <Button disabled={!entry.joinable} onClick={onJoin}>
            Join group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteRow({ entry }: { entry: InviteEntry }) {
  const controller = useController();
  const navigate = useNavigate();
  const name = useInviteName(entry);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState(false);

  const join = async () => {
    if (!controller) return;
    setBusy(true);
    const id = await controller.joinInvite(entry.invite.id);
    setBusy(false);
    setDetails(false);
    if (id) navigate(`/groups/${id}`);
  };

  return (
    <div className="rounded-md border p-2 text-sm">
      <button
        className="w-full text-left"
        onClick={() => setDetails(true)}
        title="Inspect invite"
      >
        <div className="truncate font-medium">{name ?? "Encrypted group invite"}</div>
        <div className="truncate text-xs text-muted-foreground">
          from <UserName pubkey={entry.invite.pubkey} />
        </div>
      </button>
      <div className="mt-2 flex gap-2">
        <Button size="sm" disabled={!entry.joinable || busy} onClick={() => void join()}>
          {busy ? "Joining…" : entry.joinable ? "Join" : "Rotated"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDetails(true)}>
          Inspect
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => controller?.dismissInvite(entry.invite.id)}
        >
          Dismiss
        </Button>
      </div>
      <InviteDetailsDialog
        entry={entry}
        open={details}
        onOpenChange={setDetails}
        onJoin={() => void join()}
      />
    </div>
  );
}

export function InvitesPanel() {
  const invites = useWatchedInvites();
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? invites : invites.filter((i) => i.joinable);
  const hiddenCount = invites.length - visible.length;

  if (invites.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-2">
      <div className="flex items-center justify-between px-1">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
          <Inbox className="size-3.5" /> Invites ({visible.length})
        </span>
        {(showAll || hiddenCount > 0) && (
          <button
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => setShowAll((s) => !s)}
          >
            {showAll ? "Joinable only" : `Show all (${invites.length})`}
          </button>
        )}
      </div>
      {visible.map((entry) => (
        <InviteRow key={entry.invite.id} entry={entry} />
      ))}
    </div>
  );
}

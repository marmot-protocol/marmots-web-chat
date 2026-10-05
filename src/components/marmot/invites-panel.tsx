import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { IconUsers } from "@tabler/icons-react";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserAvatar, UserName } from "@/components/user";
import { useController, useWatchedInvites } from "@/hooks/use-marmot";
import type { InviteEntry, MarmotController } from "@/lib/marmot/controller";

type Preview = Awaited<ReturnType<MarmotController["previewInvite"]>>;

function useInvitePreview(entry: InviteEntry): Preview | null {
  const controller = useController();
  const [preview, setPreview] = useState<Preview | null>(null);
  useEffect(() => {
    let active = true;
    setPreview(null);
    controller
      ?.previewInvite(entry.invite)
      .then((value) => {
        if (active) setPreview(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [controller, entry.invite]);
  return preview;
}

function InviteDetailsDialog({
  entry,
  open,
  onOpenChange,
  onJoin,
  onDismiss,
  busy,
  preview,
}: {
  entry: InviteEntry;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onJoin: () => void;
  onDismiss: () => void;
  busy: boolean;
  preview: Preview | null;
}) {
  const group = preview?.group;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col">
        <DialogHeader>
          <DialogTitle>Invite details</DialogTitle>
          <DialogDescription>
            Invited by <UserName pubkey={entry.invite.pubkey} />
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto text-sm">
          {group?.description && <p>{group.description}</p>}
          {!preview && (
            <p className="text-muted-foreground">Decrypting preview…</p>
          )}
          {preview && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {preview.relays.length > 0 && (
                <>
                  <dt className="text-muted-foreground">Relays</dt>
                  <dd className="break-all">{preview.relays.join(", ")}</dd>
                </>
              )}
              {preview.recipientCount !== undefined && (
                <>
                  <dt className="text-muted-foreground">Recipients</dt>
                  <dd>{preview.recipientCount}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                {entry.joinable ? "Acceptable" : "Key package unavailable"}
              </dd>
              {preview.epoch !== undefined && (
                <>
                  <dt className="text-muted-foreground">Epoch</dt>
                  <dd>{String(preview.epoch)}</dd>
                </>
              )}
              {preview.cipherSuite !== undefined && (
                <>
                  <dt className="text-muted-foreground">Cipher suite</dt>
                  <dd>{preview.cipherSuite}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Invite ID</dt>
              <dd className="break-all">{entry.invite.id}</dd>
              <dt className="text-muted-foreground">Inviter public key</dt>
              <dd className="break-all">{entry.invite.pubkey}</dd>
              {preview.keyPackageEventId && (
                <>
                  <dt className="text-muted-foreground">Key package event</dt>
                  <dd className="break-all">{preview.keyPackageEventId}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Created</dt>
              <dd>
                {new Date(entry.invite.created_at * 1000).toLocaleString()}
              </dd>
              {group?.adminPubkeys.length ? (
                <>
                  <dt className="text-muted-foreground">Admins</dt>
                  <dd className="flex flex-col gap-1">
                    {group.adminPubkeys.map((pubkey) => (
                      <span key={pubkey} className="break-all">
                        {pubkey}
                      </span>
                    ))}
                  </dd>
                </>
              ) : null}
            </dl>
          )}
        </div>
        <DialogFooter className="justify-between sm:justify-between">
          <Button variant="ghost" disabled={busy} onClick={onDismiss}>
            Dismiss
          </Button>
          <Button disabled={!entry.joinable || busy} onClick={onJoin}>
            {busy ? "Accepting…" : "Accept invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteRow({ entry }: { entry: InviteEntry }) {
  const controller = useController();
  const navigate = useNavigate();
  const preview = useInvitePreview(entry);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState(false);

  const join = async () => {
    if (!controller || busy) return;
    setBusy(true);
    try {
      const id = await controller.joinInvite(entry.invite.id);
      if (id) {
        setDetails(false);
        navigate(`/groups/${id}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async () => {
    if (!controller || busy) return;
    setBusy(true);
    try {
      await controller.dismissInvite(entry.invite.id);
      setDetails(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <IconUsers className="size-8 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <CardTitle>
              <h2 className="break-words">
                {preview?.group?.name ||
                  (preview ? "Encrypted group invite" : "Loading group name…")}
              </h2>
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              <UserAvatar pubkey={entry.invite.pubkey} size={24} />
              <span className="min-w-0">
                Invited by <UserName pubkey={entry.invite.pubkey} />
              </span>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {entry.joinable ? (
          <p className="text-sm text-muted-foreground">
            You’ve been invited to join this group.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            This invite can no longer be accepted because its key package is
            unavailable. Ask the sender for a new invite.
          </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!controller || !entry.joinable || busy}
          onClick={() => void join()}
        >
          {busy ? "Working…" : "Accept invite"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void dismiss()}
        >
          Dismiss
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => setDetails(true)}
        >
          Details
        </Button>
      </CardFooter>
      <InviteDetailsDialog
        entry={entry}
        open={details}
        onOpenChange={setDetails}
        onJoin={() => void join()}
        onDismiss={() => void dismiss()}
        busy={busy}
        preview={preview}
      />
    </Card>
  );
}

/** Acceptable unread invites, with an option to include unavailable invites. */
export function InvitesPanel({
  showUnavailable = false,
}: {
  showUnavailable?: boolean;
}) {
  const invites = useWatchedInvites();
  const visible = showUnavailable
    ? invites
    : invites.filter((entry) => entry.joinable);

  if (invites.length === 0) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        No pending invites.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {visible.length === 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          No acceptable invites.
        </p>
      )}
      {visible.map((entry) => (
        <InviteRow key={entry.invite.id} entry={entry} />
      ))}
    </div>
  );
}

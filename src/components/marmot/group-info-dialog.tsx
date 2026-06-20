import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { getGroupMembers } from "@internet-privacy/marmot-ts";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/copy-button";
import { Jdenticon } from "@/components/jdenticon";
import { useChat, useController } from "@/hooks/use-marmot";

/**
 * Group info modal (opened by clicking the chat title), mirroring the opentui
 * example: shows the group's name, description, epoch and member count, and —
 * for admins — lets them edit the info or leave the group.
 */
export function GroupInfoDialog({
  groupId,
  open,
  onOpenChange,
}: {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const controller = useController();
  const navigate = useNavigate();
  const snapshot = useChat();
  const me = snapshot?.me.pubkey;
  const busy = snapshot?.busy ?? false;
  const group = controller?.getGroup(groupId);
  const isAdmin = me ? (group?.groupData?.adminPubkeys ?? []).includes(me) : false;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open && group) {
      setName(group.groupData?.name ?? "");
      setDescription(group.groupData?.description ?? "");
    }
  }, [open, group]);

  // Re-derived whenever the snapshot bumps (stateChanged).
  const memberCount = useMemo(
    () => (group ? new Set(getGroupMembers(group.state)).size : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [group, snapshot],
  );
  const epoch = group ? Number(group.state.groupContext.epoch) : 0;

  if (!group) return null;

  const save = async () => {
    if (!controller) return;
    await controller.updateGroupInfo(groupId, { name, description });
    onOpenChange(false);
  };

  const leave = async () => {
    if (!controller) return;
    await controller.leave(groupId);
    onOpenChange(false);
    navigate("/groups");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Group info</DialogTitle>
          <DialogDescription>
            {isAdmin
              ? "Edit this group's info or leave."
              : "Only admins can edit this group's info."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="size-12 shrink-0 overflow-hidden rounded-md bg-muted">
              <Jdenticon value={group.idStr} size={48} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">
                {group.groupData?.name || group.idStr.slice(0, 8)}
              </div>
              <div className="text-xs text-muted-foreground">
                epoch {epoch} · {memberCount} member{memberCount === 1 ? "" : "s"}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Group ID</Label>
            <div className="flex items-center gap-2 rounded-md bg-muted p-2">
              <code className="min-w-0 flex-1 truncate text-xs">{group.idStr}</code>
              <CopyButton text={group.idStr} variant="ghost" size="icon" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gi-name">Name</Label>
            <Input
              id="gi-name"
              value={name}
              disabled={!isAdmin}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gi-desc">Description</Label>
            <Textarea
              id="gi-desc"
              value={description}
              disabled={!isAdmin}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="justify-between sm:justify-between">
          <Button variant="destructive" disabled={busy} onClick={() => void leave()}>
            {busy ? "Working…" : "Leave group"}
          </Button>
          {isAdmin && (
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

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
import { useChat, useController } from "@/hooks/use-marmot";

export function GroupSettingsDialog({
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Group settings</DialogTitle>
          <DialogDescription>
            {isAdmin ? "Edit group info or leave." : "You are not an admin of this group."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="gs-name">Name</Label>
            <Input
              id="gs-name"
              value={name}
              disabled={!isAdmin}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gs-desc">Description</Label>
            <Textarea
              id="gs-desc"
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

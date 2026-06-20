import { useState } from "react";
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
import { useController } from "@/hooks/use-marmot";

export function NewGroupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const controller = useController();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [relays, setRelays] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!controller || !name.trim()) return;
    setBusy(true);
    const relayList = relays
      .split(/[\s,]+/)
      .map((r) => r.trim())
      .filter(Boolean);
    const id = await controller.createGroup(name.trim(), {
      description: description.trim() || undefined,
      relays: relayList.length ? relayList : undefined,
    });
    setBusy(false);
    if (id) {
      setName("");
      setDescription("");
      setRelays("");
      onOpenChange(false);
      navigate(`/groups/${id}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
          <DialogDescription>
            Create an encrypted MLS group. You'll be its first admin.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Marmot crew"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="group-desc">Description</Label>
            <Textarea
              id="group-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="group-relays">Relays</Label>
            <Input
              id="group-relays"
              value={relays}
              onChange={(e) => setRelays(e.target.value)}
              placeholder="Defaults to your outbox relays"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => void create()} disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

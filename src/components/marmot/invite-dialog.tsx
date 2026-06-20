import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useController } from "@/hooks/use-marmot";
import type { InviteCandidates } from "@/lib/marmot/controller";

export function InviteDialog({
  groupId,
  open,
  onOpenChange,
}: {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const controller = useController();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [result, setResult] = useState<InviteCandidates | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const reset = () => {
    setInput("");
    setResult(null);
    setSelected(new Set());
  };

  const search = async () => {
    if (!controller || !input.trim()) return;
    setLoading(true);
    setResult(null);
    const candidates = await controller.loadInviteCandidates(groupId, input.trim());
    setLoading(false);
    if (candidates) {
      setResult(candidates);
      setSelected(
        new Set(candidates.candidates.filter((c) => c.invitable).map((c) => c.id)),
      );
    }
  };

  const invite = async () => {
    if (!controller || !result || inviting) return;
    setInviting(true);
    try {
      const events = result.candidates
        .filter((c) => selected.has(c.id))
        .map((c) => c.event);
      await controller.inviteKeyPackages(groupId, events);
      reset();
      onOpenChange(false);
    } finally {
      setInviting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Don't let an outside-click/escape close the dialog mid-invite.
        if (inviting) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite to group</DialogTitle>
          <DialogDescription>
            Enter a contact's npub. We'll fetch their published key packages.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void search()}
            placeholder="npub1…"
            autoFocus
          />
          <Button
            onClick={() => void search()}
            disabled={loading || inviting || !input.trim()}
          >
            {loading ? "…" : "Find"}
          </Button>
        </div>

        {result && (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {result.candidates.length === 0 && (
              <p className="text-sm text-muted-foreground">No key packages found.</p>
            )}
            {result.candidates.map((c) => (
              <label
                key={c.id}
                className="flex items-start gap-2 rounded border p-2 text-sm"
              >
                <Checkbox
                  checked={selected.has(c.id)}
                  disabled={!c.invitable}
                  onCheckedChange={(checked) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (checked) next.add(c.id);
                      else next.delete(c.id);
                      return next;
                    })
                  }
                />
                <div className="min-w-0">
                  <div className="font-mono text-xs">
                    {c.deviceId ?? "device"} · ref {c.refHex?.slice(0, 8) ?? "?"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.alreadyMember
                      ? "already a member"
                      : c.invitable
                        ? "invitable"
                        : c.reasons.join(", ") || "not invitable"}
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button
            onClick={() => void invite()}
            disabled={!result || selected.size === 0 || inviting}
          >
            {inviting
              ? "Inviting…"
              : `Invite ${selected.size > 0 ? `(${selected.size})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

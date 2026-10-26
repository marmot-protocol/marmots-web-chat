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
import { useMarmotAccount } from "@/hooks/use-marmot";
import {
  InviteDeliveryError,
  inviteKeyPackages,
} from "@/lib/marmot/actions/invites";
import { describeInviteCandidate } from "@/lib/marmot/invitations";
import type { InviteCandidate } from "@/lib/marmot/types";
import { formatTimeAgo } from "@/lib/time";

export function InviteDialog({
  groupId,
  open,
  onOpenChange,
}: {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const account = useMarmotAccount();
  const [input, setInput] = useState("");
  const [progress, setProgress] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [result, setResult] = useState<InviteCandidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setInput("");
    setResult(null);
    setSelected(new Set());
    setError(null);
  };

  const search = async () => {
    if (!account || loading || inviting || !input.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const group = account.group(groupId);
      const { events } = await account.keyPackageDiscovery.load(
        input.trim(),
        setProgress,
      );
      const candidates = events
        .sort((a, b) => b.created_at - a.created_at)
        .map((event) => describeInviteCandidate(event, account.pubkey, group));
      setResult(candidates);
      setSelected(
        new Set(candidates.filter((c) => c.invitable).map((c) => c.id)),
      );
    } catch (err) {
      setError(
        `${err instanceof Error ? err.message : String(err)}. Check the identifier and relay settings, then try again.`,
      );
    } finally {
      setLoading(false);
    }
  };

  const invite = async () => {
    if (!account || !result || inviting) return;
    setInviting(true);
    setError(null);
    try {
      const events = result
        .filter((c) => selected.has(c.id))
        .map((c) => c.event);
      await inviteKeyPackages(account.client, account.group(groupId), events);
      reset();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof InviteDeliveryError)
        err.failures.forEach((failure) => account.notify(failure));
      setError(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setInviting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Don't let an outside-click/escape close the dialog mid-invite.
        if (inviting || loading) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite to group</DialogTitle>
          <DialogDescription>
            Enter a contact's npub or name@domain. We'll fetch their published
            key packages.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void search()}
            placeholder="npub1… or name@domain"
            disabled={loading || inviting}
            autoFocus
          />
          <Button
            onClick={() => void search()}
            disabled={loading || inviting || !input.trim()}
          >
            {loading ? "…" : "Find"}
          </Button>
        </div>

        {loading && (
          <p className="text-sm text-muted-foreground" role="status">
            {progress}
          </p>
        )}
        {result && (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {result.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No key packages found.
              </p>
            )}
            {result.map((c) => (
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
                    {c.deviceId ?? "device"} · ref{" "}
                    {c.refHex?.slice(0, 8) ?? "?"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.alreadyMember
                      ? "already a member"
                      : c.invitable
                        ? "invitable"
                        : c.reasons.join(", ") || "not invitable"}
                    {" · "}
                    <span title={new Date(c.createdAt * 1000).toLocaleString()}>
                      published {formatTimeAgo(c.createdAt)}
                    </span>
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            onClick={() => void invite()}
            disabled={!result || selected.size === 0 || inviting || loading}
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

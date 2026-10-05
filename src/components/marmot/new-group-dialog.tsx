import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useChat, useController } from "@/hooks/use-marmot";
import type { InviteCandidate } from "@/lib/marmot/controller";

/** Create a solo group or include selected devices in its founding membership. */
export function NewGroupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const controller = useController();
  const snapshot = useChat();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [relays, setRelays] = useState("");
  const [contact, setContact] = useState("");
  const [candidates, setCandidates] = useState<InviteCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) void controller?.refreshRelayLists();
  }, [open, controller]);
  useEffect(() => {
    setCandidates([]);
    setSelected(new Set());
  }, [controller]);

  const find = async () => {
    if (!controller || loading || busy || !contact.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const found = await controller.loadFoundingCandidates(
        contact.trim(),
        setProgress,
      );
      const pubkeys = new Set(found.map((candidate) => candidate.event.pubkey));
      setCandidates((previous) => [
        ...previous.filter((candidate) => !pubkeys.has(candidate.event.pubkey)),
        ...found,
      ]);
      setSelected((previous) => {
        const next = new Set(
          [...previous].filter(
            (id) =>
              !candidates.some(
                (candidate) =>
                  candidate.id === id && pubkeys.has(candidate.event.pubkey),
              ),
          ),
        );
        const first = found.find((candidate) => candidate.invitable);
        if (first) next.add(first.id);
        return next;
      });
      setContact("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const create = async () => {
    if (!controller || busy || loading || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const relayList = relays.split(/[\s,]+/).filter(Boolean);
      const id = await controller.createGroup(name.trim(), {
        description: description.trim() || undefined,
        relays: relayList.length ? relayList : undefined,
        invitees: candidates
          .filter((candidate) => selected.has(candidate.id))
          .map((candidate) => candidate.event),
      });
      if (!id) {
        setError(
          "Could not create group. Check the relay settings and selected key packages.",
        );
        return;
      }
      setName("");
      setDescription("");
      setRelays("");
      setContact("");
      setCandidates([]);
      setSelected(new Set());
      onOpenChange(false);
      navigate(`/groups/${id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy && !loading) onOpenChange(value);
      }}
    >
      <DialogContent className="max-h-[80dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
          <DialogDescription>
            Create an encrypted group. You'll be its first admin.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="group-name">Name</FieldLabel>
              <Input
                id="group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Marmot crew"
                autoFocus
                disabled={busy}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="group-desc">Description</FieldLabel>
              <Textarea
                id="group-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
                rows={2}
                disabled={busy}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="group-relays">Relays</FieldLabel>
              <Input
                id="group-relays"
                value={relays}
                onChange={(e) => setRelays(e.target.value)}
                placeholder={
                  snapshot?.outboxRelays.join(", ") || "wss://relay.example.com"
                }
                disabled={busy}
              />
              <FieldDescription>
                {snapshot?.outboxRelays.length
                  ? "Leave blank to use your outbox relays."
                  : "Enter group relays here or configure your outbox in Settings."}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="group-contact">
                Invite founding members (optional)
              </FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="group-contact"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="npub1… or name@domain"
                  disabled={loading || busy}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void find();
                  }}
                />
                <Button
                  variant="outline"
                  disabled={loading || busy || !contact.trim()}
                  onClick={() => void find()}
                >
                  Find
                </Button>
              </div>
              <FieldDescription>
                Add contacts, then select one device per account to invite when
                the group is created.
              </FieldDescription>
            </Field>
            {loading && (
              <p className="text-sm text-muted-foreground" role="status">
                {progress}
              </p>
            )}
            {candidates.length > 0 && (
              <FieldSet>
                <FieldLegend>Member devices</FieldLegend>
                <FieldGroup>
                  {candidates.map((candidate) => (
                    <Field key={candidate.id} orientation="horizontal">
                      <Checkbox
                        id={`founding-${candidate.id}`}
                        checked={selected.has(candidate.id)}
                        disabled={!candidate.invitable || busy}
                        onCheckedChange={(checked) =>
                          setSelected((previous) => {
                            const next = new Set(previous);
                            if (checked) {
                              for (const other of candidates)
                                if (
                                  other.event.pubkey === candidate.event.pubkey
                                )
                                  next.delete(other.id);
                              next.add(candidate.id);
                            } else next.delete(candidate.id);
                            return next;
                          })
                        }
                      />
                      <div className="min-w-0">
                        <FieldLabel htmlFor={`founding-${candidate.id}`}>
                          {candidate.event.pubkey.slice(0, 8)} ·{" "}
                          {candidate.deviceId ?? "device"}
                        </FieldLabel>
                        {!candidate.invitable && (
                          <FieldDescription>
                            {candidate.reasons.join(", ")}
                          </FieldDescription>
                        )}
                      </div>
                    </Field>
                  ))}
                </FieldGroup>
              </FieldSet>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </FieldGroup>
        </div>
        <DialogFooter>
          <Button
            onClick={() => void create()}
            disabled={
              busy ||
              loading ||
              !name.trim() ||
              (!relays.trim() && !snapshot?.outboxRelays.length)
            }
          >
            {busy
              ? "Creating…"
              : selected.size
                ? `Create and invite (${selected.size})`
                : "Create group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

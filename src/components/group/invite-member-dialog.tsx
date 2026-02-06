import { mapEventsToTimeline } from "applesauce-core";
import type { NostrEvent } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { Loader2, XCircle } from "lucide-react";
import type { MarmotGroup } from "marmot-ts";
import { useState } from "react";
import { map } from "rxjs/operators";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { user$ } from "@/lib/accounts";
import { pool } from "@/lib/nostr";
import { extraRelays$ } from "@/lib/settings";

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: MarmotGroup<any>;
  isAdmin: boolean;
}

export function InviteMemberDialog({
  open,
  onOpenChange,
  group,
  isAdmin,
}: InviteMemberDialogProps) {
  const [inviteContactPubkey, setInviteContactPubkey] = useState<string>("");
  const [selectedKeyPackageEventId, setSelectedKeyPackageEventId] =
    useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const contacts = use$(user$.contacts$);
  const contactOptions = (contacts ?? []).map((c) => ({
    pubkey: c.pubkey,
    label: `${c.pubkey.slice(0, 12)}...`,
  }));

  const extraRelays = use$(extraRelays$);

  const contactKeyPackages = use$(() => {
    if (!inviteContactPubkey) return;
    return pool
      .request(extraRelays ?? [], {
        kinds: [443],
        authors: [inviteContactPubkey],
        limit: 50,
      })
      .pipe(
        mapEventsToTimeline(),
        map((arr) => [...arr] as NostrEvent[]),
      );
  }, [inviteContactPubkey, extraRelays?.join(",")]);

  const handleInvite = async () => {
    if (!group) return;

    setInviteError(null);

    if (!isAdmin) {
      setInviteError("Only group admins can invite members");
      return;
    }

    const selectedEvent =
      contactKeyPackages?.find(
        (e: NostrEvent) => e.id === selectedKeyPackageEventId,
      ) ?? null;
    if (!selectedEvent) {
      setInviteError("Select a KeyPackage event to invite");
      return;
    }

    try {
      setIsInviting(true);
      await group.inviteByKeyPackageEvent(selectedEvent);
      onOpenChange(false);
      setInviteContactPubkey("");
      setSelectedKeyPackageEventId("");
      setInviteError(null);
    } catch (err) {
      console.error("Failed to invite member:", err);
      setInviteError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription>
            Choose a contact and a KeyPackage event (kind 443) to send a
            Welcome.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isAdmin && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                Only group admins can invite members.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>Contact</Label>
            <Select
              value={inviteContactPubkey}
              onValueChange={(v) => {
                setInviteContactPubkey(v);
                setSelectedKeyPackageEventId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a contact" />
              </SelectTrigger>
              <SelectContent>
                {contactOptions.map((c) => (
                  <SelectItem key={c.pubkey} value={c.pubkey}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>KeyPackage event</Label>
            <Select
              value={selectedKeyPackageEventId}
              onValueChange={setSelectedKeyPackageEventId}
              disabled={!inviteContactPubkey}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select KeyPackage event" />
              </SelectTrigger>
              <SelectContent>
                {(contactKeyPackages ?? []).map((e: NostrEvent) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.id.slice(0, 16)}... (
                    {new Date(e.created_at * 1000).toLocaleString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {inviteError && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{inviteError}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleInvite} disabled={!isAdmin || isInviting}>
            {isInviting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Inviting...
              </>
            ) : (
              "Send invite"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

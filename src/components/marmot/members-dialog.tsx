import { useMemo } from "react";
import { getGroupMembers } from "@internet-privacy/marmot-ts";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserAvatar, UserName } from "@/components/user";
import { useAction, useGroup, useMarmotAccount } from "@/hooks/use-marmot";
import { removeMember, setMemberAdmin } from "@/lib/marmot/actions/group-admin";

export function MembersDialog({
  groupId,
  open,
  onOpenChange,
}: {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const me = useMarmotAccount()?.pubkey;
  const group = useGroup(groupId);
  const setAdmin = useAction((account, pubkey: string, makeAdmin: boolean) =>
    setMemberAdmin(account.client, account.group(groupId), pubkey, makeAdmin),
  );
  const remove = useAction((account, pubkey: string) =>
    removeMember(account.client, account.group(groupId), pubkey),
  );
  const busy = setAdmin.pending || remove.pending;
  const admins = group?.groupData?.adminPubkeys ?? [];
  const iAmAdmin = me ? admins.includes(me) : false;

  // useGroup re-renders on stateChanged; derive from the current state.
  const state = group?.state;
  const members = useMemo(() => (state ? getGroupMembers(state) : []), [state]);
  const unique = useMemo(() => [...new Set(members)], [members]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Members</DialogTitle>
          <DialogDescription>
            {unique.length} member{unique.length === 1 ? "" : "s"}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {unique.map((pubkey) => {
            const isAdmin = admins.includes(pubkey);
            const isMe = pubkey === me;
            return (
              <div
                key={pubkey}
                className="flex items-center gap-2 rounded p-1.5"
              >
                <UserAvatar pubkey={pubkey} size={32} />
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <UserName
                    pubkey={pubkey}
                    className="truncate text-sm font-medium"
                  />
                  {isAdmin && <Badge variant="secondary">admin</Badge>}
                  {isMe && (
                    <span className="text-xs text-muted-foreground">(you)</span>
                  )}
                </div>
                {iAmAdmin && !isMe && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void setAdmin.run(pubkey, !isAdmin)}
                    >
                      {isAdmin ? "Demote" : "Promote"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      disabled={busy}
                      onClick={() => void remove.run(pubkey)}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

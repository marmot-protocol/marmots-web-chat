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
import { useChat, useController } from "@/hooks/use-marmot";

export function MembersDialog({
  groupId,
  open,
  onOpenChange,
}: {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const controller = useController();
  const snapshot = useChat();
  const me = snapshot?.me.pubkey;
  const group = controller?.getGroup(groupId);

  const busy = snapshot?.busy ?? false;
  const admins = group?.groupData?.adminPubkeys ?? [];
  const iAmAdmin = me ? admins.includes(me) : false;

  // Re-derived whenever the snapshot bumps (stateChanged).
  const members = useMemo(
    () => (group ? getGroupMembers(group.state) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [group, snapshot],
  );
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
              <div key={pubkey} className="flex items-center gap-2 rounded p-1.5">
                <UserAvatar pubkey={pubkey} size={32} />
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <UserName pubkey={pubkey} className="truncate text-sm font-medium" />
                  {isAdmin && <Badge variant="secondary">admin</Badge>}
                  {isMe && <span className="text-xs text-muted-foreground">(you)</span>}
                </div>
                {iAmAdmin && !isMe && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        controller?.setMemberAdmin(groupId, pubkey, !isAdmin)
                      }
                    >
                      {isAdmin ? "Demote" : "Promote"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      disabled={busy}
                      onClick={() => controller?.removeMember(groupId, pubkey)}
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

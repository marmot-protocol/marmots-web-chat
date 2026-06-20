import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, UserPlus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Jdenticon } from "@/components/jdenticon";
import { ChatView } from "@/components/chat/chat-view";
import { InviteDialog } from "@/components/marmot/invite-dialog";
import { MembersDialog } from "@/components/marmot/members-dialog";
import { GroupInfoDialog } from "@/components/marmot/group-info-dialog";
import { useChat, useController } from "@/hooks/use-marmot";

export function GroupChatPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const controller = useController();
  // Re-render on group state changes (rename, membership).
  useChat();
  const [invite, setInvite] = useState(false);
  const [members, setMembers] = useState(false);
  const [info, setInfo] = useState(false);

  if (!id) return null;
  const group = controller?.getGroup(id);

  if (!group) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {controller ? "Group not found." : "Loading…"}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b p-3">
        <Button
          size="icon"
          variant="ghost"
          className="md:hidden"
          onClick={() => navigate("/groups")}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <button
          type="button"
          onClick={() => setInfo(true)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left hover:bg-accent/50"
          title="Group info"
        >
          <span className="size-8 shrink-0 overflow-hidden rounded-md bg-muted">
            <Jdenticon value={group.idStr} size={32} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">
              {group.groupData?.name || group.idStr.slice(0, 8)}
            </div>
            {group.groupData?.description && (
              <div className="truncate text-xs text-muted-foreground">
                {group.groupData.description}
              </div>
            )}
          </div>
        </button>
        <Button size="icon" variant="ghost" onClick={() => setInvite(true)}>
          <UserPlus className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => setMembers(true)}>
          <Users className="size-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1">
        <ChatView groupId={id} />
      </div>

      <InviteDialog groupId={id} open={invite} onOpenChange={setInvite} />
      <MembersDialog groupId={id} open={members} onOpenChange={setMembers} />
      <GroupInfoDialog groupId={id} open={info} onOpenChange={setInfo} />
    </div>
  );
}

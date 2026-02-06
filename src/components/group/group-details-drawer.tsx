import { npubEncode } from "applesauce-core/helpers";
import { Loader2 } from "lucide-react";
import { getNostrGroupIdHex, MarmotGroup } from "marmot-ts";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { UserAvatar, UserName } from "@/components/nostr-user";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { use$ } from "applesauce-react/hooks";
import type { GroupRumorHistory } from "marmot-ts";
import { marmotClient$ } from "../../lib/marmot-client";

interface GroupDetailsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupDetails: {
    name: string;
    epoch: bigint;
    members: string[];
    admins: string[];
  } | null;
  isAdmin: boolean;
  group: MarmotGroup<GroupRumorHistory> | null;
  trigger?: React.ReactNode;
}

function UserLinkCard({ pubkey }: { pubkey: string }) {
  return (
    <Link key={pubkey} to={`/contacts/${pubkey}`} className="block">
      <Card className="cursor-pointer hover:bg-accent transition-colors">
        <CardHeader className="flex items-center gap-2 overflow-hidden">
          <UserAvatar pubkey={pubkey} size="md" className="shrink-0" />
          <div className="overflow-hidden">
            <span className="font-bold truncate whitespace-pre">
              <UserName pubkey={pubkey} />
            </span>
            <code className="text-xs text-muted-foreground truncate font-mono block">
              {npubEncode(pubkey)}
            </code>
          </div>
        </CardHeader>
      </Card>
    </Link>
  );
}

export function GroupDetailsDrawer({
  open,
  onOpenChange,
  groupDetails,
  isAdmin,
  group,
  trigger,
}: GroupDetailsDrawerProps) {
  const navigate = useNavigate();
  const [isPurgingGroup, setIsPurgingGroup] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);

  const groupIdHex = group ? getNostrGroupIdHex(group.state) : null;

  const client = use$(marmotClient$);
  const handlePurgeGroup = async () => {
    if (!client || !group) throw new Error("Group not found");
    try {
      setIsPurgingGroup(true);
      await client.destroyGroup(group.id);
      onOpenChange(false);
      navigate("/groups", { replace: true });
    } catch (error) {
      console.error("Failed to purge group:", error);
    } finally {
      setIsPurgingGroup(false);
    }
  };

  const handleClearHistory = async () => {
    if (!group?.history) return;

    try {
      setIsClearingHistory(true);
      await group.history.purgeMessages();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to clear chat history:", error);
    } finally {
      setIsClearingHistory(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto flex flex-col"
      >
        <SheetHeader>
          <SheetTitle>Group details</SheetTitle>
          <SheetDescription>
            Inspect metadata and MLS state (read-only).
          </SheetDescription>
        </SheetHeader>

        <div className="p-4 space-y-4 overflow-auto flex-1">
          {groupDetails && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Name</div>
                  <div className="text-sm font-medium">{groupDetails.name}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Epoch</div>
                  <div className="text-sm font-mono">
                    {String(groupDetails.epoch)}
                  </div>
                </div>
              </div>

              {/* Admins Section */}
              <div>
                <div className="text-xs text-muted-foreground mb-3">
                  Admins ({groupDetails.admins.length})
                </div>
                <div className="space-y-2">
                  {groupDetails.admins.map((pk) => (
                    <UserLinkCard key={pk} pubkey={pk} />
                  ))}
                </div>
              </div>

              {/* Members Section */}
              <div>
                <div className="text-xs text-muted-foreground mb-3">
                  Members ({groupDetails.members.length})
                </div>
                {groupDetails.members.length > 0 ? (
                  <div className="space-y-2">
                    {groupDetails.members.map((pk) => (
                      <UserLinkCard key={pk} pubkey={pk} />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No additional members
                  </p>
                )}
              </div>

              {/* Manage Members Button */}
              <div className="pt-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    if (groupIdHex) {
                      navigate(`/groups/${groupIdHex}/members`);
                      onOpenChange(false);
                    }
                  }}
                >
                  Manage members
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  {isAdmin
                    ? "View, invite, and remove group members"
                    : "View group members"}
                </p>
              </div>
            </>
          )}
        </div>

        <SheetFooter className="flex-col gap-2 sm:flex-col border-t pt-4">
          {/* Clear Chat History Button */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full"
                disabled={isClearingHistory}
              >
                {isClearingHistory ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Clearing...
                  </>
                ) : (
                  "Clear chat history"
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear chat history?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove all messages from this group from your local
                  storage. The group itself will remain. This action cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearHistory}>
                  Clear history
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Purge Group Button */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                className="w-full"
                disabled={isPurgingGroup}
              >
                {isPurgingGroup ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Purging...
                  </>
                ) : (
                  "Purge group"
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Purge group?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove the group and all its messages
                  from your local storage. No protocol action will be published.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handlePurgeGroup}>
                  Purge group
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

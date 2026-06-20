import {
  getMarmotGroupData,
  getGroupMembers,
  getNostrGroupIdHex,
} from "@internet-privacy/marmot-ts";
import { npubEncode } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
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
import { AppGroup, marmotClient$ } from "@/lib/marmot-client";

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
  trigger,
  group,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
  group: AppGroup;
}) {
  const navigate = useNavigate();
  const [isLeavingGroup, setIsLeavingGroup] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [isSelfUpdating, setIsSelfUpdating] = useState(false);

  const groupIdHex = getNostrGroupIdHex(group.state);

  const groupDetails = useMemo(() => {
    const data = getMarmotGroupData(group.state);
    const allMembers = getGroupMembers(group.state);
    const adminPubkeys = data?.adminPubkeys ?? [];
    const members = allMembers.filter((pk) => !adminPubkeys.includes(pk));
    return {
      name: data?.name ?? "Unnamed Group",
      epoch: group.state.groupContext.epoch,
      members,
      admins: adminPubkeys,
    };
  }, [group.state]);

  const client = use$(marmotClient$);

  const handleLeaveGroup = async () => {
    if (!client) throw new Error("Client not found");
    try {
      setIsLeavingGroup(true);
      await client.groups.leave(group.id);
      onOpenChange(false);
      navigate("/groups", { replace: true });
    } catch (error) {
      console.error("Failed to leave group:", error);
    } finally {
      setIsLeavingGroup(false);
    }
  };

  const handleSelfUpdate = async () => {
    try {
      setIsSelfUpdating(true);
      await group.selfUpdate();
    } catch (error) {
      console.error("Failed to perform self update:", error);
    } finally {
      setIsSelfUpdating(false);
    }
  };

  const handleClearHistory = async () => {
    if (!group.history) return;

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
            </>
          )}
        </div>

        <SheetFooter className="flex-col gap-2 sm:flex-col border-t pt-4">
          {/* Self Update Button */}
          <Button
            variant="outline"
            className="w-full"
            disabled={isSelfUpdating}
            onClick={handleSelfUpdate}
          >
            {isSelfUpdating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              "Self update"
            )}
          </Button>

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

          {/* Leave Group Button */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                className="w-full"
                disabled={isLeavingGroup}
              >
                {isLeavingGroup ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Leaving...
                  </>
                ) : (
                  "Leave group"
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Leave group?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will publish a leave proposal to the group relays and
                  remove the group from your local storage. This action cannot
                  be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleLeaveGroup}>
                  Leave group
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

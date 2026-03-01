import { getPubkeyLeafNodes } from "@internet-privacy/marmots";
import { npubEncode } from "applesauce-core/helpers";
import { Loader2, Trash2 } from "lucide-react";
import type { GroupRumorHistory, MarmotGroup } from "@internet-privacy/marmots";
import { Proposals } from "@internet-privacy/marmots";
import { useState } from "react";
import { Link } from "react-router";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface UserMemberCardProps {
  pubkey: string;
  isAdmin: boolean;
  canRemove: boolean;
  group: MarmotGroup<GroupRumorHistory> | null;
  onRemoveSuccess?: () => void;
}

export function UserMemberCard({
  pubkey,
  isAdmin,
  canRemove,
  group,
  onRemoveSuccess,
}: UserMemberCardProps) {
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leafCount = group ? getPubkeyLeafNodes(group.state, pubkey).length : 0;

  const handleRemove = async () => {
    if (!group || !canRemove) return;

    try {
      setIsRemoving(true);
      setError(null);

      // Propose removing the user (removes all their leaf nodes)
      await group.propose(Proposals.proposeRemoveUser(pubkey));

      // Commit the proposal (admin-only operation)
      await group.commit();

      onRemoveSuccess?.();
    } catch (err) {
      console.error("Failed to remove member:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="ring-foreground/10 bg-card text-card-foreground rounded-none ring-1 overflow-hidden">
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Link
          to={`/contacts/${pubkey}`}
          className="shrink-0 hover:opacity-80 transition-opacity"
        >
          <UserAvatar pubkey={pubkey} size="md" />
        </Link>

        <div className="flex-1 min-w-0">
          <Link
            to={`/contacts/${pubkey}`}
            className="hover:opacity-80 transition-opacity"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold truncate">
                <UserName pubkey={pubkey} />
              </span>
              {isAdmin && (
                <Badge variant="secondary" className="text-xs shrink-0">
                  Admin
                </Badge>
              )}
              {leafCount > 1 && (
                <Badge variant="outline" className="text-xs shrink-0 font-mono">
                  ×{leafCount}
                </Badge>
              )}
            </div>
            <code className="text-xs text-muted-foreground truncate font-mono block">
              {npubEncode(pubkey)}
            </code>
          </Link>
        </div>
      </div>

      {/* Footer — only rendered when there's an action or error */}
      {(canRemove || error) && (
        <div className="px-4 pb-3 flex flex-col items-end gap-2">
          {error && <p className="text-xs text-destructive w-full">{error}</p>}
          {canRemove && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isRemoving}>
                  {isRemoving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Removing...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove member?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove{" "}
                    <strong>{npubEncode(pubkey).slice(0, 16)}...</strong> from
                    the group. This action will create a new commit in the group
                    state.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRemove}>
                    Remove member
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}
    </div>
  );
}

import { npubEncode } from "applesauce-core/helpers";
import { Loader2, Trash2 } from "lucide-react";
import type { MarmotGroup } from "marmot-ts";
import { Proposals } from "marmot-ts";
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
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface UserMemberCardProps {
  pubkey: string;
  isAdmin: boolean;
  canRemove: boolean;
  group: MarmotGroup<any> | null;
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

  const handleRemove = async () => {
    if (!group || !canRemove) return;

    try {
      setIsRemoving(true);
      setError(null);

      // Propose kicking the user (removes all their leaf nodes)
      await group.propose(Proposals.proposeKickUser, pubkey);

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
    <Card>
      <CardHeader className="pb-2">
        <Link
          to={`/contacts/${pubkey}`}
          className="flex items-start gap-3 hover:opacity-80 transition-opacity"
        >
          <UserAvatar pubkey={pubkey} size="md" className="shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold truncate">
                <UserName pubkey={pubkey} />
              </span>
              {isAdmin && (
                <Badge variant="secondary" className="text-xs">
                  Admin
                </Badge>
              )}
            </div>
            <code className="text-xs text-muted-foreground truncate font-mono block">
              {npubEncode(pubkey)}
            </code>
          </div>
        </Link>
      </CardHeader>

      {canRemove && (
        <CardContent className="pt-0 pb-3">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                disabled={isRemoving}
              >
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
                  <strong>{npubEncode(pubkey).slice(0, 16)}...</strong> from the
                  group. This action will create a new commit in the group
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

          {error && <p className="text-xs text-destructive mt-2">{error}</p>}
        </CardContent>
      )}
    </Card>
  );
}

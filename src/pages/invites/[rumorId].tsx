import { IconAlertCircle } from "@tabler/icons-react";
import { bytesToHex } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { getWelcomeGroupRelays, getWelcomeKeyPackageEventId } from "marmot-ts";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  inviteReader$,
  liveUnreadInvites$,
  marmotClient$,
} from "@/lib/marmot-client";
import { UserAvatar, UserName } from "../../components/nostr-user";

/**
 * Sub-view for individual invite details with join and mark as read functionality
 */
export function InviteDetailPage() {
  const { rumorId } = useParams<{ rumorId: string }>();
  const navigate = useNavigate();
  const client = use$(marmotClient$);
  const inviteReader = use$(inviteReader$);
  const unread = use$(liveUnreadInvites$);

  const invite = unread?.find((i) => i.id === rumorId) ?? null;

  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  /** Join group from selected invite and mark as read */
  const handleJoin = async () => {
    if (!client || !inviteReader || !invite) return;
    try {
      setError(null);
      setIsJoining(true);
      // The selected invite is now a Rumor (UnreadInvite extends Rumor)
      // Pass it directly as welcomeRumor
      const group = await client.joinGroupFromWelcome({
        welcomeRumor: invite,
        keyPackageEventId: getWelcomeKeyPackageEventId(invite),
      });

      // Mark invite as read (removes from unread, keeps in seen)
      await inviteReader.markAsRead(invite.id);

      navigate(`/groups/${bytesToHex(group.state.groupContext.groupId)}`);
    } catch (err) {
      console.error("Failed to join group:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsJoining(false);
    }
  };

  /** Mark invite as read without joining */
  const handleMarkAsRead = async () => {
    if (!inviteReader || !invite) return;
    try {
      setError(null);
      await inviteReader.markAsRead(invite.id);
      // Navigate back to invites list
      navigate("/invites");
    } catch (err) {
      console.error("Failed to mark as read:", err);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (!inviteReader) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Invitation reader is not initialized (not signed in yet?).
        </AlertDescription>
      </Alert>
    );
  }

  if (!invite) {
    return (
      <Alert>
        <AlertDescription>
          Invite not found. It may have already been read or doesn't exist.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      {error && (
        <Alert variant="destructive">
          <IconAlertCircle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Invite details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="text-muted-foreground">Rumor ID</div>
            <div className="font-mono">{invite.id}</div>
          </div>

          <Separator />

          <div>
            <div className="text-muted-foreground">Sender</div>
            <div className="flex gap-2 items-center">
              <UserAvatar pubkey={invite.pubkey} size="sm" />
              <UserName pubkey={invite.pubkey} />
            </div>
            <div className="font-mono text-muted-foreground">
              {invite.pubkey}
            </div>
          </div>

          {getWelcomeKeyPackageEventId(invite) && (
            <div>
              <div className="text-muted-foreground">KeyPackage event</div>
              <div className="font-mono">
                {getWelcomeKeyPackageEventId(invite)}
              </div>
            </div>
          )}

          {getWelcomeGroupRelays(invite).length > 0 && (
            <div>
              <div className="text-muted-foreground">Group relays</div>
              <div>{getWelcomeGroupRelays(invite).join(", ")}</div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button
              variant="outline"
              onClick={handleMarkAsRead}
              disabled={isJoining}
            >
              Mark as read
            </Button>
            <Button onClick={handleJoin} disabled={isJoining}>
              {isJoining ? "Joining..." : "Join group"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

export default InviteDetailPage;

import { IconAlertCircle } from "@tabler/icons-react";
import { bytesToHex } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import {
  getKeyPackage,
  getWelcome,
  getWelcomeGroupRelays,
  getWelcomeKeyPackageEventId,
  UnreadInvite,
} from "marmot-ts";
import { ComponentProps, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";

import CipherSuiteBadge from "@/components/cipher-suite-badge";
import DataView from "@/components/data-view";
import KeyPackageDataView from "@/components/data-view/key-package";
import JsonBlock from "@/components/json-block";
import { UserAvatar, UserName } from "@/components/nostr-user";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { keyPackageRelays$ } from "@/lib/lifecycle";
import {
  inviteReader$,
  liveUnreadInvites$,
  marmotClient$,
} from "@/lib/marmot-client";
import { eventStore } from "@/lib/nostr";
import { catchError, from, map, of } from "rxjs";
import { Badge } from "../../components/ui/badge";

function JoinButton({
  invite,
  setError,
  variant = "default",
}: {
  invite: UnreadInvite;
  setError: (error: string | null) => void;
  variant?: ComponentProps<typeof Button>["variant"];
}) {
  const client = use$(marmotClient$);
  const inviteReader = use$(inviteReader$);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  /** Join group from selected invite and mark as read */
  const handleJoin = async () => {
    if (!client || !inviteReader || !invite) return;
    try {
      setLoading(true);
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
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleJoin} disabled={loading} variant={variant}>
      {loading ? "Joining..." : "Join group"}
    </Button>
  );
}

function ReadButton({
  invite,
  setError,
  variant = "outline",
}: {
  invite: UnreadInvite;
  setError: (error: string | null) => void;
  variant?: ComponentProps<typeof Button>["variant"];
}) {
  const inviteReader = use$(inviteReader$);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  /** Mark invite as read without joining */
  const handleMarkAsRead = async () => {
    if (!inviteReader || !invite) return;

    try {
      setLoading(true);
      await inviteReader.markAsRead(invite.id);
      // Navigate back to invites list
      navigate("/invites");
    } catch (err) {
      console.error("Failed to mark as read:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleMarkAsRead} disabled={loading} variant={variant}>
      Mark as read
    </Button>
  );
}

/**
 * Sub-view for individual invite details with join and mark as read functionality
 */
export function InviteDetailPage() {
  const { rumorId } = useParams<{ rumorId: string }>();
  const inviteReader = use$(inviteReader$);
  const unread = use$(liveUnreadInvites$);
  const client = use$(marmotClient$);
  const [advancedView, setAdvancedView] = useState(false);

  const invite = unread?.find((i) => i.id === rumorId) ?? null;

  const [error, setError] = useState<string | null>(null);

  /** Extract Welcome message from invite for displaying details */
  const welcome = useMemo(() => {
    if (!invite) return null;
    try {
      return getWelcome(invite);
    } catch (error) {
      console.error("Failed to decode welcome:", error);
      return null;
    }
  }, [invite]);

  // get the key package event that this invite is referencing
  const keyPackageRelays = use$(keyPackageRelays$);
  const keyPackage = use$(() => {
    if (!invite) return;
    const id = getWelcomeKeyPackageEventId(invite);
    if (!id) return;

    return eventStore.event({ id, relays: keyPackageRelays }).pipe(
      // Parse the event to a public key package
      map((e) => e && getKeyPackage(e)),
      // Ingore all errors
      catchError(() => of(null)),
    );
  }, [invite, keyPackageRelays?.join(",")]);

  /** Check if the private key for this key package is stored locally */
  const hasKeyPackage = use$(() => {
    if (!client || !keyPackage) return of(false);
    return from(client.keyPackageStore.getPrivateKey(keyPackage)).pipe(
      map((pk) => pk !== null),
    );
  }, [keyPackage, client]);

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

          <div>
            <div className="text-muted-foreground">Cipher Suite</div>
            {welcome && (
              <div className="mb-2">
                <CipherSuiteBadge cipherSuite={welcome.cipherSuite} />
              </div>
            )}
          </div>

          <div>
            <div className="text-muted-foreground">Key Package</div>
            <div className="font-mono mb-1">
              Event ID: {getWelcomeKeyPackageEventId(invite)}
            </div>
            {hasKeyPackage === true ? (
              <Badge variant="default">Has private key</Badge>
            ) : hasKeyPackage === false ? (
              <Badge variant="destructive">No private key</Badge>
            ) : (
              <Badge variant="outline">Checking key package...</Badge>
            )}
          </div>

          {getWelcomeGroupRelays(invite).length > 0 && (
            <div>
              <div className="text-muted-foreground">Group relays</div>
              <div>{getWelcomeGroupRelays(invite).join(", ")}</div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button
              variant="outline"
              onClick={() => setAdvancedView(!advancedView)}
            >
              {advancedView ? "Hide Advanced View" : "Show Advanced View"}
            </Button>
            <ReadButton invite={invite} setError={setError} />
            <JoinButton invite={invite} setError={setError} />
          </div>
        </CardContent>
      </Card>

      {welcome && advancedView && (
        <Card>
          <CardHeader>
            <CardTitle>Raw Welcome Message</CardTitle>
          </CardHeader>
          <CardContent>
            <DataView data={welcome} />
          </CardContent>
        </Card>
      )}
      {keyPackage && advancedView && (
        <Card>
          <CardHeader>
            <CardTitle>KeyPackage</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyPackageDataView keyPackage={keyPackage} />
          </CardContent>
        </Card>
      )}
      {advancedView && (
        <Card>
          <CardHeader>
            <CardTitle>Invite Rumor event</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonBlock value={invite} />
          </CardContent>
        </Card>
      )}
    </>
  );
}

export default InviteDetailPage;

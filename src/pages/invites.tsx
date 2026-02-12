import { IconAlertCircle, IconLock } from "@tabler/icons-react";
import { relaySet } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { useState } from "react";
import { Outlet, useNavigate } from "react-router";
import { combineLatest, map, shareReplay } from "rxjs";

import { AppSidebar } from "@/components/app-sidebar";
import { PageBody } from "@/components/page-body";
import { PageHeader } from "@/components/page-header";
import { SubscriptionStatusButton } from "@/components/subscription-status-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SidebarInset } from "@/components/ui/sidebar";
import { withActiveAccount } from "@/components/with-active-account";
import { user$ } from "@/lib/accounts";
import { keyPackageRelays$ } from "@/lib/lifecycle";
import {
  inviteReader$,
  liveReceivedInvites$,
  liveUnreadInvites$,
} from "@/lib/marmot-client";
import { extraRelays$ } from "@/lib/settings";

/** An observable of all relays to read invites from (user inboxes + extra relays) */
const readRelays$ = combineLatest([
  user$.directMessageRelays$,
  keyPackageRelays$,
  extraRelays$,
]).pipe(
  map((all) => relaySet(...all)),
  shareReplay(1),
);

function InvitesPage() {
  const navigate = useNavigate();
  const inviteReader = use$(inviteReader$);

  // Watch received (encrypted) gift wraps
  const received = use$(liveReceivedInvites$);

  // Watch unread (decrypted) invites
  const unread = use$(liveUnreadInvites$);

  const [error, setError] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  const receivedCount = received?.length ?? 0;

  /** Decrypt pending gift wraps and add them to unread */
  const handleDecryptPending = async () => {
    if (!inviteReader) return;
    try {
      setError(null);
      setIsDecrypting(true);
      const newInvites = await inviteReader.decryptGiftWraps();
      console.log(`Decrypted ${newInvites.length} new invite(s)`);
    } catch (err) {
      console.error("Failed to decrypt invites:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsDecrypting(false);
    }
  };

  return (
    <>
      <AppSidebar
        title="Invites"
        footer={
          <div className="flex">
            <SubscriptionStatusButton relays={readRelays$} />
          </div>
        }
      >
        <div className="flex flex-col">
          {/* Decrypt pending button/prompt at top of sidebar */}
          {receivedCount > 0 && (
            <div className="p-2 border-b">
              <Button
                className="w-full"
                onClick={handleDecryptPending}
                disabled={isDecrypting}
              >
                {isDecrypting
                  ? `Decrypting ${receivedCount}...`
                  : `Decrypt ${receivedCount} invite${receivedCount === 1 ? "" : "s"}`}
              </Button>
            </div>
          )}

          <div className="p-2">
            <div className="text-xs text-muted-foreground">
              Unread invitations ({unread?.length ?? 0})
            </div>
          </div>

          {/* Show unread invites in sidebar */}
          {unread && unread.length > 0 ? (
            unread.map((inv) => (
              <button
                key={inv.id}
                onClick={() => navigate(`/invites/${inv.id}`)}
                className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex flex-col items-start gap-1 border-b p-4 text-sm leading-tight text-left"
              >
                <div className="flex w-full items-center gap-2">
                  <span className="font-medium truncate">Group invitation</span>
                  <span className="ml-auto text-xs text-muted-foreground truncate">
                    {inv.pubkey.slice(0, 8)}...
                  </span>
                </div>
                <div className="text-xs text-muted-foreground font-mono truncate w-full">
                  {inv.id.slice(0, 16)}...{inv.id.slice(-8)}
                </div>
              </button>
            ))
          ) : (
            <div className="p-4 text-sm text-muted-foreground text-center">
              {receivedCount > 0
                ? "Decrypt pending invites to view them"
                : "No unread invites."}
            </div>
          )}
        </div>
      </AppSidebar>
      <SidebarInset>
        <PageHeader
          items={[{ label: "Home", to: "/" }, { label: "Invites" }]}
        />
        <PageBody>
          {!inviteReader && (
            <Alert variant="destructive">
              <AlertDescription>
                Invitation reader is not initialized (not signed in yet?).
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <IconAlertCircle className="w-4 h-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Decrypt pending button in main content */}
          {receivedCount > 0 && (
            <Alert>
              <IconLock className="w-4 h-4" />
              <AlertDescription>
                <div className="flex items-center justify-between gap-4">
                  <span>
                    You have {receivedCount} encrypted invite
                    {receivedCount === 1 ? "" : "s"} waiting to be decrypted.
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDecryptPending}
                    disabled={isDecrypting}
                  >
                    {isDecrypting ? "Decrypting..." : "Decrypt now"}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <Outlet />
        </PageBody>
      </SidebarInset>
    </>
  );
}

export default withActiveAccount(InvitesPage);

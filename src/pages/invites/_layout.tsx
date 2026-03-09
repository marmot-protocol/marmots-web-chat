import { IconAlertCircle, IconArrowLeft, IconLock } from "@tabler/icons-react";
import { relaySet } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { useState } from "react";
import { Outlet, useMatch, useNavigate } from "react-router";
import { combineLatest, map, shareReplay } from "rxjs";

import { PageBody } from "@/components/page-body";
import { PageHeader } from "@/components/page-header";
import { SubscriptionStatusButton } from "@/components/subscription-status-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { withActiveAccount } from "@/components/with-active-account";
import { DesktopShell } from "@/layouts/desktop/shell";
import { MobileBottomNav } from "@/layouts/mobile/bottom-nav";
import { MobileTopHeader } from "@/layouts/mobile/top-header";
import { useIsMobile } from "@/hooks/use-mobile";
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

// ============================================================================
// Shared invite logic hook
// ============================================================================

function useInviteActions() {
  const inviteReader = use$(inviteReader$);
  const received = use$(liveReceivedInvites$);
  const unread = use$(liveUnreadInvites$);

  const [error, setError] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  const receivedCount = received?.length ?? 0;

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

  return {
    inviteReader,
    received,
    unread,
    error,
    isDecrypting,
    receivedCount,
    handleDecryptPending,
  };
}

// ============================================================================
// Shared invite list component
// ============================================================================

/**
 * Renders the scrollable list of unread invites with an optional decrypt button.
 * Used in both the desktop sidebar and the mobile index view.
 */
function InviteListContent() {
  const navigate = useNavigate();
  const { unread, receivedCount, isDecrypting, handleDecryptPending } =
    useInviteActions();

  return (
    <div className="flex flex-col">
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
  );
}

// ============================================================================
// Layouts
// ============================================================================

function DesktopInvitesLayout() {
  const {
    inviteReader,
    unread,
    error,
    isDecrypting,
    receivedCount,
    handleDecryptPending,
  } = useInviteActions();

  const footer = (
    <div className="flex">
      <SubscriptionStatusButton relays={readRelays$} />
    </div>
  );

  const content = (
    <>
      <PageHeader items={[{ label: "Home", to: "/" }, { label: "Invites" }]} />
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
        {unread && unread.length === 0 && receivedCount === 0 && (
          <p className="text-sm text-muted-foreground">No unread invites.</p>
        )}
        <Outlet />
      </PageBody>
    </>
  );

  return (
    <DesktopShell
      title="Invites"
      sidebar={<InviteListContent />}
      footer={footer}
    >
      {content}
    </DesktopShell>
  );
}

function MobileInvitesLayout() {
  const navigate = useNavigate();
  const isDetail = useMatch("/invites/:rumorId");
  const {
    inviteReader,
    error,
    receivedCount,
    isDecrypting,
    handleDecryptPending,
  } = useInviteActions();

  if (isDetail) {
    // Detail view: custom header with back button, invite detail via Outlet
    return (
      <div className="flex flex-col h-dvh overflow-hidden bg-background w-full">
        <header className="w-full z-50 h-14 border-b bg-background flex items-center px-2 gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 px-2"
            onClick={() => navigate("/invites")}
          >
            <IconArrowLeft size={18} />
            <span>Invites</span>
          </Button>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
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
            <Outlet />
          </PageBody>
        </main>
        <MobileBottomNav />
      </div>
    );
  }

  // List view: standard top header, scrollable invite list
  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-background w-full">
      <MobileTopHeader title="Invites" />
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        {!inviteReader && (
          <Alert variant="destructive" className="m-3">
            <AlertDescription>
              Invitation reader is not initialized (not signed in yet?).
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" className="m-3">
            <IconAlertCircle className="w-4 h-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {receivedCount > 0 && (
          <Alert className="m-3">
            <IconLock className="w-4 h-4" />
            <AlertDescription>
              <div className="flex items-center justify-between gap-4">
                <span>
                  {receivedCount} encrypted invite
                  {receivedCount === 1 ? "" : "s"} waiting
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDecryptPending}
                  disabled={isDecrypting}
                >
                  {isDecrypting ? "Decrypting..." : "Decrypt"}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
        <InviteListContent />
      </main>
      <MobileBottomNav />
    </div>
  );
}

function InvitesPage() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileInvitesLayout /> : <DesktopInvitesLayout />;
}

export default withActiveAccount(InvitesPage);

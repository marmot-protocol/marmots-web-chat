import {
  IconChevronRight,
  IconLogout,
  IconPlus,
  IconSettings,
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import { getDisplayName, getProfilePicture } from "applesauce-core/helpers";
import { npubEncode } from "applesauce-core/helpers/pointers";
import { use$ } from "applesauce-react/hooks";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { IconCopyButton } from "@/components/icon-copy-button";
import { PageBody } from "@/components/page-body";
import { PageHeader } from "@/components/page-header";
import { QRIconButton } from "@/components/qr-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import { DesktopShell } from "@/layouts/desktop/shell";
import { MobileShell } from "@/layouts/mobile/shell";
import databaseBroker from "@/lib/account-database";
import accountManager from "@/lib/accounts";
import { eventStore } from "@/lib/nostr";

// ============================================================================
// OtherAccountItem — extracted so use$() is not called inside a .map() loop
// ============================================================================

/**
 * A single non-active account row in the account switcher list.
 *
 * @param account - The account to display.
 * @param onSwitch - Called when the user taps the row.
 */
function OtherAccountItem({
  account,
  onSwitch,
}: {
  account: { id: string; pubkey: string };
  onSwitch: () => void;
}) {
  const profile = use$(
    () => eventStore.profile(account.pubkey),
    [account.pubkey],
  );
  const avatar = getProfilePicture(
    profile,
    `https://api.dicebear.com/7.x/identicon/svg?seed=${account.pubkey}`,
  );
  const name = getDisplayName(profile, account.pubkey.slice(0, 16));

  return (
    <Button
      variant="outline"
      className="w-full justify-start h-auto py-3"
      onClick={onSwitch}
    >
      <Avatar className="h-8 w-8 rounded-lg mr-3">
        <AvatarImage src={avatar} alt={name} />
        <AvatarFallback className="rounded-lg">
          {name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0 text-left">
        <div className="font-semibold truncate text-sm">{name}</div>
        <div className="text-xs text-muted-foreground truncate font-mono">
          {account.pubkey.slice(0, 8)}...{account.pubkey.slice(-8)}
        </div>
      </div>
      <IconChevronRight className="h-4 w-4 ml-2 shrink-0" />
    </Button>
  );
}

// ============================================================================
// useProfilePageState — shared logic for both mobile and desktop
// ============================================================================

/**
 * Centralises all state, derived values, and event handlers for the profile
 * page so they can be shared between the mobile and desktop variants.
 */
function useProfilePageState() {
  const navigate = useNavigate();
  const active = use$(accountManager.active$);
  const accounts = use$(accountManager.accounts$) ?? [];
  const [showClearDataDialog, setShowClearDataDialog] = useState(false);
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const activeProfile = use$(
    () => active && eventStore.profile(active.pubkey),
    [active?.pubkey],
  );

  const activeAvatar = active
    ? getProfilePicture(
        activeProfile ?? undefined,
        `https://api.dicebear.com/7.x/identicon/svg?seed=${active.pubkey}`,
      )
    : "";
  const activeName = active
    ? getDisplayName(activeProfile ?? undefined, active.pubkey.slice(0, 16))
    : "";

  const handleSwitchAccount = (accountId: string) => {
    accountManager.setActive(accountId);
    navigate("/");
  };

  const handleClearData = async () => {
    if (!active) return;
    setIsClearing(true);
    try {
      await databaseBroker.purgeDatabase(active.pubkey);
      window.location.reload();
    } catch (error) {
      console.error("Failed to clear data:", error);
      setIsClearing(false);
    }
  };

  const handleSignOut = async () => {
    if (!active) return;
    try {
      await databaseBroker.purgeDatabase(active.pubkey);
    } catch (error) {
      console.error("Failed to clear data during sign out:", error);
    } finally {
      accountManager.removeAccount(active.id);
      navigate("/signin");
    }
  };

  const handleSignIn = () => {
    navigate("/signin");
  };

  const otherAccounts = accounts.filter((acc) => acc.id !== active?.id);

  return {
    active,
    activeProfile,
    activeAvatar,
    activeName,
    otherAccounts,
    showClearDataDialog,
    setShowClearDataDialog,
    showSignOutDialog,
    setShowSignOutDialog,
    isClearing,
    handleSwitchAccount,
    handleClearData,
    handleSignOut,
    handleSignIn,
  };
}

// ============================================================================
// OtherAccountItemFlush — flush row variant for mobile
// ============================================================================

/**
 * A single non-active account row styled as a flush list item (no border/card).
 */
function OtherAccountItemFlush({
  account,
  onSwitch,
}: {
  account: { id: string; pubkey: string };
  onSwitch: () => void;
}) {
  const profile = use$(
    () => eventStore.profile(account.pubkey),
    [account.pubkey],
  );
  const avatar = getProfilePicture(
    profile,
    `https://api.dicebear.com/7.x/identicon/svg?seed=${account.pubkey}`,
  );
  const name = getDisplayName(profile, account.pubkey.slice(0, 16));

  return (
    <button
      onClick={onSwitch}
      className="flex w-full items-center gap-4 px-4 py-3.5 hover:bg-muted/50 transition-colors"
    >
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarImage src={avatar} alt={name} />
        <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col flex-1 min-w-0 text-left">
        <span className="text-sm font-medium leading-tight truncate">
          {name}
        </span>
        <span className="text-xs text-muted-foreground mt-0.5 font-mono">
          {account.pubkey.slice(0, 8)}…{account.pubkey.slice(-8)}
        </span>
      </div>
      <IconChevronRight size={16} className="shrink-0 text-muted-foreground" />
    </button>
  );
}

// ============================================================================
// ProfileContent — desktop variant (cards + borders)
// ============================================================================

interface ProfileContentProps {
  state: ReturnType<typeof useProfilePageState>;
}

/** Dialogs shared by both variants — no layout, pure logic. */
function ProfileDialogs({
  state,
}: {
  state: ReturnType<typeof useProfilePageState>;
}) {
  const {
    showClearDataDialog,
    setShowClearDataDialog,
    showSignOutDialog,
    setShowSignOutDialog,
    isClearing,
    handleClearData,
    handleSignOut,
  } = state;

  return (
    <>
      {/* Clear Data Dialog */}
      <AlertDialog
        open={showClearDataDialog}
        onOpenChange={setShowClearDataDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Local Data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all messages, key packages, and group
              data stored on this device. This action cannot be undone. The page
              will reload after clearing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearData}
              disabled={isClearing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isClearing ? "Clearing..." : "Clear Data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sign Out Dialog */}
      <AlertDialog open={showSignOutDialog} onOpenChange={setShowSignOutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign Out &amp; Clear Data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will sign you out and permanently delete all local data
              associated with this account, including messages, key packages,
              and group information. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSignOut}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sign Out &amp; Clear Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Desktop profile page body — avatar, public keys, account switcher, danger
 * zone. Uses Cards and borders, wrapped by PageBody.
 */
function ProfileContentDesktop({ state }: ProfileContentProps) {
  const {
    active,
    activeProfile,
    activeAvatar,
    activeName,
    otherAccounts,
    setShowClearDataDialog,
    setShowSignOutDialog,
    isClearing,
    handleSwitchAccount,
    handleSignIn,
  } = state;

  if (!active) {
    return (
      <div className="space-y-6">
        <Card className="max-w-2xl mx-auto">
          <CardHeader className="text-center">
            <CardTitle>No Account Active</CardTitle>
            <CardDescription>
              Sign in or create an account to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleSignIn} className="w-full">
              <IconUser size={16} />
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const npub = npubEncode(active.pubkey);

  return (
    <div className="space-y-6">
      {/* Profile Card */}
      <Card>
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <Avatar className="h-24 w-24 rounded-2xl">
              <AvatarImage src={activeAvatar} alt={activeName} />
              <AvatarFallback className="rounded-2xl text-2xl">
                {activeName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
          <div>
            <CardTitle className="text-2xl">{activeName}</CardTitle>
            <CardDescription className="mt-2">
              {activeProfile?.about ?? "No bio available"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">
              Public Key (npub)
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-muted p-2 rounded truncate">
                {npub}
              </code>
              <IconCopyButton text={npub} variant="outline" size="icon" />
              <QRIconButton data={npub} variant="outline" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">
              Public Key (hex)
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-muted p-2 rounded truncate">
                {active.pubkey}
              </code>
              <IconCopyButton
                text={active.pubkey}
                variant="outline"
                size="icon"
              />
              <QRIconButton data={active.pubkey} variant="outline" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Switcher */}
      <div className="flex flex-col gap-2">
        {otherAccounts.length > 0 && (
          <div className="space-y-2">
            {otherAccounts.map((account) => (
              <OtherAccountItem
                key={account.id}
                account={account}
                onSwitch={() => handleSwitchAccount(account.id)}
              />
            ))}
          </div>
        )}
        <Button asChild variant="outline" className="w-full">
          <Link to="/settings/accounts">
            <IconSettings size={16} />
            Manage Accounts
          </Link>
        </Button>
        <Button onClick={handleSignIn} variant="outline" className="w-full">
          <IconPlus size={16} />
          Add Another Account
        </Button>
      </div>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible actions that will delete your local data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            className="w-full justify-start text-destructive hover:text-destructive"
            onClick={() => setShowClearDataDialog(true)}
            disabled={isClearing}
          >
            <IconTrash size={16} />
            {isClearing ? "Clearing..." : "Clear All Local Data"}
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start text-destructive hover:text-destructive"
            onClick={() => setShowSignOutDialog(true)}
          >
            <IconLogout size={16} />
            Sign Out &amp; Clear Data
          </Button>
        </CardContent>
      </Card>

      <ProfileDialogs state={state} />
    </div>
  );
}

// ============================================================================
// ProfileContentMobile — flush, borderless list layout
// ============================================================================

/**
 * Mobile profile page body — flush sections separated by dividers, no cards.
 * Follows the same iOS-style list pattern used in settings/index.tsx.
 */
function ProfileContentMobile({ state }: ProfileContentProps) {
  const {
    active,
    activeProfile,
    activeAvatar,
    activeName,
    otherAccounts,
    setShowClearDataDialog,
    setShowSignOutDialog,
    isClearing,
    handleSwitchAccount,
    handleSignIn,
  } = state;

  if (!active) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
        <IconUser size={40} className="text-muted-foreground" />
        <div>
          <p className="font-medium">No Account Active</p>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in or create an account to get started
          </p>
        </div>
        <Button onClick={handleSignIn} className="w-full max-w-xs">
          Sign In
        </Button>
      </div>
    );
  }

  const npub = npubEncode(active.pubkey);

  return (
    <div className="flex flex-col">
      {/* Avatar + name hero */}
      <div className="flex flex-col items-center gap-3 py-8 px-4 border-b">
        <Avatar className="h-20 w-20">
          <AvatarImage src={activeAvatar} alt={activeName} />
          <AvatarFallback className="text-xl">
            {activeName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="text-center">
          <p className="text-lg font-semibold">{activeName}</p>
          {activeProfile?.about && (
            <p className="text-sm text-muted-foreground mt-0.5 max-w-xs">
              {activeProfile.about}
            </p>
          )}
        </div>
      </div>

      {/* Public keys — flush rows */}
      <div className="border-b">
        <div className="px-4 pt-4 pb-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Public Keys
          </p>
        </div>
        <ul className="divide-y">
          <li className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">npub</p>
              <code className="text-xs font-mono truncate block">{npub}</code>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <IconCopyButton text={npub} variant="ghost" size="icon" />
              <QRIconButton data={npub} variant="ghost" />
            </div>
          </li>
          <li className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">hex</p>
              <code className="text-xs font-mono truncate block">
                {active.pubkey}
              </code>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <IconCopyButton
                text={active.pubkey}
                variant="ghost"
                size="icon"
              />
              <QRIconButton data={active.pubkey} variant="ghost" />
            </div>
          </li>
        </ul>
      </div>

      {/* Other accounts */}
      {otherAccounts.length > 0 && (
        <div className="border-b">
          <div className="px-4 pt-4 pb-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Other Accounts
            </p>
          </div>
          <ul className="divide-y">
            {otherAccounts.map((account) => (
              <li key={account.id}>
                <OtherAccountItemFlush
                  account={account}
                  onSwitch={() => handleSwitchAccount(account.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Account actions — flush list */}
      <ul className="divide-y border-b">
        <li>
          <Link
            to="/settings/accounts"
            className="flex items-center gap-4 px-4 py-3.5 hover:bg-muted/50 transition-colors"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <IconSettings size={18} />
            </span>
            <span className="flex flex-col flex-1 min-w-0">
              <span className="text-sm font-medium leading-tight">
                Manage Accounts
              </span>
              <span className="text-xs text-muted-foreground mt-0.5">
                Switch, add, or remove accounts
              </span>
            </span>
            <IconChevronRight
              size={16}
              className="shrink-0 text-muted-foreground"
            />
          </Link>
        </li>
        <li>
          <button
            onClick={handleSignIn}
            className="flex w-full items-center gap-4 px-4 py-3.5 hover:bg-muted/50 transition-colors"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <IconPlus size={18} />
            </span>
            <span className="text-sm font-medium">Add Another Account</span>
          </button>
        </li>
      </ul>

      {/* Danger zone — flush destructive rows */}
      <div className="mt-6 border-t border-b">
        <div className="px-4 pt-4 pb-1">
          <p className="text-xs font-medium text-destructive uppercase tracking-wide">
            Danger Zone
          </p>
        </div>
        <ul className="divide-y">
          <li>
            <button
              onClick={() => setShowClearDataDialog(true)}
              disabled={isClearing}
              className="flex w-full items-center gap-4 px-4 py-3.5 hover:bg-destructive/5 transition-colors disabled:opacity-50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <IconTrash size={18} />
              </span>
              <span className="text-sm font-medium text-destructive">
                {isClearing ? "Clearing..." : "Clear All Local Data"}
              </span>
            </button>
          </li>
          <li>
            <button
              onClick={() => setShowSignOutDialog(true)}
              className="flex w-full items-center gap-4 px-4 py-3.5 hover:bg-destructive/5 transition-colors"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                <IconLogout size={18} />
              </span>
              <span className="text-sm font-medium text-destructive">
                Sign Out &amp; Clear Data
              </span>
            </button>
          </li>
        </ul>
      </div>

      <ProfileDialogs state={state} />
    </div>
  );
}

// ============================================================================
// Desktop
// ============================================================================

function DesktopProfilePage() {
  const state = useProfilePageState();

  return (
    <DesktopShell title="Profile">
      <PageHeader items={[{ label: "Home", to: "/" }, { label: "Profile" }]} />
      <PageBody>
        <div className="max-w-2xl mx-auto">
          <ProfileContentDesktop state={state} />
        </div>
      </PageBody>
    </DesktopShell>
  );
}

// ============================================================================
// Mobile
// ============================================================================

function MobileProfilePage() {
  const state = useProfilePageState();

  return (
    <MobileShell title="Profile">
      <ProfileContentMobile state={state} />
    </MobileShell>
  );
}

// ============================================================================
// Export
// ============================================================================

/**
 * Profile page — shows the active account's avatar, public keys, account
 * switcher, and danger-zone actions. Responsive: renders different shells for
 * mobile and desktop while sharing all content and logic.
 */
export default function ProfilePage() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileProfilePage /> : <DesktopProfilePage />;
}

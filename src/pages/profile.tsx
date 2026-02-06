import { getDisplayName, getProfilePicture } from "applesauce-core/helpers";
import { npubEncode } from "applesauce-core/helpers/pointers";
import { use$ } from "applesauce-react/hooks";
import {
  ChevronRightIcon,
  LogOutIcon,
  PlusIcon,
  SettingsIcon,
  UserIcon,
} from "lucide-react";
import { Link, useNavigate } from "react-router";

import { AppSidebar } from "@/components/app-sidebar";
import { IconCopyButton } from "@/components/icon-copy-button";
import { PageBody } from "@/components/page-body";
import { PageHeader } from "@/components/page-header";
import { QRIconButton } from "@/components/qr-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SidebarInset } from "@/components/ui/sidebar";
import accountManager from "@/lib/accounts";
import { eventStore } from "@/lib/nostr";

export default function ProfilePage() {
  const navigate = useNavigate();
  const active = use$(accountManager.active$);
  const accounts = use$(accountManager.accounts$) || [];

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
  };

  const handleSignOut = () => {
    if (active) {
      accountManager.removeAccount(active.id);
      navigate("/signin");
    }
  };

  const handleSignIn = () => {
    navigate("/signin");
  };

  // If no account is active
  if (!active) {
    return (
      <>
        <AppSidebar title="Profile" />
        <SidebarInset>
          <PageHeader
            items={[{ label: "Home", to: "/" }, { label: "Profile" }]}
          />
          <PageBody>
            <Card className="max-w-2xl mx-auto">
              <CardHeader className="text-center">
                <CardTitle>No Account Active</CardTitle>
                <CardDescription>
                  Sign in or create an account to get started
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleSignIn} className="w-full">
                  <UserIcon />
                  Sign In
                </Button>
              </CardContent>
            </Card>
          </PageBody>
        </SidebarInset>
      </>
    );
  }

  const npub = npubEncode(active.pubkey);
  const otherAccounts = accounts.filter((acc) => acc.id !== active.id);

  return (
    <>
      <AppSidebar title="Profile" />
      <SidebarInset>
        <PageHeader
          items={[{ label: "Home", to: "/" }, { label: "Profile" }]}
        />
        <PageBody>
          <div className="max-w-2xl mx-auto space-y-6">
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
                    {activeProfile?.about || "No bio available"}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Public Key Section */}
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

                {/* Hex Key Section */}
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

            {/* Account Switcher Card */}
            <div className="flex flex-col gap-2">
              {otherAccounts.length > 0 && (
                <div className="space-y-2">
                  {otherAccounts.map((account) => {
                    const profile = use$(
                      () => eventStore.profile(account.pubkey),
                      [account.pubkey],
                    );
                    const avatar = getProfilePicture(
                      profile,
                      `https://api.dicebear.com/7.x/identicon/svg?seed=${account.pubkey}`,
                    );
                    const name = getDisplayName(
                      profile,
                      account.pubkey.slice(0, 16),
                    );

                    return (
                      <Button
                        key={account.id}
                        variant="outline"
                        className="w-full justify-start h-auto py-3"
                        onClick={() => handleSwitchAccount(account.id)}
                      >
                        <Avatar className="h-8 w-8 rounded-lg mr-3">
                          <AvatarImage src={avatar} alt={name} />
                          <AvatarFallback className="rounded-lg">
                            {name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0 text-left">
                          <div className="font-semibold truncate text-sm">
                            {name}
                          </div>
                          <div className="text-xs text-muted-foreground truncate font-mono">
                            {account.pubkey.slice(0, 8)}...
                            {account.pubkey.slice(-8)}
                          </div>
                        </div>
                        <ChevronRightIcon className="h-4 w-4 ml-2 shrink-0" />
                      </Button>
                    );
                  })}
                </div>
              )}
              <Button asChild variant="outline" className="w-full">
                <Link to="/settings/accounts">
                  <SettingsIcon className="h-4 w-4" />
                  Manage Accounts
                </Link>
              </Button>
              <Button
                onClick={handleSignIn}
                variant="outline"
                className="w-full"
              >
                <PlusIcon className="h-4 w-4" />
                Add Another Account
              </Button>
            </div>

            <Button
              variant="outline"
              className="w-full justify-start text-destructive hover:text-destructive"
              onClick={handleSignOut}
            >
              <LogOutIcon className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </PageBody>
      </SidebarInset>
    </>
  );
}

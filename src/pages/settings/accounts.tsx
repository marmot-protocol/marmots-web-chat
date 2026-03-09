import { hexToBytes } from "@noble/hashes/utils.js";
import { npubEncode, nsecEncode } from "applesauce-core/helpers/pointers";
import { use$ } from "applesauce-react/hooks";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";

import { UserAvatar, UserName } from "@/components/nostr-user";
import { PageBody } from "@/components/page-body";
import { PageHeader } from "@/components/page-header";
import QRButton from "@/components/qr-button";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import accountManager from "@/lib/accounts";
import { PrivateKeyAccount } from "applesauce-accounts/accounts";

function AccountItem({
  account,
  isActive,
  onSwitch,
  onRemove,
}: {
  account: { id: string; pubkey: string };
  isActive: boolean;
  onSwitch: () => void;
  onRemove: () => void;
}) {
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const isPrivateKeyAccount = account instanceof PrivateKeyAccount;

  const getPrivateKey = () => {
    if (!isPrivateKeyAccount) return null;
    try {
      const serialized = (account as PrivateKeyAccount).toJSON();
      const keyBytes = hexToBytes(serialized.signer.key);
      return nsecEncode(keyBytes);
    } catch {
      return null;
    }
  };

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3 pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <UserAvatar pubkey={account.pubkey} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold truncate">
                <UserName pubkey={account.pubkey} />
              </div>
              <code className="block truncate select-all font-mono text-xs text-muted-foreground">
                {account.pubkey}
              </code>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            <div className="flex items-center gap-1">
              <QRButton
                data={npubEncode(account.pubkey)}
                label="npub"
                variant="ghost"
                size="sm"
              />
              <QRButton
                data={account.pubkey}
                label="hex"
                variant="ghost"
                size="sm"
              />
            </div>
            {isPrivateKeyAccount && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPrivateKey(!showPrivateKey)}
              >
                {showPrivateKey ? "Hide Key" : "Export Key"}
              </Button>
            )}
            <Button
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={onSwitch}
              disabled={isActive}
            >
              Switch
            </Button>
            <Button variant="destructive" size="sm" onClick={onRemove}>
              Remove
            </Button>
          </div>
        </div>
        {showPrivateKey && isPrivateKeyAccount && (
          <div className="space-y-2 sm:ml-13">
            <div className="text-sm text-muted-foreground">
              Private Key (nsec format)
            </div>
            <Input
              readOnly
              value={getPrivateKey() || "Error retrieving key"}
              className="font-mono text-xs"
              onClick={(e) => e.currentTarget.select()}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsAccountsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const accounts = use$(accountManager.accounts$) || [];
  const activeAccount = use$(accountManager.active$);
  const [removeAccountId, setRemoveAccountId] = useState<string | null>(null);

  const handleSwitchAccount = (accountId: string) => {
    accountManager.setActive(accountId);
    navigate("/");
  };

  const handleRemoveAccount = (accountId: string) => {
    setRemoveAccountId(accountId);
  };

  const confirmRemoveAccount = () => {
    if (removeAccountId) {
      accountManager.removeAccount(removeAccountId);
      setRemoveAccountId(null);
    }
  };

  return (
    <>
      <PageHeader
        items={[
          { label: "Home", to: "/" },
          { label: "Settings", to: "/settings" },
          { label: "Accounts" },
        ]}
      />
      <PageBody>
        <div className="flex flex-col gap-3 sm:gap-4">
          {accounts.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No accounts configured. Add an account to get started.
            </div>
          ) : (
            accounts.map((account) => {
              const isActive = activeAccount?.id === account.id;
              return (
                <AccountItem
                  key={account.id}
                  account={account}
                  isActive={isActive}
                  onSwitch={() => handleSwitchAccount(account.id)}
                  onRemove={() => handleRemoveAccount(account.id)}
                />
              );
            })
          )}
        </div>

        <div className="mt-4 flex w-full gap-2">
          <Button asChild className="min-w-0 flex-1 sm:flex-initial">
            <Link
              to={{ pathname: "/signin", search: `?to=${location.pathname}` }}
            >
              Add Account
            </Link>
          </Button>
        </div>
      </PageBody>

      <AlertDialog
        open={removeAccountId !== null}
        onOpenChange={(open) => !open && setRemoveAccountId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this account? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemoveAccount}
              variant="destructive"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

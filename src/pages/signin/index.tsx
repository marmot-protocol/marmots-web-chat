import { UserAvatar, UserName } from "@/components/nostr-user";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import accountManager from "@/lib/accounts";
import { use$ } from "applesauce-react/hooks";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import BunkerTab from "./bunker";
import ConnectQrTab from "./connect-qr";
import ExtensionTab from "./extension";
import CreateUserTab from "./create";
import ExistingKeyTab from "./existing-key";

type SignInMethod =
  | "accounts"
  | "existing"
  | "extension"
  | "bunker"
  | "qr"
  | "create";

interface AccountCardProps {
  account: { id: string; pubkey: string };
  isActive: boolean;
  onSwitch: () => void;
}

function AccountCard({ account, isActive, onSwitch }: AccountCardProps) {
  return (
    <button
      onClick={onSwitch}
      disabled={isActive}
      className={`w-full flex items-center gap-4 p-4 rounded-lg border transition-colors ${
        isActive
          ? "border-primary bg-primary/5 cursor-default"
          : "border-border hover:bg-accent hover:border-accent-foreground cursor-pointer"
      }`}
    >
      <UserAvatar pubkey={account.pubkey} size="lg" />
      <div className="flex-1 text-left min-w-0">
        <div className="font-semibold truncate">
          <UserName pubkey={account.pubkey} />
        </div>
        <code className="text-xs text-muted-foreground truncate block">
          {account.pubkey.slice(0, 16)}...{account.pubkey.slice(-16)}
        </code>
      </div>
      {isActive && (
        <div className="text-sm text-primary font-medium">Active</div>
      )}
    </button>
  );
}

interface MethodButtonProps {
  label: string;
  description: string;
  isActive: boolean;
  onClick: () => void;
}

function MethodButton({
  label,
  description,
  isActive,
  onClick,
}: MethodButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between p-4 rounded-lg border transition-colors text-left ${
        isActive
          ? "border-primary bg-primary/5"
          : "border-border hover:bg-accent hover:border-accent-foreground"
      }`}
    >
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
      <div
        className={`w-2 h-2 rounded-full shrink-0 ml-3 ${isActive ? "bg-primary" : "bg-transparent"}`}
      />
    </button>
  );
}

const METHOD_LABELS: Record<
  Exclude<SignInMethod, "accounts">,
  { label: string; description: string }
> = {
  create: { label: "New User", description: "Create a fresh Nostr identity" },
  existing: {
    label: "Existing Key",
    description: "Sign in with your nsec or hex key",
  },
  extension: {
    label: "Extension",
    description: "Use a browser extension like Alby",
  },
  bunker: {
    label: "Bunker",
    description: "Connect via a remote signing bunker",
  },
  qr: { label: "QR Code", description: "Scan with a mobile signer app" },
};

function MobileSignInContent({
  activeTab,
  setActiveTab,
  accounts,
  activeAccount,
  onSwitchAccount,
  onSuccess,
}: {
  activeTab: SignInMethod;
  setActiveTab: (tab: SignInMethod) => void;
  accounts: { id: string; pubkey: string }[];
  activeAccount: { id: string } | null | undefined;
  onSwitchAccount: (id: string) => void;
  onSuccess: () => void;
}) {
  const isShowingAccounts = activeTab === "accounts";
  const isShowingForm = activeTab !== "accounts";

  return (
    <div className="space-y-4">
      {/* Existing accounts list — shown at top when accounts exist */}
      {accounts.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground px-1">
            Existing Accounts
          </p>
          {accounts.map((account) => {
            const isActive = activeAccount?.id === account.id;
            return (
              <AccountCard
                key={account.id}
                account={account}
                isActive={isActive}
                onSwitch={() => onSwitchAccount(account.id)}
              />
            );
          })}
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-2 text-xs text-muted-foreground">
                or sign in another way
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Method selector */}
      {(!isShowingAccounts || accounts.length === 0) && (
        <div className="space-y-2">
          {(
            Object.entries(METHOD_LABELS) as [
              Exclude<SignInMethod, "accounts">,
              { label: string; description: string },
            ][]
          ).map(([value, { label, description }]) => (
            <MethodButton
              key={value}
              label={label}
              description={description}
              isActive={activeTab === value}
              onClick={() => setActiveTab(value)}
            />
          ))}
        </div>
      )}

      {/* When accounts exist, always show method selector below the divider */}
      {accounts.length > 0 && isShowingAccounts && (
        <div className="space-y-2">
          {(
            Object.entries(METHOD_LABELS) as [
              Exclude<SignInMethod, "accounts">,
              { label: string; description: string },
            ][]
          ).map(([value, { label, description }]) => (
            <MethodButton
              key={value}
              label={label}
              description={description}
              isActive={false}
              onClick={() => setActiveTab(value)}
            />
          ))}
        </div>
      )}

      {/* Active form */}
      {isShowingForm && (
        <div className="pt-2">
          {activeTab === "create" && <CreateUserTab onSuccess={onSuccess} />}
          {activeTab === "existing" && <ExistingKeyTab onSuccess={onSuccess} />}
          {activeTab === "extension" && <ExtensionTab onSuccess={onSuccess} />}
          {activeTab === "bunker" && <BunkerTab onSuccess={onSuccess} />}
          {activeTab === "qr" && <ConnectQrTab onSuccess={onSuccess} />}
        </div>
      )}
    </div>
  );
}

export default function SignInIndexPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const accounts = use$(accountManager.accounts$) || [];
  const activeAccount = use$(accountManager.active$);
  const [activeTab, setActiveTab] = useState<SignInMethod>(
    accounts.length > 0 ? "accounts" : "create",
  );

  const handleSwitchAccount = (accountId: string) => {
    accountManager.setActive(accountId);
    const from = (location.state as { from?: string })?.from ?? "/";
    navigate(from);
  };

  const handleSuccess = () => {
    const from = (location.state as { from?: string })?.from ?? "/";
    navigate(from);
  };

  if (isMobile) {
    return (
      <MobileSignInContent
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        accounts={accounts}
        activeAccount={activeAccount}
        onSwitchAccount={handleSwitchAccount}
        onSuccess={handleSuccess}
      />
    );
  }

  return (
    <div>
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as SignInMethod)}
      >
        <TabsList
          className={`grid w-full mb-6 ${accounts.length > 0 ? "grid-cols-6" : "grid-cols-5"}`}
        >
          {accounts.length > 0 && (
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
          )}
          <TabsTrigger value="create">New User</TabsTrigger>
          <TabsTrigger value="existing">Existing Key</TabsTrigger>
          <TabsTrigger value="extension">Extension</TabsTrigger>
          <TabsTrigger value="bunker">Bunker</TabsTrigger>
          <TabsTrigger value="qr">QR Code</TabsTrigger>
        </TabsList>

        {accounts.length > 0 && (
          <TabsContent value="accounts">
            <div className="space-y-2">
              {accounts.map((account) => {
                const isActive = activeAccount?.id === account.id;
                return (
                  <AccountCard
                    key={account.id}
                    account={account}
                    isActive={isActive}
                    onSwitch={() => handleSwitchAccount(account.id)}
                  />
                );
              })}
            </div>
          </TabsContent>
        )}

        <TabsContent value="create">
          <CreateUserTab onSuccess={handleSuccess} />
        </TabsContent>
        <TabsContent value="existing">
          <ExistingKeyTab onSuccess={handleSuccess} />
        </TabsContent>
        <TabsContent value="extension">
          <ExtensionTab onSuccess={handleSuccess} />
        </TabsContent>
        <TabsContent value="bunker">
          <BunkerTab onSuccess={handleSuccess} />
        </TabsContent>
        <TabsContent value="qr">
          <ConnectQrTab onSuccess={handleSuccess} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

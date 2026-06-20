import { UserAvatar, UserName } from "@/components/nostr-user";
import { useIsMobile } from "@/hooks/use-mobile";
import accountManager from "@/lib/accounts";
import { use$ } from "applesauce-react/hooks";
import { useLocation, useNavigate } from "react-router";

type SignInMethod = "create" | "existing-key" | "extension" | "bunker" | "qr";

const METHODS: { value: SignInMethod; label: string; description: string }[] = [
  {
    value: "create",
    label: "New User",
    description: "Create a fresh Nostr identity",
  },
  {
    value: "existing-key",
    label: "Existing Key",
    description: "Sign in with your nsec or hex key",
  },
  {
    value: "extension",
    label: "Extension",
    description: "Use a browser extension like Alby",
  },
  {
    value: "bunker",
    label: "Bunker",
    description: "Connect via a remote signing bunker",
  },
  {
    value: "qr",
    label: "QR Code",
    description: "Scan with a mobile signer app",
  },
];

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

export default function SignInIndexPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const accounts = use$(accountManager.accounts$) ?? [];
  const activeAccount = use$(accountManager.active$);

  const handleSwitchAccount = (accountId: string) => {
    accountManager.setActive(accountId);
    navigate("/");
  };

  const navigateTo = (method: SignInMethod) => {
    navigate(`/signin/${method}`, { state: location.state, replace: true });
  };

  if (isMobile) {
    return (
      <div className="space-y-4">
        {/* Existing accounts */}
        {accounts.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground px-1">
              Existing Accounts
            </p>
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                isActive={activeAccount?.id === account.id}
                onSwitch={() => handleSwitchAccount(account.id)}
              />
            ))}
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

        {/* Method list — each navigates to its own route */}
        <div className="space-y-2">
          {METHODS.map(({ value, label, description }) => (
            <button
              key={value}
              onClick={() => navigateTo(value)}
              className="w-full flex items-center justify-between p-4 rounded-lg border border-border hover:bg-accent hover:border-accent-foreground transition-colors text-left"
            >
              <div>
                <div className="font-medium">{label}</div>
                <div className="text-sm text-muted-foreground">
                  {description}
                </div>
              </div>
              <svg
                className="size-4 text-muted-foreground shrink-0 ml-3"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Desktop: show saved accounts list (tabs nav is rendered by the layout above us)
  return (
    <div className="space-y-2">
      {accounts.length > 0 ? (
        accounts.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            isActive={activeAccount?.id === account.id}
            onSwitch={() => handleSwitchAccount(account.id)}
          />
        ))
      ) : (
        <p className="text-sm text-muted-foreground text-center py-8">
          Select a sign-in method above.
        </p>
      )}
    </div>
  );
}

import { IconArrowLeft } from "@tabler/icons-react";
import { use$ } from "applesauce-react/hooks";
import { Outlet, useLocation, useMatch, useNavigate } from "react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import accountManager from "@/lib/accounts";

type SignInMethod = "create" | "existing-key" | "extension" | "bunker" | "qr";

const METHODS: { value: SignInMethod; label: string }[] = [
  { value: "create", label: "New User" },
  { value: "existing-key", label: "Existing Key" },
  { value: "extension", label: "Extension" },
  { value: "bunker", label: "Bunker" },
  { value: "qr", label: "QR Code" },
];

/** Returns the active tab value derived from the current pathname, or undefined for the index. */
function useActiveTab(): SignInMethod | undefined {
  const { pathname } = useLocation();
  for (const method of METHODS) {
    if (pathname.endsWith(`/${method.value}`)) return method.value;
  }
  return undefined;
}

function MobileSignInLayout() {
  const navigate = useNavigate();
  const activeAccount = use$(accountManager.active$);
  // True when we're on a sub-route like /signin/create, /signin/bunker, etc.
  const onSubRoute = useMatch("/signin/:method");

  const handleBack = () => {
    if (onSubRoute) {
      navigate("/signin");
    } else {
      navigate(-1);
    }
  };

  // Show back button on sub-routes always (to return to the list),
  // or on the index when an account already exists (to cancel adding another account).
  const showBack = !!onSubRoute || !!activeAccount;

  return (
    <div className="flex flex-col min-h-dvh bg-background overflow-hidden flex-1">
      <header className="relative flex items-center justify-center h-14 px-4 border-b shrink-0">
        {showBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="absolute left-2 top-1/2 -translate-y-1/2"
          >
            <IconArrowLeft />
          </Button>
        )}
        <h1 className="text-lg font-bold">Sign In</h1>
      </header>
      <div className="flex-1 p-4 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}

function DesktopSignInLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeAccount = use$(accountManager.active$);
  const accounts = use$(accountManager.accounts$) ?? [];
  const activeTab = useActiveTab();

  const handleBack = () => {
    navigate(-1);
  };

  const navigateTo = (method: SignInMethod) => {
    navigate(`/signin/${method}`, { state: location.state });
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 w-full min-h-screen">
      <div className="w-full max-w-3xl">
        <div className="relative mb-8">
          {activeAccount && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              className="absolute left-0 top-1/2 -translate-y-1/2"
            >
              <IconArrowLeft />
            </Button>
          )}
          <h1 className="text-2xl font-bold text-center">Sign In</h1>
        </div>

        {/* URL-driven tabs — always visible on desktop */}
        <Tabs value={activeTab ?? "accounts"}>
          <TabsList
            className={`grid w-full mb-6 ${accounts.length > 0 ? "grid-cols-6" : "grid-cols-5"}`}
          >
            {accounts.length > 0 && (
              <TabsTrigger
                value="accounts"
                onClick={() => navigate("/signin", { state: location.state })}
              >
                Accounts
              </TabsTrigger>
            )}
            {METHODS.map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                onClick={() => navigateTo(value)}
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Active sub-page or index content */}
        <Outlet />
      </div>
    </div>
  );
}

/**
 * Sign-in layout shell.
 *
 * Renders a custom mobile layout (no sidebar, no bottom nav) on small screens,
 * and the centered single-column desktop layout on larger screens.
 *
 * Mobile: the index route shows a method-selection list; tapping a method
 * navigates to its own sub-route so every form is a dedicated focused page.
 *
 * Desktop: URL-driven tabs are rendered in the layout (always visible), with
 * the active sub-page rendered via Outlet beneath them.
 */
export default function SignInPage() {
  const isMobile = useIsMobile();

  return isMobile ? <MobileSignInLayout /> : <DesktopSignInLayout />;
}

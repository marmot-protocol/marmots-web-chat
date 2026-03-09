import { IconArrowLeft } from "@tabler/icons-react";
import { use$ } from "applesauce-react/hooks";
import { Outlet, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import accountManager from "@/lib/accounts";

function MobileSignInLayout() {
  const navigate = useNavigate();
  const activeAccount = use$(accountManager.active$);

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <div className="flex flex-col min-h-dvh bg-background">
      <header className="relative flex items-center justify-center h-14 px-4 border-b shrink-0">
        {activeAccount && (
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
  const activeAccount = use$(accountManager.active$);

  const handleBack = () => {
    navigate(-1);
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
 */
export default function SignInPage() {
  const isMobile = useIsMobile();

  return isMobile ? <MobileSignInLayout /> : <DesktopSignInLayout />;
}

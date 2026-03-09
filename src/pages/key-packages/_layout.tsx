import {
  getKeyPackageClient,
  isLastResortExtension,
  KeyPackageEntry,
} from "@internet-privacy/marmot-ts";
import { bytesToHex, relaySet } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { SettingsIcon } from "lucide-react";
import { useMemo } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { combineLatest, map, shareReplay } from "rxjs";

import { AppSidebar } from "@/components/app-sidebar";
import { SubscriptionStatusButton } from "@/components/subscription-status-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarInset } from "@/components/ui/sidebar";
import { withActiveAccount } from "@/components/with-active-account";
import { useIsMobile } from "@/hooks/use-mobile";
import { user$ } from "@/lib/accounts";
import { keyPackageRelays$, publishedKeyPackages$ } from "@/lib/lifecycle";
import { liveKeyPackages$ } from "@/lib/marmot-client";
import { extraRelays$ } from "@/lib/settings";
import { formatTimeAgo } from "@/lib/time";
import { MobileShell } from "@/layouts/mobile/shell";

/** An observable of all relays to read key packages from */
const readRelays$ = combineLatest([
  user$.outboxes$,
  keyPackageRelays$,
  extraRelays$,
]).pipe(
  map((all) => relaySet(...all)),
  shareReplay(1),
);

function KeyPackageItem({ keyPackage }: { keyPackage: KeyPackageEntry }) {
  const location = useLocation();

  const linkTo = useMemo(
    () => `/key-packages/${bytesToHex(keyPackage.keyPackageRef)}`,
    [keyPackage.keyPackageRef],
  );
  const isActive = location.pathname === linkTo;
  const isLastResort = !!keyPackage.publicPackage.extensions.some(
    isLastResortExtension,
  );

  const latestEvent = keyPackage.published[keyPackage.published.length - 1];
  const client = latestEvent ? getKeyPackageClient(latestEvent) : undefined;
  const timeAgo = latestEvent
    ? formatTimeAgo(latestEvent.created_at)
    : "Unpublished";

  return (
    <Link
      to={linkTo}
      className={`hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight ${
        isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""
      }`}
    >
      <div className="flex w-full items-center gap-2 min-w-0">
        <span className="font-medium truncate">
          {client?.name || "Unknown Client"}
        </span>
        <span className="ml-auto flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">{timeAgo}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        {keyPackage.used && (
          <Badge variant="destructive" className="text-xs shrink-0">
            Used
          </Badge>
        )}
        {isLastResort && (
          <Badge variant="outline" className="text-xs shrink-0">
            Last Resort
          </Badge>
        )}
      </div>
    </Link>
  );
}

function DesktopKeyPackagesLayout() {
  const keyPackages = use$(liveKeyPackages$);
  use$(publishedKeyPackages$);

  return (
    <>
      <AppSidebar
        title="Key Packages"
        footer={
          <div className="flex">
            <Button asChild variant="ghost" size="icon">
              <Link to="/settings/marmot">
                <SettingsIcon />
              </Link>
            </Button>
            <SubscriptionStatusButton relays={readRelays$} />
          </div>
        }
      >
        <div className="flex flex-col">
          <Button asChild variant="default" className="m-2">
            <Link to="/key-packages/create">Create Key Package</Link>
          </Button>
          {keyPackages && keyPackages.length > 0 ? (
            keyPackages.map((pkg) => (
              <KeyPackageItem
                key={bytesToHex(pkg.keyPackageRef)}
                keyPackage={pkg}
              />
            ))
          ) : (
            <div className="p-4 text-sm text-muted-foreground text-center">
              {keyPackages === undefined ? "Loading..." : "No key packages yet"}
            </div>
          )}
        </div>

        <div className="p-4 text-sm text-muted-foreground text-center">
          Found {keyPackages?.length ?? 0} key packages
        </div>
      </AppSidebar>
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </>
  );
}

function MobileKeyPackagesLayout() {
  return <MobileShell title="Key Packages" />;
}

function KeyPackagesPage() {
  const isMobile = useIsMobile();
  return isMobile ? <MobileKeyPackagesLayout /> : <DesktopKeyPackagesLayout />;
}

export default withActiveAccount(KeyPackagesPage);

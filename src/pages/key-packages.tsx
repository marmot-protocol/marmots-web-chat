import { getKeyPackageClient } from "@internet-privacy/marmots";
import { bytesToHex, type NostrEvent, relaySet } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { useMemo } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { combineLatest, map, shareReplay } from "rxjs";

import { AppSidebar } from "@/components/app-sidebar";
import CipherSuiteBadge from "@/components/cipher-suite-badge";
import { SubscriptionStatusButton } from "@/components/subscription-status-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarInset } from "@/components/ui/sidebar";
import { withActiveAccount } from "@/components/with-active-account";
import { user$ } from "@/lib/accounts";
import { keyPackageRelays$, publishedKeyPackages$ } from "@/lib/lifecycle";
import { liveKeyPackages$ } from "@/lib/marmot-client";
import { extraRelays$ } from "@/lib/settings";
import { formatTimeAgo } from "@/lib/time";
import { SettingsIcon } from "lucide-react";
import { CiphersuiteId } from "ts-mls";

/** An observable of all relays to read key packages from */
const readRelays$ = combineLatest([
  user$.outboxes$,
  keyPackageRelays$,
  extraRelays$,
]).pipe(
  map((all) => relaySet(...all)),
  shareReplay(1),
);

function KeyPackageItem({
  keyPackage,
  event,
  isLocal,
}: {
  keyPackage: {
    keyPackageRef: Uint8Array;
    publicPackage: { cipherSuite: number };
  };
  event?: NostrEvent;
  isLocal: boolean;
}) {
  const location = useLocation();

  const linkTo = useMemo(
    () => `/key-packages/${bytesToHex(keyPackage.keyPackageRef)}`,
    [keyPackage.keyPackageRef],
  );
  const isActive = location.pathname === linkTo;

  const client = event ? getKeyPackageClient(event) : undefined;
  const timeAgo = event ? formatTimeAgo(event.created_at) : "Unpublished";

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
        {!isLocal && (
          <Badge variant="outline" className="text-xs ml-2 shrink-0">
            Not stored locally
          </Badge>
        )}
        <span className="ml-auto flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">{timeAgo}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <CipherSuiteBadge
          cipherSuite={keyPackage.publicPackage.cipherSuite as CiphersuiteId}
        />
      </div>
    </Link>
  );
}

function KeyPackagesPage() {
  // Local key packages from the manager — each entry includes its published Nostr events
  const localKeyPackages = use$(liveKeyPackages$);
  // Published key packages from relays — includes packages not stored locally
  const published = use$(publishedKeyPackages$);

  // Build display list: start from locally-stored packages (with their published events),
  // then add any relay-published packages that aren't in local storage.
  const displayItems = useMemo(() => {
    const seen = new Set<string>();
    const items: Array<{
      keyPackageRef: Uint8Array;
      publicPackage: { cipherSuite: number };
      event?: NostrEvent;
      isLocal: boolean;
    }> = [];

    // Add local key packages first — they have the richest data
    for (const entry of localKeyPackages ?? []) {
      const hexRef = bytesToHex(entry.keyPackageRef);
      if (seen.has(hexRef)) continue;
      seen.add(hexRef);
      // Use the most recent published event if available
      const event = entry.published?.[entry.published.length - 1];
      items.push({
        keyPackageRef: entry.keyPackageRef,
        publicPackage: entry.publicPackage,
        event,
        isLocal: true,
      });
    }

    // Add relay-published packages that aren't in local storage
    for (const pkg of published ?? []) {
      const hexRef = bytesToHex(pkg.keyPackageRef);
      if (seen.has(hexRef)) continue;
      seen.add(hexRef);
      items.push({
        keyPackageRef: pkg.keyPackageRef,
        publicPackage: pkg.keyPackage,
        event: pkg.event,
        isLocal: false,
      });
    }

    return items;
  }, [localKeyPackages, published]);

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
          {displayItems.length > 0 ? (
            displayItems.map((item) => (
              <KeyPackageItem
                key={bytesToHex(item.keyPackageRef)}
                keyPackage={item}
                event={item.event}
                isLocal={item.isLocal}
              />
            ))
          ) : (
            <div className="p-4 text-sm text-muted-foreground text-center">
              {published === undefined ? "Loading..." : "No key packages yet"}
            </div>
          )}
        </div>

        <div className="p-4 text-sm text-muted-foreground text-center">
          Found {displayItems.length} key packages
        </div>
      </AppSidebar>
      <SidebarInset>
        <Outlet />
      </SidebarInset>
    </>
  );
}

export default withActiveAccount(KeyPackagesPage);

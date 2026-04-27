import {
  getKeyPackageClient,
  isLastResortExtension,
  KEY_PACKAGE_RELAY_LIST_KIND,
  ListedKeyPackage,
} from "@internet-privacy/marmot-ts";
import { IconKey } from "@tabler/icons-react";
import { bytesToHex, relaySet } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { SettingsIcon } from "lucide-react";
import { ReactNode, useMemo } from "react";
import { Link, useLocation } from "react-router";
import { combineLatest, from, map, shareReplay } from "rxjs";
import { User } from "applesauce-common/casts/user";

import { SubscriptionStatusButton } from "@/components/subscription-status-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { withActiveAccount } from "@/components/with-active-account";
import { useIsMobile } from "@/hooks/use-mobile";
import { DesktopShell } from "@/layouts/desktop/shell";
import { MobileShell } from "@/layouts/mobile/shell";
import { user$ } from "@/lib/accounts";
import { keyPackageRelays$ } from "@/lib/lifecycle";
import { marmotClient$ } from "@/lib/marmot-client";
import { extraRelays$ } from "@/lib/settings";
import { formatTimeAgo } from "@/lib/time";

/** An observable of all relays to read key packages from */
const readRelays$ = combineLatest([
  user$.outboxes$,
  keyPackageRelays$,
  extraRelays$,
]).pipe(
  map((all) => relaySet(...all)),
  shareReplay(1),
);

// ============================================================================
// Sidebar building blocks
// ============================================================================

function SidebarSectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b">
      {children}
    </div>
  );
}

/** Prominent card shown at the top of the sidebar for the active client's key package. */
function CurrentKeyPackageCard({
  keyPackage,
  user,
}: {
  keyPackage: ListedKeyPackage;
  user: User;
}) {
  const location = useLocation();
  const linkTo = useMemo(
    () => `/key-packages/${bytesToHex(keyPackage.keyPackageRef)}`,
    [keyPackage.keyPackageRef],
  );
  const isActive = location.pathname === linkTo;
  const isLastResort = !!keyPackage.publicPackage.extensions.some(
    isLastResortExtension,
  );

  const outboxes = use$(user$.outboxes$);
  const event = use$(
    () =>
      user.replaceable(
        KEY_PACKAGE_RELAY_LIST_KIND,
        keyPackage.identifier,
        outboxes,
      ),
    [user, keyPackage.identifier, outboxes?.join(",")],
  );
  const client = event ? getKeyPackageClient(event) : undefined;
  const timeAgo = event ? formatTimeAgo(event.created_at) : "Unpublished";

  return (
    <Link
      to={linkTo}
      className={`flex flex-col gap-3 border-b p-4 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
        isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-primary text-primary-foreground">
          <IconKey size={20} />
        </span>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-sm font-medium truncate">
            {client?.name || "Unknown Client"}
          </span>
          <span className="text-xs text-muted-foreground">
            Published {timeAgo}
          </span>
        </div>
      </div>
      {(keyPackage.used || isLastResort) && (
        <div className="flex items-center gap-2 flex-wrap">
          {keyPackage.used && (
            <Badge variant="destructive" className="text-xs">
              Used
            </Badge>
          )}
          {isLastResort && (
            <Badge variant="outline" className="text-xs">
              Last Resort
            </Badge>
          )}
        </div>
      )}
    </Link>
  );
}

/** Empty-state card prompting the user to create a key package for this client. */
function CurrentKeyPackageEmptyState() {
  return (
    <div className="flex flex-col gap-3 border-b p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-muted text-muted-foreground">
          <IconKey size={20} />
        </span>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-sm font-medium">No key package</span>
          <span className="text-xs text-muted-foreground">
            Publish one so others can invite you to encrypted groups.
          </span>
        </div>
      </div>
      <Button asChild size="sm">
        <Link to="/key-packages/create">Create Key Package</Link>
      </Button>
    </div>
  );
}

function KeyPackageItem({
  keyPackage,
  user,
}: {
  keyPackage: ListedKeyPackage;
  user: User;
}) {
  const location = useLocation();

  const linkTo = useMemo(
    () => `/key-packages/${bytesToHex(keyPackage.keyPackageRef)}`,
    [keyPackage.keyPackageRef],
  );
  const isActive = location.pathname === linkTo;
  const isLastResort = !!keyPackage.publicPackage.extensions.some(
    isLastResortExtension,
  );

  const outboxes = use$(user$.outboxes$);
  const event = use$(
    () =>
      user.replaceable(
        KEY_PACKAGE_RELAY_LIST_KIND,
        keyPackage.identifier,
        outboxes,
      ),
    [user, keyPackage.identifier, outboxes?.join(",")],
  );

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
        <span className="ml-auto flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">{timeAgo}</span>
        </span>
      </div>
      {(keyPackage.used || isLastResort) && (
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
      )}
    </Link>
  );
}

// ============================================================================
// Layouts
// ============================================================================

function DesktopKeyPackagesLayout() {
  const client = use$(marmotClient$);
  const user = use$(user$)!;
  const keyPackages = use$(
    () => (client ? from(client.keyPackages.watchKeyPackages()) : undefined),
    [client],
  );

  const clientId = client?.keyPackages.clientId;

  const current = useMemo(
    () => keyPackages?.find((pkg) => pkg.identifier === clientId),
    [keyPackages, clientId],
  );
  const others = useMemo(
    () => keyPackages?.filter((pkg) => pkg.identifier !== clientId) ?? [],
    [keyPackages, clientId],
  );

  const footer = (
    <div className="flex">
      <Button asChild variant="ghost" size="icon">
        <Link to="/settings/marmot">
          <SettingsIcon />
        </Link>
      </Button>
      <SubscriptionStatusButton relays={readRelays$} />
    </div>
  );

  const sidebar = (
    <div className="flex flex-col">
      <SidebarSectionHeader>This client</SidebarSectionHeader>
      {keyPackages === undefined ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">
          Loading...
        </div>
      ) : current ? (
        <CurrentKeyPackageCard user={user} keyPackage={current} />
      ) : (
        <CurrentKeyPackageEmptyState />
      )}

      <SidebarSectionHeader>
        <span>Other key packages</span>
        <span className="ml-auto tabular-nums">{others.length}</span>
      </SidebarSectionHeader>
      {others.length > 0 ? (
        others.map((pkg) => (
          <KeyPackageItem
            key={bytesToHex(pkg.keyPackageRef)}
            keyPackage={pkg}
            user={user}
          />
        ))
      ) : (
        <div className="px-4 py-3 text-xs text-muted-foreground">
          {keyPackages === undefined
            ? ""
            : "No key packages from other clients."}
        </div>
      )}
    </div>
  );

  return (
    <DesktopShell title="Key Packages" sidebar={sidebar} footer={footer} />
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

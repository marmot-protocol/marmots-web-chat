import {
  ADDRESSABLE_KEY_PACKAGE_KIND,
  getKeyPackageClient,
  isLastResortExtension,
  ListedKeyPackage,
} from "@internet-privacy/marmot-ts";
import { IconChevronRight, IconKey } from "@tabler/icons-react";
import { bytesToHex } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { useMemo } from "react";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { liveKeyPackages$, marmotClient$ } from "@/lib/marmot-client";
import { formatTimeAgo } from "@/lib/time";

// ============================================================================
// Mobile current key package card — full-width, prominent, tappable
// ============================================================================

function MobileCurrentKeyPackageCard({
  keyPackage,
}: {
  keyPackage: ListedKeyPackage;
}) {
  const linkTo = useMemo(
    () => `/key-packages/${bytesToHex(keyPackage.keyPackageRef)}`,
    [keyPackage.keyPackageRef],
  );

  const isLastResort = keyPackage.publicPackage.extensions.some(
    isLastResortExtension,
  );

  const event = keyPackage.published?.find(
    (event) => event.kind === ADDRESSABLE_KEY_PACKAGE_KIND,
  );
  const client = event ? getKeyPackageClient(event) : undefined;
  const timeAgo = event ? formatTimeAgo(event.created_at) : "Unpublished";

  return (
    <Link
      to={linkTo}
      className="flex flex-col gap-3 p-4 hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center bg-primary text-primary-foreground">
          <IconKey size={22} />
        </span>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-base font-medium leading-tight truncate">
            {client?.name ?? "Unknown Client"}
          </span>
          <span className="text-sm text-muted-foreground mt-0.5">
            Published {timeAgo}
          </span>
        </div>
        <IconChevronRight
          size={18}
          className="shrink-0 text-muted-foreground"
        />
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

function MobileCurrentKeyPackageEmptyState() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center bg-muted text-muted-foreground">
          <IconKey size={22} />
        </span>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-base font-medium leading-tight">
            No key package
          </span>
          <span className="text-sm text-muted-foreground mt-0.5">
            Publish one so others can invite you to encrypted groups.
          </span>
        </div>
      </div>
      <Button asChild className="w-full">
        <Link to="/key-packages/create">Create Key Package</Link>
      </Button>
    </div>
  );
}

// ============================================================================
// MobileKeyPackageRow — a single tappable row for the "other" list
// ============================================================================

function MobileKeyPackageRow({ keyPackage }: { keyPackage: ListedKeyPackage }) {
  const linkTo = useMemo(
    () => `/key-packages/${bytesToHex(keyPackage.keyPackageRef)}`,
    [keyPackage.keyPackageRef],
  );

  const isLastResort = keyPackage.publicPackage.extensions.some(
    isLastResortExtension,
  );

  const event = keyPackage.published?.find(
    (event) => event.kind === ADDRESSABLE_KEY_PACKAGE_KIND,
  );
  const client = event ? getKeyPackageClient(event) : undefined;
  const timeAgo = event ? formatTimeAgo(event.created_at) : "Unpublished";

  return (
    <li>
      <Link
        to={linkTo}
        className="flex items-center gap-4 px-4 py-3.5 hover:bg-muted/50 transition-colors"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-muted text-muted-foreground">
          <IconKey size={18} />
        </span>
        <span className="flex flex-col flex-1 min-w-0">
          <span className="text-sm font-medium leading-tight truncate">
            {client?.name ?? "Unknown Client"}
          </span>
          <span className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs text-muted-foreground">{timeAgo}</span>
            {keyPackage.used && (
              <Badge variant="destructive" className="text-xs px-1 py-0 h-4">
                Used
              </Badge>
            )}
            {isLastResort && (
              <Badge variant="outline" className="text-xs px-1 py-0 h-4">
                Last Resort
              </Badge>
            )}
          </span>
        </span>
        <IconChevronRight
          size={16}
          className="shrink-0 text-muted-foreground"
        />
      </Link>
    </li>
  );
}

function MobileSectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30 border-y">
      {children}
    </div>
  );
}

// ============================================================================
// MobileKeyPackagesIndex — full-page list for mobile
// ============================================================================

function MobileKeyPackagesIndex() {
  const client = use$(marmotClient$);
  const keyPackages = use$(liveKeyPackages$);

  const clientId = client?.keyPackages.clientId;
  const current = useMemo(
    () => keyPackages?.find((pkg) => pkg.identifier === clientId),
    [keyPackages, clientId],
  );
  const others = useMemo(
    () => keyPackages?.filter((pkg) => pkg.identifier !== clientId) ?? [],
    [keyPackages, clientId],
  );

  if (keyPackages === undefined) {
    return (
      <div className="px-4 py-8 text-sm text-muted-foreground text-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <MobileSectionHeader>This client</MobileSectionHeader>
      {current ? (
        <MobileCurrentKeyPackageCard keyPackage={current} />
      ) : (
        <MobileCurrentKeyPackageEmptyState />
      )}

      <MobileSectionHeader>
        <span>Other key packages</span>
        <span className="ml-auto tabular-nums">{others.length}</span>
      </MobileSectionHeader>
      {others.length > 0 ? (
        <ul className="divide-y">
          {others.map((pkg) => (
            <MobileKeyPackageRow
              key={bytesToHex(pkg.keyPackageRef)}
              keyPackage={pkg}
            />
          ))}
        </ul>
      ) : (
        <div className="px-4 py-3 text-xs text-muted-foreground">
          No key packages from other clients.
        </div>
      )}
    </div>
  );
}

// ============================================================================
// DesktopKeyPackagesIndex — empty-state placeholder for desktop
// ============================================================================

function DesktopKeyPackagesIndex() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 text-center p-8">
      <span className="flex h-14 w-14 items-center justify-center bg-muted text-muted-foreground">
        <IconKey size={28} />
      </span>
      <div className="space-y-1">
        <p className="text-base font-medium">No key package selected</p>
        <p className="text-sm text-muted-foreground">
          Select a key package from the sidebar, or create a new one.
        </p>
      </div>
      <Button asChild>
        <Link to="/key-packages/create">Create Key Package</Link>
      </Button>
    </div>
  );
}

// ============================================================================
// KeyPackagesIndexPage
// ============================================================================

/**
 * Index route for /key-packages.
 *
 * On mobile: renders the same current/others structure used by the desktop
 * sidebar — a prominent card for this client's current key package at the
 * top, then a list of any other (legacy or differently-slotted) packages
 * below.
 * On desktop: renders an empty-state card prompting the user to select or
 * create a key package (the sidebar already provides the list).
 *
 * @example
 * ```tsx
 * <Route index element={<KeyPackagesIndexPage />} />
 * ```
 */
export default function KeyPackagesIndexPage() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobileKeyPackagesIndex />;
  }

  return <DesktopKeyPackagesIndex />;
}

import {
  getKeyPackageClient,
  isLastResortExtension,
  KeyPackageEntry,
} from "@internet-privacy/marmot-ts";
import { bytesToHex } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { IconChevronRight, IconKey } from "@tabler/icons-react";
import { useMemo } from "react";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { publishedKeyPackages$ } from "@/lib/lifecycle";
import { liveKeyPackages$ } from "@/lib/marmot-client";
import { formatTimeAgo } from "@/lib/time";

// ============================================================================
// MobileKeyPackageRow — a single tappable row for the mobile list
// ============================================================================

function MobileKeyPackageRow({ keyPackage }: { keyPackage: KeyPackageEntry }) {
  const linkTo = useMemo(
    () => `/key-packages/${bytesToHex(keyPackage.keyPackageRef)}`,
    [keyPackage.keyPackageRef],
  );

  const isLastResort = keyPackage.publicPackage.extensions.some(
    isLastResortExtension,
  );

  const latestEvent = keyPackage.published[keyPackage.published.length - 1];
  const client = latestEvent ? getKeyPackageClient(latestEvent) : undefined;
  const timeAgo = latestEvent
    ? formatTimeAgo(latestEvent.created_at)
    : "Unpublished";

  return (
    <li>
      <Link
        to={linkTo}
        className="flex items-center gap-4 px-4 py-3.5 hover:bg-muted/50 transition-colors"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
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

// ============================================================================
// MobileKeyPackagesIndex — full-page list for mobile
// ============================================================================

function MobileKeyPackagesIndex() {
  const keyPackages = use$(liveKeyPackages$);
  use$(publishedKeyPackages$);

  return (
    <div className="flex flex-col">
      <div className="p-4 border-b">
        <Button asChild variant="default" className="w-full">
          <Link to="/key-packages/create">Create Key Package</Link>
        </Button>
      </div>

      {keyPackages === undefined ? (
        <div className="px-4 py-8 text-sm text-muted-foreground text-center">
          Loading...
        </div>
      ) : keyPackages.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <IconKey size={24} />
          </span>
          <p className="text-sm text-muted-foreground">No key packages yet.</p>
        </div>
      ) : (
        <ul className="divide-y">
          {keyPackages.map((pkg) => (
            <MobileKeyPackageRow
              key={bytesToHex(pkg.keyPackageRef)}
              keyPackage={pkg}
            />
          ))}
        </ul>
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
      <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted text-muted-foreground">
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
 * On mobile: renders a full tappable list of all key packages with a
 * "Create Key Package" button at the top — mirrors the desktop sidebar.
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

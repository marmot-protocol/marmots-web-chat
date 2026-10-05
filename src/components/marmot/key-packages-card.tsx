import { useState } from "react";

import { getKeyPackageRelays } from "@internet-privacy/marmot-ts";
import type { ListedKeyPackage } from "@internet-privacy/marmot-ts/client";

import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useChat, useController, useKeyPackages } from "@/hooks/use-marmot";

function hex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString();
}

function KeyPackageRow({
  pkg,
  isCurrent,
}: {
  pkg: ListedKeyPackage;
  isCurrent: boolean;
}) {
  const published = pkg.published ?? [];
  const newest = published.reduce<(typeof published)[number] | null>(
    (acc, e) => (!acc || e.created_at > acc.created_at ? e : acc),
    null,
  );
  const relays = newest ? (getKeyPackageRelays(newest) ?? []) : [];
  const refHex = hex(pkg.keyPackageRef);

  return (
    <div className="py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{pkg.identifier ?? "(no slot)"}</span>
        {isCurrent && <Badge>this client</Badge>}
        {pkg.nonCurrent && <Badge variant="destructive">legacy proof</Badge>}
        {pkg.used ? (
          <Badge variant="secondary">used</Badge>
        ) : (
          <Badge variant="outline">unused</Badge>
        )}
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Ref</dt>
        <dd className="truncate font-mono" title={refHex}>
          {refHex}
        </dd>
        <dt className="text-muted-foreground">Cipher suite</dt>
        <dd className="font-mono">
          0x{pkg.publicPackage.cipherSuite.toString(16).padStart(4, "0")}
        </dd>
        <dt className="text-muted-foreground">Published</dt>
        <dd>
          {published.length === 0
            ? "not published"
            : `${published.length} event(s)`}
          {newest && (
            <span className="text-muted-foreground">
              {" "}
              · {formatDate(newest.created_at)}
            </span>
          )}
        </dd>
        {relays.length > 0 && (
          <>
            <dt className="text-muted-foreground">Relays</dt>
            <dd className="break-all">{relays.join(", ")}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

/** Manage this device's packages and explicitly retire incompatible legacy keys. */
export function KeyPackagesCard() {
  const controller = useController();
  const snapshot = useChat();
  const packages = useKeyPackages();
  const [confirmPurge, setConfirmPurge] = useState(false);
  const legacyCount = packages.filter((pkg) => pkg.nonCurrent).length;
  const clientId = snapshot?.clientId;
  const busy = snapshot?.busy ?? false;

  const sorted = [...packages].sort((a, b) => {
    // Current client first, then unused before used.
    const aCur = a.identifier === clientId ? 0 : 1;
    const bCur = b.identifier === clientId ? 0 : 1;
    if (aCur !== bCur) return aCur - bCur;
    return Number(a.used ?? false) - Number(b.used ?? false);
  });

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">Key packages</h2>
        <p className="text-xs text-muted-foreground">
          Key packages let others invite you. Your current client publishes
          under slot <span className="font-mono">{clientId ?? "…"}</span>.
        </p>
      </header>
      <div className="flex flex-col gap-3">
        {legacyCount > 0 && (
          <Alert>
            <AlertTitle>Legacy key packages</AlertTitle>
            <AlertDescription className="flex flex-col gap-2">
              <p>
                {legacyCount} package(s) use an older proof and cannot be used
                for new invites. Retiring them deletes their private keys and
                published events; pending older invites may no longer be
                joinable.
              </p>
              {confirmPurge ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() => {
                      setConfirmPurge(false);
                      void controller?.purgeLegacyKeyPackages();
                    }}
                  >
                    Confirm retirement
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setConfirmPurge(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  disabled={!controller || busy}
                  onClick={() => setConfirmPurge(true)}
                >
                  Retire legacy packages
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => controller?.publishKeyPackage()}
            disabled={!controller || busy}
          >
            Publish new
          </Button>
          <Button
            variant="outline"
            onClick={() => controller?.rotateKeyPackage()}
            disabled={!controller || busy}
          >
            Rotate current
          </Button>
        </div>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No key packages yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {sorted.map((pkg) => (
              <KeyPackageRow
                key={hex(pkg.keyPackageRef)}
                pkg={pkg}
                isCurrent={pkg.identifier === clientId}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

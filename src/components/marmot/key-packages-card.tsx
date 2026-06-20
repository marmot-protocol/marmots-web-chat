import { getKeyPackageRelays } from "@internet-privacy/marmot-ts";
import type { ListedKeyPackage } from "@internet-privacy/marmot-ts/client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <div className="rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{pkg.identifier ?? "(no slot)"}</span>
        {isCurrent && <Badge>this client</Badge>}
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

export function KeyPackagesCard() {
  const controller = useController();
  const snapshot = useChat();
  const packages = useKeyPackages();
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
    <Card>
      <CardHeader>
        <CardTitle>Key packages</CardTitle>
        <CardDescription>
          Key packages let others invite you. Your current client publishes under
          slot <span className="font-mono">{clientId ?? "…"}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
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
          <div className="space-y-2">
            {sorted.map((pkg) => (
              <KeyPackageRow
                key={hex(pkg.keyPackageRef)}
                pkg={pkg}
                isCurrent={pkg.identifier === clientId}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

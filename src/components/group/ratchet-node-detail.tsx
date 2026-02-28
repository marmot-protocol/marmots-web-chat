import { use$ } from "applesauce-react/hooks";
import { getDisplayName } from "applesauce-core/helpers";
import { getCredentialPubkey } from "@internet-privacy/marmots";
import { defaultCredentialTypes, leafNodeSources } from "ts-mls";
import { IconCopy, IconCheck } from "@tabler/icons-react";
import { useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { eventStore } from "@/lib/nostr";

import type { RatchetTreeNodeInfo } from "./ratchet-tree-graph";
import type { LeafNode } from "ts-mls/leafNode.js";
import type { ParentNode } from "ts-mls/parentNode.js";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function CopyableHex({
  label,
  value,
  truncate = true,
}: {
  label: string;
  value: Uint8Array | string;
  truncate?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const hex = typeof value === "string" ? value : bytesToHex(value);
  const display = truncate ? `${hex.slice(0, 16)}…${hex.slice(-8)}` : hex;

  const handleCopy = () => {
    navigator.clipboard.writeText(hex).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <code className="text-xs font-mono bg-muted px-2 py-1 rounded flex-1 break-all">
          {display}
        </code>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleCopy}
          title="Copy to clipboard"
        >
          {copied ? (
            <IconCheck className="h-3 w-3 text-green-500" />
          ) : (
            <IconCopy className="h-3 w-3" />
          )}
        </Button>
      </div>
    </div>
  );
}

function LeafSourceBadge({ source }: { source: number }) {
  const variants: Record<
    number,
    { label: string; variant: "default" | "secondary" | "outline" }
  > = {
    [leafNodeSources.key_package]: { label: "key_package", variant: "default" },
    [leafNodeSources.update]: { label: "update", variant: "secondary" },
    [leafNodeSources.commit]: { label: "commit", variant: "outline" },
  };
  const info = variants[source] ?? {
    label: `unknown (${source})`,
    variant: "outline" as const,
  };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

function LeafNodeDetails({
  node,
  isOwnLeaf,
}: {
  node: Extract<RatchetTreeNodeInfo, { kind: "leaf" }>;
  isOwnLeaf: boolean;
}) {
  const leaf: LeafNode = node.leafNode;

  // Extract pubkey if basic credential
  let pubkey: string | null = null;
  try {
    if (leaf.credential.credentialType === defaultCredentialTypes.basic) {
      pubkey = getCredentialPubkey(leaf.credential);
    }
  } catch {
    pubkey = null;
  }

  const profile = use$(
    () => (pubkey ? eventStore.profile(pubkey) : undefined),
    [pubkey],
  );
  const displayName = profile ? getDisplayName(profile) : null;

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">
      {/* Identity */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Leaf {node.leafIndex}
          </span>
          {isOwnLeaf && <Badge variant="default">You</Badge>}
          <LeafSourceBadge source={leaf.leafNodeSource} />
        </div>

        {displayName && <p className="text-sm font-medium">{displayName}</p>}
      </div>

      <Separator />

      {/* Credential */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide">
          Credential
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Type:</span>
          <Badge variant="outline">
            {leaf.credential.credentialType === defaultCredentialTypes.basic
              ? "BasicCredential"
              : leaf.credential.credentialType === 2
                ? "X509"
                : `Custom (${leaf.credential.credentialType})`}
          </Badge>
        </div>
        {pubkey && <CopyableHex label="Nostr Pubkey (hex)" value={pubkey} />}
      </div>

      <Separator />

      {/* Keys */}
      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide">
          Keys
        </span>
        <CopyableHex label="HPKE Public Key" value={leaf.hpkePublicKey} />
        <CopyableHex
          label="Signature Public Key"
          value={leaf.signaturePublicKey}
        />
        <CopyableHex label="Signature" value={leaf.signature} />
      </div>

      {/* Source-specific fields */}
      {leaf.leafNodeSource === leafNodeSources.key_package && (
        <>
          <Separator />
          <div className="flex flex-col gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide">
              Lifetime
            </span>
            <div className="flex flex-col gap-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Not before:</span>
                <span className="font-mono">
                  {new Date(
                    Number(leaf.lifetime.notBefore) * 1000,
                  ).toISOString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Not after:</span>
                <span className="font-mono">
                  {new Date(
                    Number(leaf.lifetime.notAfter) * 1000,
                  ).toISOString()}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {leaf.leafNodeSource === leafNodeSources.commit && (
        <>
          <Separator />
          <div className="flex flex-col gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide">
              Commit Info
            </span>
            <CopyableHex label="Parent Hash" value={leaf.parentHash} />
          </div>
        </>
      )}

      {/* Capabilities */}
      <Separator />
      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide">
          Capabilities
        </span>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">Versions</span>
            <div className="flex flex-wrap gap-1">
              {leaf.capabilities.versions.map((v: number, i: number) => (
                <Badge key={i} variant="outline" className="font-mono text-xs">
                  {v}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">Ciphersuites</span>
            <div className="flex flex-wrap gap-1">
              {leaf.capabilities.ciphersuites.map((c: number, i: number) => (
                <Badge key={i} variant="outline" className="font-mono text-xs">
                  0x{c.toString(16).padStart(4, "0")}
                </Badge>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">Extensions</span>
            <div className="flex flex-wrap gap-1">
              {leaf.capabilities.extensions.length === 0 ? (
                <span className="text-muted-foreground italic">none</span>
              ) : (
                leaf.capabilities.extensions.map((e: number, i: number) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className="font-mono text-xs"
                  >
                    0x{e.toString(16).padStart(4, "0")}
                  </Badge>
                ))
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">Proposals</span>
            <div className="flex flex-wrap gap-1">
              {leaf.capabilities.proposals.length === 0 ? (
                <span className="text-muted-foreground italic">none</span>
              ) : (
                leaf.capabilities.proposals.map((p: number, i: number) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className="font-mono text-xs"
                  >
                    0x{p.toString(16).padStart(4, "0")}
                  </Badge>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Extensions */}
      {leaf.extensions && leaf.extensions.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide">
              Extensions ({leaf.extensions.length})
            </span>
            {leaf.extensions.map(
              (
                ext: { extensionType: number; extensionData: Uint8Array },
                i: number,
              ) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <Badge variant="outline" className="font-mono">
                    0x{ext.extensionType.toString(16).padStart(4, "0")}
                  </Badge>
                  <span>{ext.extensionData.length} bytes</span>
                </div>
              ),
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ParentNodeDetails({
  node,
}: {
  node: Extract<RatchetTreeNodeInfo, { kind: "parent" }>;
}) {
  const parent: ParentNode = node.parentNode;

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Parent Node {node.nodeIndex}
        </span>
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide">
          Keys
        </span>
        <CopyableHex label="HPKE Public Key" value={parent.hpkePublicKey} />
        <CopyableHex label="Parent Hash" value={parent.parentHash} />
      </div>

      {parent.unmergedLeaves.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide">
              Unmerged Leaves ({parent.unmergedLeaves.length})
            </span>
            <div className="flex flex-wrap gap-1">
              {parent.unmergedLeaves.map((li: number, i: number) => (
                <Badge
                  key={i}
                  variant="secondary"
                  className="font-mono text-xs"
                >
                  leaf {li}
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface RatchetNodeDetailProps {
  node: RatchetTreeNodeInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownLeafIndex: number;
}

export function RatchetNodeDetail({
  node,
  open,
  onOpenChange,
  ownLeafIndex,
}: RatchetNodeDetailProps) {
  const title =
    node === null
      ? "Node Details"
      : node.kind === "blank"
        ? "Blank Node"
        : node.kind === "leaf"
          ? `Leaf ${node.leafIndex}`
          : `Parent Node ${node.nodeIndex}`;

  const description =
    node?.kind === "leaf"
      ? "MLS leaf node — represents a group member"
      : node?.kind === "parent"
        ? "MLS parent node — used for key derivation"
        : "Empty slot in the ratchet tree";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col p-0"
      >
        <SheetHeader className="p-4 border-b">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        {node === null ? null : node.kind === "blank" ? (
          <div className="p-4 text-sm text-muted-foreground">
            This slot is blank — no member occupies it. It may have been a
            removed member&apos;s leaf or an unused parent.
          </div>
        ) : node.kind === "leaf" ? (
          <LeafNodeDetails
            node={node}
            isOwnLeaf={node.leafIndex === ownLeafIndex}
          />
        ) : (
          <ParentNodeDetails node={node} />
        )}
      </SheetContent>
    </Sheet>
  );
}

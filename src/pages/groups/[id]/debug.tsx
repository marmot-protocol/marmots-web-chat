import { useState } from "react";
import { useOutletContext } from "react-router";

import { RatchetTreeGraph } from "@/components/group/ratchet-tree-graph";
import { RatchetNodeDetail } from "@/components/group/ratchet-node-detail";
import { Badge } from "@/components/ui/badge";

import type { GroupRumorHistory, MarmotGroup } from "@internet-privacy/marmots";
import type { RatchetTreeNodeInfo } from "@/components/group/ratchet-tree-graph";

interface GroupOutletContext {
  group: MarmotGroup<GroupRumorHistory>;
  groupDetails: {
    name: string;
    epoch: bigint;
    members: string[];
    admins: string[];
  } | null;
  isAdmin: boolean;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function GroupDebugPage() {
  const { group } = useOutletContext<GroupOutletContext>();
  const [selectedNode, setSelectedNode] = useState<RatchetTreeNodeInfo | null>(
    null,
  );
  const [detailOpen, setDetailOpen] = useState(false);

  const { state } = group;
  const ctx = state.groupContext;
  const ownLeafIndex = state.privatePath.leafIndex;

  const leafCount = Math.ceil(state.ratchetTree.length / 2);
  const occupiedLeafCount = state.ratchetTree.filter(
    (n, i) => i % 2 === 0 && n !== undefined,
  ).length;

  const handleNodeClick = (node: RatchetTreeNodeInfo) => {
    setSelectedNode(node);
    setDetailOpen(true);
  };

  const selectedNodeIndex =
    selectedNode !== null ? selectedNode.nodeIndex : null;

  return (
    <>
      <RatchetNodeDetail
        node={selectedNode}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        ownLeafIndex={ownLeafIndex}
      />

      <div className="flex flex-col h-[calc(100vh-118px)]">
        {/* Header bar: group context summary */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b bg-muted/30 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Epoch:</span>
            <Badge variant="outline" className="font-mono">
              {ctx.epoch.toString()}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Ciphersuite:</span>
            <Badge variant="outline" className="font-mono">
              0x{ctx.cipherSuite.toString(16).padStart(4, "0")}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Leaves:</span>
            <Badge variant="outline" className="font-mono">
              {occupiedLeafCount} / {leafCount}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Your leaf:</span>
            <Badge variant="default" className="font-mono">
              {ownLeafIndex}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Tree hash:</span>
            <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">
              {bytesToHex(ctx.treeHash).slice(0, 16)}…
            </code>
          </div>
        </div>

        {/* Tree graph */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <RatchetTreeGraph
            state={state}
            onNodeClick={handleNodeClick}
            selectedNodeIndex={selectedNodeIndex}
          />
        </div>
      </div>
    </>
  );
}

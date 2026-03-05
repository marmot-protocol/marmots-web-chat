import { useMemo, useRef, useState, useEffect } from "react";
import { hierarchy, tree } from "d3-hierarchy";
import { getCredentialPubkey } from "@internet-privacy/marmot-ts";
import { defaultCredentialTypes, nodeTypes } from "ts-mls";
import {
  left as treeLeft,
  right as treeRight,
  rootFromNodeWidth,
  toNodeIndex,
} from "ts-mls/treemath.js";

import type { ClientState } from "ts-mls";
import type { LeafNode } from "ts-mls/leafNode.js";
import type { ParentNode } from "ts-mls/parentNode.js";

// ─── Public node info types (used by the detail panel too) ───────────────────

export type RatchetTreeNodeInfo =
  | {
      kind: "blank";
      nodeIndex: number;
      leafIndex?: number; // set if this blank is a leaf slot
    }
  | {
      kind: "leaf";
      nodeIndex: number;
      leafIndex: number;
      leafNode: LeafNode;
    }
  | {
      kind: "parent";
      nodeIndex: number;
      parentNode: ParentNode;
    };

// ─── Internal tree data model for d3-hierarchy ───────────────────────────────

interface TreeNode {
  id: string;
  nodeIndex: number;
  /** BFS order index (root=1, then left-to-right per level) for display labels */
  displayIndex: number;
  info: RatchetTreeNodeInfo;
  children?: TreeNode[];
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Recursively build a TreeNode from the flat ratchet tree array.
 * Uses the correct MLS bit-level child index formulas from ts-mls/treemath.
 */
function buildTreeNode(
  flatTree: (import("ts-mls").Node | undefined)[],
  nodeIndex: number,
): TreeNode {
  const rawNode = flatTree[nodeIndex];
  const isLeaf = nodeIndex % 2 === 0;

  let info: RatchetTreeNodeInfo;
  if (rawNode === undefined) {
    info = isLeaf
      ? { kind: "blank", nodeIndex, leafIndex: nodeIndex / 2 }
      : { kind: "blank", nodeIndex };
  } else if (rawNode.nodeType === nodeTypes.leaf) {
    info = {
      kind: "leaf",
      nodeIndex,
      leafIndex: nodeIndex / 2,
      leafNode: rawNode.leaf,
    };
  } else {
    info = {
      kind: "parent",
      nodeIndex,
      parentNode: rawNode.parent,
    };
  }

  const treeNode: TreeNode = {
    id: `n${nodeIndex}`,
    nodeIndex,
    displayIndex: 0,
    info,
  };

  // Parent nodes (odd indices) have children.
  // Use the MLS-spec bit-level formulas (from ts-mls/treemath) — NOT nodeIndex±1.
  if (!isLeaf) {
    const leftIndex = treeLeft(toNodeIndex(nodeIndex));
    const rightIndex = treeRight(toNodeIndex(nodeIndex));
    if (leftIndex >= 0 && rightIndex < flatTree.length) {
      treeNode.children = [
        buildTreeNode(flatTree, leftIndex),
        buildTreeNode(flatTree, rightIndex),
      ];
    }
  }

  return treeNode;
}

/**
 * Find the root index of the flat ratchet tree using the MLS spec formula.
 */
function findRoot(flatTree: (import("ts-mls").Node | undefined)[]): number {
  if (flatTree.length <= 1) return 0;
  return rootFromNodeWidth(flatTree.length);
}

function buildRatchetTreeHierarchy(
  flatTree: (import("ts-mls").Node | undefined)[],
): TreeNode | null {
  if (flatTree.length === 0) return null;
  const rootIndex = findRoot(flatTree);
  const root = buildTreeNode(flatTree, rootIndex);

  // Assign displayIndex via BFS so nodes are numbered top-to-bottom, left-to-right.
  let counter = 1;
  const queue: TreeNode[] = [root];
  while (queue.length > 0) {
    const node = queue.shift()!;
    node.displayIndex = counter++;
    if (node.children) queue.push(...node.children);
  }

  return root;
}

// ─── Visual node dimensions ───────────────────────────────────────────────────

const NODE_WIDTH = 120;
const NODE_HEIGHT = 56;
const H_GAP = 20; // horizontal gap between siblings
const V_GAP = 60; // vertical gap between levels

// ─── Node visual component ────────────────────────────────────────────────────

interface NodeVisualProps {
  x: number;
  y: number;
  info: RatchetTreeNodeInfo;
  displayIndex: number;
  ownLeafIndex: number;
  selected: boolean;
  onClick: () => void;
}

function getPubkeyFromLeaf(leaf: LeafNode): string | null {
  try {
    if (leaf.credential.credentialType === defaultCredentialTypes.basic) {
      return getCredentialPubkey(leaf.credential);
    }
  } catch {
    // ignore
  }
  return null;
}

function NodeVisual({
  x,
  y,
  info,
  displayIndex,
  ownLeafIndex,
  selected,
  onClick,
}: NodeVisualProps) {
  const hw = NODE_WIDTH / 2;
  const hh = NODE_HEIGHT / 2;

  if (info.kind === "blank") {
    return (
      <g
        transform={`translate(${x},${y})`}
        onClick={onClick}
        style={{ cursor: "pointer" }}
      >
        <rect
          x={-hw}
          y={-hh}
          width={NODE_WIDTH}
          height={NODE_HEIGHT}
          rx={info.leafIndex !== undefined ? 8 : 28}
          ry={info.leafIndex !== undefined ? 8 : 28}
          fill="transparent"
          stroke={selected ? "var(--color-primary)" : "var(--color-border)"}
          strokeWidth={selected ? 2 : 1}
          strokeDasharray="4 3"
          opacity={0.5}
        />
        <text
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={10}
          fill="var(--color-muted-foreground)"
          opacity={0.7}
        >
          blank
        </text>
        <text
          y={12}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={9}
          fill="var(--color-muted-foreground)"
          opacity={0.5}
        >
          {info.leafIndex !== undefined
            ? `leaf ${info.leafIndex}`
            : `node ${info.nodeIndex}`}
        </text>
      </g>
    );
  }

  if (info.kind === "leaf") {
    const isOwn = info.leafIndex === ownLeafIndex;
    const pubkey = getPubkeyFromLeaf(info.leafNode);
    const shortPubkey = pubkey ? `${pubkey.slice(0, 8)}…` : "?";

    return (
      <g
        transform={`translate(${x},${y})`}
        onClick={onClick}
        style={{ cursor: "pointer" }}
      >
        <rect
          x={-hw}
          y={-hh}
          width={NODE_WIDTH}
          height={NODE_HEIGHT}
          rx={8}
          ry={8}
          fill={
            selected
              ? "var(--color-primary)"
              : isOwn
                ? "color-mix(in srgb, var(--color-primary) 15%, transparent)"
                : "var(--color-card)"
          }
          stroke={
            selected
              ? "var(--color-primary)"
              : isOwn
                ? "var(--color-primary)"
                : "var(--color-border)"
          }
          strokeWidth={selected || isOwn ? 2 : 1}
        />
        <text
          textAnchor="middle"
          dominantBaseline="middle"
          y={-8}
          fontSize={10}
          fontWeight={600}
          fill={selected ? "white" : "var(--color-foreground)"}
        >
          Leaf {info.leafIndex}
          {isOwn ? " (you)" : ""}
        </text>
        <text
          textAnchor="middle"
          dominantBaseline="middle"
          y={8}
          fontSize={9}
          fontFamily="monospace"
          fill={selected ? "white" : "var(--color-muted-foreground)"}
        >
          {shortPubkey}
        </text>
      </g>
    );
  }

  // Parent node
  const hpkeShort = `${bytesToHex(info.parentNode.hpkePublicKey).slice(0, 8)}…`;

  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      <ellipse
        cx={0}
        cy={0}
        rx={hw}
        ry={hh}
        fill={selected ? "var(--color-primary)" : "var(--color-muted)"}
        stroke={selected ? "var(--color-primary)" : "var(--color-border)"}
        strokeWidth={selected ? 2 : 1}
      />
      <text
        textAnchor="middle"
        dominantBaseline="middle"
        y={-8}
        fontSize={10}
        fontWeight={600}
        fill={selected ? "white" : "var(--color-foreground)"}
      >
        Node {displayIndex}
      </text>
      <text
        textAnchor="middle"
        dominantBaseline="middle"
        y={8}
        fontSize={9}
        fontFamily="monospace"
        fill={selected ? "white" : "var(--color-muted-foreground)"}
      >
        {hpkeShort}
      </text>
    </g>
  );
}

// ─── Main graph component ─────────────────────────────────────────────────────

interface RatchetTreeGraphProps {
  state: ClientState;
  onNodeClick: (node: RatchetTreeNodeInfo) => void;
  selectedNodeIndex: number | null;
}

export function RatchetTreeGraph({
  state,
  onNodeClick,
  selectedNodeIndex,
}: RatchetTreeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ownLeafIndex = state.privatePath.leafIndex;

  const { nodes, links, svgWidth, svgHeight } = useMemo(() => {
    const rootData = buildRatchetTreeHierarchy(state.ratchetTree);
    if (!rootData)
      return { nodes: [], links: [], svgWidth: 200, svgHeight: 100 };

    // Build d3 hierarchy
    const root = hierarchy<TreeNode>(rootData);

    // Use d3 tree layout — size is [totalWidth, totalHeight]
    // We'll size it so the tree fits with good spacing
    const leafCount = Math.ceil(state.ratchetTree.length / 2);
    const treeWidth = Math.max(
      (NODE_WIDTH + H_GAP) * leafCount,
      dimensions.width - 40,
    );
    const treeDepth = root.height;
    const treeHeight = (NODE_HEIGHT + V_GAP) * (treeDepth + 1);

    const treeLayout = tree<TreeNode>()
      .size([treeWidth, treeHeight])
      .separation(() => 1);

    const layoutRoot = treeLayout(root);

    // Collect positioned nodes and links
    const positionedNodes: Array<{
      x: number;
      y: number;
      info: RatchetTreeNodeInfo;
      nodeIndex: number;
      displayIndex: number;
    }> = [];

    const positionedLinks: Array<{
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }> = [];

    const padding = 20;

    layoutRoot.each((d) => {
      positionedNodes.push({
        x: d.x + padding,
        y: d.y + padding + NODE_HEIGHT / 2,
        info: d.data.info,
        nodeIndex: d.data.nodeIndex,
        displayIndex: d.data.displayIndex,
      });
    });

    layoutRoot.links().forEach((link) => {
      positionedLinks.push({
        x1: link.source.x + padding,
        y1: link.source.y + padding + NODE_HEIGHT / 2,
        x2: link.target.x + padding,
        y2: link.target.y + padding + NODE_HEIGHT / 2,
      });
    });

    const maxX =
      Math.max(...positionedNodes.map((n) => n.x)) + NODE_WIDTH / 2 + padding;
    const maxY =
      Math.max(...positionedNodes.map((n) => n.y)) + NODE_HEIGHT / 2 + padding;

    return {
      nodes: positionedNodes,
      links: positionedLinks,
      svgWidth: Math.max(maxX, dimensions.width),
      svgHeight: Math.max(maxY, 200),
    };
  }, [state.ratchetTree, state.privatePath.leafIndex, dimensions.width]);

  return (
    <div ref={containerRef} className="w-full h-full overflow-auto">
      <svg
        width={svgWidth}
        height={svgHeight}
        style={{ display: "block", minWidth: "100%" }}
      >
        {/* Edges */}
        <g>
          {links.map((link, i) => (
            <line
              key={i}
              x1={link.x1}
              y1={link.y1}
              x2={link.x2}
              y2={link.y2}
              stroke="var(--color-border)"
              strokeWidth={1.5}
            />
          ))}
        </g>

        {/* Nodes */}
        <g>
          {nodes.map((node) => (
            <NodeVisual
              key={node.nodeIndex}
              x={node.x}
              y={node.y}
              info={node.info}
              displayIndex={node.displayIndex}
              ownLeafIndex={ownLeafIndex}
              selected={selectedNodeIndex === node.nodeIndex}
              onClick={() => onNodeClick(node.info)}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

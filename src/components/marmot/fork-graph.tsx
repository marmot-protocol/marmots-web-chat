import { useMemo } from "react";

import type {
  ForkTreeView,
  ForkTreeNodeView,
} from "@internet-privacy/marmot-ts/client";

const COL_W = 120;
const ROW_H = 64;
const MARGIN_X = 28;
const MARGIN_Y = 30;
const R = 10;

/** Abandoned fork tips (green) and fork points (amber) — readable in both themes. */
const TIP_COLOR = "#22c55e";
const FORK_COLOR = "#f59e0b";

interface Placed {
  node: ForkTreeNodeView;
  depth: number;
  lane: number;
}

/**
 * Lay the fork tree out git-graph style: x grows with commit depth from the
 * root, each branch gets its own horizontal lane. The canonical branch is pulled
 * to lane 0 by ordering canonical children first, so the live history reads as a
 * straight line with forks dropping below it. Ported from the `marmot-tunnels`
 * server-rendered SVG to a client React component.
 */
function layout(view: ForkTreeView): {
  placed: Map<string, Placed>;
  maxDepth: number;
  lanes: number;
} {
  const byTag = new Map(view.nodes.map((n) => [n.tag, n]));
  const onCanonical = new Set(view.canonicalPath);

  const depth = new Map<string, number>();
  const computeDepth = (tag: string, seen: Set<string>): number => {
    const cached = depth.get(tag);
    if (cached !== undefined) return cached;
    // Guard against a cycle in the parent chain (inconsistent fork data).
    if (seen.has(tag)) return 0;
    seen.add(tag);
    const node = byTag.get(tag);
    const d = node?.parentTag ? computeDepth(node.parentTag, seen) + 1 : 0;
    depth.set(tag, d);
    return d;
  };
  for (const n of view.nodes) computeDepth(n.tag, new Set());

  const orderChildren = (children: string[]): string[] =>
    [...children].sort((a, b) => {
      const ca = onCanonical.has(a) ? 0 : 1;
      const cb = onCanonical.has(b) ? 0 : 1;
      if (ca !== cb) return ca - cb;
      const ea = byTag.get(a)?.epoch ?? 0;
      const eb = byTag.get(b)?.epoch ?? 0;
      return ea - eb || (a < b ? -1 : 1);
    });

  const lane = new Map<string, number>();
  let nextLane = 0;
  const visiting = new Set<string>();
  const visit = (tag: string): number => {
    const cached = lane.get(tag);
    if (cached !== undefined) return cached;
    // Cycle in childTags (inconsistent fork data) — break it onto its own lane.
    if (visiting.has(tag)) {
      const l = nextLane++;
      lane.set(tag, l);
      return l;
    }
    visiting.add(tag);
    const node = byTag.get(tag);
    const kids = node ? orderChildren(node.childTags) : [];
    let result: number;
    if (kids.length === 0) {
      result = nextLane++;
    } else {
      let first = 0;
      kids.forEach((kid, i) => {
        const l = visit(kid);
        if (i === 0) first = l;
      });
      result = first;
    }
    lane.set(tag, result);
    visiting.delete(tag);
    return result;
  };
  if (view.rootTag) visit(view.rootTag);
  // Defensive: place any node not reachable from the root on its own lane.
  for (const n of view.nodes) if (!lane.has(n.tag)) lane.set(n.tag, nextLane++);

  const placed = new Map<string, Placed>();
  for (const n of view.nodes) {
    placed.set(n.tag, {
      node: n,
      depth: depth.get(n.tag) ?? 0,
      lane: lane.get(n.tag) ?? 0,
    });
  }
  return {
    placed,
    maxDepth: Math.max(0, ...[...depth.values()]),
    lanes: nextLane || 1,
  };
}

const cx = (depth: number) => MARGIN_X + depth * COL_W + R;
const cy = (lane: number) => MARGIN_Y + lane * ROW_H + R;

function nodeColor(n: ForkTreeNodeView): string {
  if (n.canonical) return "var(--primary)";
  if (n.isTip) return TIP_COLOR;
  return "var(--muted-foreground)";
}

/**
 * Render a {@link ForkTreeView} as an inline SVG branching timeline. Canonical
 * nodes are filled with the accent (the live branch this client follows),
 * abandoned fork tips green, fork points ringed amber, and the live tip carries
 * a double ring. Clicking a node selects it (`onSelect`); the selected node gets
 * a highlight ring.
 */
export function ForkGraph({
  view,
  selectedTag,
  onSelect,
}: {
  view: ForkTreeView;
  selectedTag?: string;
  onSelect?: (node: ForkTreeNodeView) => void;
}) {
  const { placed, maxDepth, lanes } = useMemo(() => layout(view), [view]);

  if (!view.nodes.length) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No fork history recorded yet.
      </div>
    );
  }

  const width = MARGIN_X * 2 + maxDepth * COL_W + 2 * R + 40;
  const height = MARGIN_Y * 2 + lanes * ROW_H;

  const edges = [...placed.values()].flatMap(({ node, depth, lane }) => {
    if (!node.parentTag) return [];
    const parent = placed.get(node.parentTag);
    if (!parent) return [];
    const x1 = cx(parent.depth);
    const y1 = cy(parent.lane);
    const x2 = cx(depth);
    const y2 = cy(lane);
    const midX = (x1 + x2) / 2;
    const stroke = node.canonical ? "var(--primary)" : "var(--border)";
    return [
      <path
        key={`e-${node.tag}`}
        d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
        fill="none"
        stroke={stroke}
        strokeWidth={node.canonical ? 2.5 : 1.5}
      />,
    ];
  });

  return (
    <div className="overflow-auto rounded-md border bg-card">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Group fork-history graph"
        className="max-w-none"
      >
        {edges}
        {[...placed.values()].map(({ node, depth, lane }) => {
          const x = cx(depth);
          const y = cy(lane);
          const color = nodeColor(node);
          const isFork = node.childTags.length > 1;
          const selected = node.tag === selectedTag;
          return (
            <g
              key={node.tag}
              className="cursor-pointer"
              onClick={() => onSelect?.(node)}
            >
              <title>
                {`epoch ${node.epoch} · ${node.tag.slice(0, 12)}${
                  node.isCanonicalTip
                    ? " · live tip"
                    : node.canonical
                      ? " · canonical"
                      : node.isTip
                        ? " · abandoned fork"
                        : ""
                }`}
              </title>
              {selected && (
                <circle
                  cx={x}
                  cy={y}
                  r={R + 7}
                  fill="none"
                  stroke="var(--ring)"
                  strokeWidth={1.5}
                  strokeDasharray="3 2"
                />
              )}
              {node.isCanonicalTip && (
                <circle
                  cx={x}
                  cy={y}
                  r={R + 4}
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth={1.5}
                />
              )}
              {isFork && (
                <circle
                  cx={x}
                  cy={y}
                  r={R + 4}
                  fill="none"
                  stroke={FORK_COLOR}
                  strokeWidth={1.5}
                />
              )}
              <circle
                cx={x}
                cy={y}
                r={R}
                fill={node.canonical ? color : "var(--card)"}
                stroke={color}
                strokeWidth={2}
              />
              <text
                x={x}
                y={y + 4}
                textAnchor="middle"
                fontSize="10"
                fill={
                  node.canonical
                    ? "var(--primary-foreground)"
                    : "var(--foreground)"
                }
                fontFamily="var(--font-mono, monospace)"
              >
                {node.epoch}
              </text>
              <text
                x={x}
                y={y + R + 16}
                textAnchor="middle"
                fontSize="10"
                fill="var(--muted-foreground)"
                fontFamily="var(--font-mono, monospace)"
              >
                {node.tag.slice(0, 6)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
        <Legend swatch="var(--primary)" label="canonical branch (you)" />
        <Legend swatch={TIP_COLOR} label="abandoned fork head" />
        <Legend swatch={FORK_COLOR} ring label="fork point" />
      </div>
    </div>
  );
}

function Legend({
  swatch,
  label,
  ring,
}: {
  swatch: string;
  label: string;
  ring?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block size-3 rounded-full"
        style={
          ring ? { border: `2px solid ${swatch}` } : { backgroundColor: swatch }
        }
      />
      {label}
    </span>
  );
}

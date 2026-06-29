import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, GitFork } from "lucide-react";
import { use$ } from "applesauce-react/hooks";

import type {
  ForkTreeNodeView,
  MarmotGroup,
} from "@internet-privacy/marmot-ts/client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ForkGraph } from "@/components/marmot/fork-graph";
import { useController } from "@/hooks/use-marmot";
import { useGroupDebug } from "@/hooks/use-group-debug";
import { debugMode$ } from "@/lib/settings";

export function GroupDebugPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const controller = useController();
  const debugEnabled = use$(debugMode$) ?? false;
  const group = id ? controller?.getGroup(id) : undefined;

  if (!id) return null;
  if (!group) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {controller ? "Group not found." : "Loading…"}
      </div>
    );
  }

  return (
    <GroupDebugView
      groupId={id}
      group={group}
      debugEnabled={debugEnabled}
      navigate={navigate}
    />
  );
}

function GroupDebugView({
  groupId,
  group,
  debugEnabled,
  navigate,
}: {
  groupId: string;
  group: MarmotGroup;
  debugEnabled: boolean;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { view, pending, epoch, convergenceStatus, lifecycle } =
    useGroupDebug(group);
  const [selected, setSelected] = useState<ForkTreeNodeView | null>(null);

  const forkCount = view.tips.length;
  const name = group.groupData?.name || group.idStr.slice(0, 8);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b p-3">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => navigate(`/groups/${groupId}`)}
          title="Back to chat"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <GitFork className="size-4 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{name} — debug</div>
          <div className="truncate font-mono text-xs text-muted-foreground">
            {group.idStr}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="w-full min-w-0 space-y-4 p-4">
          {!debugEnabled && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              Debug mode is off, so fork history is in-memory only and is
              rebuilt from the current tip after a reload. Enable it in Settings
              → Developer and sign in again to persist the full fork history.
            </div>
          )}

          {/* Live status */}
          <div className="flex flex-wrap gap-2">
            <Stat label="epoch" value={String(epoch)} />
            <Stat label="convergence" value={convergenceStatus} />
            <Stat label="lifecycle" value={lifecycle} />
            <Stat
              label="branches"
              value={String(forkCount)}
              highlight={forkCount > 1}
            />
            <Stat label="nodes" value={String(view.nodes.length)} />
            <Stat
              label="pending"
              value={String(pending.length)}
              highlight={pending.length > 0}
            />
          </div>

          {forkCount > 1 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
              <strong>{forkCount} competing branches</strong> observed. Your
              client follows the canonical branch (filled accent nodes); the
              others are forks it has seen but not adopted.
            </div>
          )}

          {/* Fork graph */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Fork history</h2>
            <ForkGraph
              view={view}
              selectedTag={selected?.tag}
              onSelect={setSelected}
            />
            {selected && <NodeDetail node={selected} />}
          </section>

          {/* Pending / undecryptable events */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">
              Pending events{" "}
              <span className="font-normal text-muted-foreground">
                ({pending.length})
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Group events received but not yet decrypted into the tree —
              usually a message awaiting its commit, or a fork message awaiting
              its branch. One that lingers is an event this client could never
              read.
            </p>
            {pending.length === 0 ? (
              <div className="rounded-md border bg-card px-3 py-4 text-center text-sm text-muted-foreground">
                No pending events — everything received has been processed.
              </div>
            ) : (
              <ul className="divide-y rounded-md border bg-card">
                {pending.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 font-mono text-xs"
                  >
                    <span className="truncate text-muted-foreground">
                      {event.id.slice(0, 16)}…
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      kind {event.kind} ·{" "}
                      {new Date(event.created_at * 1000).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "rounded-md border px-3 py-1.5 " +
        (highlight ? "border-amber-500/50 bg-amber-500/10" : "bg-card")
      }
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}

function NodeDetail({ node }: { node: ForkTreeNodeView }) {
  return (
    <div className="space-y-1.5 rounded-md border bg-card p-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-semibold">epoch {node.epoch}</span>
        {node.isCanonicalTip && <Badge>live tip</Badge>}
        {node.canonical && !node.isCanonicalTip && (
          <Badge variant="secondary">canonical</Badge>
        )}
        {node.isTip && !node.isCanonicalTip && (
          <Badge variant="outline">abandoned fork head</Badge>
        )}
        {node.childTags.length > 1 && (
          <Badge variant="outline">fork point</Badge>
        )}
      </div>
      <Row label="tag" value={node.tag} />
      {node.parentTag && <Row label="parent" value={node.parentTag} />}
      <Row
        label="children"
        value={
          node.childTags.length
            ? node.childTags.map((t) => t.slice(0, 8)).join(", ")
            : "— (tip)"
        }
      />
      {node.commit && (
        <Row
          label="commit"
          value={`${node.commit.digestHex.slice(0, 12)}…${
            node.commit.senderLeafIndex !== undefined
              ? ` · leaf ${node.commit.senderLeafIndex}`
              : ""
          }`}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all font-mono">{value}</span>
    </div>
  );
}

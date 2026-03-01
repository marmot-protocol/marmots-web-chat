import {
  getNostrGroupIdHex,
  type GroupRumorHistory,
  type MarmotGroup,
} from "@internet-privacy/marmots";
import type { NostrEvent } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { useMemo } from "react";
import { useOutletContext } from "react-router";

import { IconCopyButton } from "@/components/icon-copy-button";
import { Badge } from "@/components/ui/badge";
import type { IngestEventRecord } from "@/lib/group-subscription-manager";
import { getGroupSubscriptionManager } from "@/lib/runtime";
import { cn } from "@/lib/utils";

interface GroupOutletContext {
  group: MarmotGroup<GroupRumorHistory>;
}

/** Format a unix timestamp (seconds) as a short local time string. */
function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Format a unix timestamp (seconds) as a short local date+time string. */
function formatDateTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function shortId(id: string): string {
  return id.slice(0, 8) + "…";
}

/** Badge for the MLS result kind of a processed event. */
function ResultKindBadge({ kind }: { kind: string }) {
  if (kind === "applicationMessage") {
    return (
      <Badge variant="default" className="font-mono text-[10px]">
        message
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="font-mono text-[10px]">
      {kind}
    </Badge>
  );
}

/** Indicator dot + badge row for a given ingest record kind. */
function IngestKindIndicator({ record }: { record: IngestEventRecord }) {
  if (record.kind === "processed") {
    return (
      <>
        <div className="w-2 h-2 rounded-full bg-green-500 mt-1 shrink-0" />
        <ResultKindBadge kind={record.result.kind} />
      </>
    );
  }

  if (record.kind === "rejected") {
    return (
      <>
        <div className="w-2 h-2 rounded-full bg-yellow-500 mt-1 shrink-0" />
        <Badge
          variant="outline"
          className="font-mono text-[10px] border-yellow-500 text-yellow-600"
        >
          rejected
        </Badge>
      </>
    );
  }

  if (record.kind === "skipped") {
    return (
      <>
        <div className="w-2 h-2 rounded-full bg-muted-foreground/40 ring-1 ring-muted-foreground/20 mt-1 shrink-0" />
        <Badge
          variant="outline"
          className="font-mono text-[10px] text-muted-foreground"
        >
          {record.reason === "past-epoch" ? "past epoch" : "skipped"}
        </Badge>
      </>
    );
  }

  // unreadable
  return (
    <>
      <div className="w-2 h-2 rounded-full bg-destructive mt-1 shrink-0" />
      <Badge
        variant="outline"
        className="font-mono text-[10px] border-destructive text-destructive"
      >
        unreadable
      </Badge>
    </>
  );
}

/** Sub-line detail shown below the event ID for a processed record. */
function IngestRecordDetail({ record }: { record: IngestEventRecord }) {
  if (record.kind === "processed") {
    return (
      <div className="text-xs text-muted-foreground">
        processed at {formatDateTime(Math.floor(record.processedAt / 1000))}
      </div>
    );
  }

  if (record.kind === "rejected") {
    return (
      <div className="text-xs text-yellow-600">
        commit rejected by admin policy &mdash; processed at{" "}
        {formatDateTime(Math.floor(record.processedAt / 1000))}
      </div>
    );
  }

  if (record.kind === "skipped") {
    const label = record.reason === "past-epoch"
      ? "commit from a past epoch, already applied"
      : "unexpected MLS wireformat";
    return (
      <div className="text-xs text-muted-foreground">
        {label} &mdash; observed at{" "}
        {formatDateTime(Math.floor(record.processedAt / 1000))}
      </div>
    );
  }

  // unreadable — show error chain if present
  if (record.errors.length > 0) {
    const summary = record.errors
      .map((e) => (e instanceof Error ? e.message : String(e)))
      .join(" → ");
    return (
      <div className="text-xs text-destructive font-mono break-all">
        {summary}
      </div>
    );
  }

  return (
    <div className="text-xs text-destructive">
      failed to decrypt after all retry attempts
    </div>
  );
}

/** A single row in the events timeline. */
function EventRow({
  event,
  status,
  ingestRecord,
}: {
  event: NostrEvent;
  status: "ingested" | "pending";
  ingestRecord?: IngestEventRecord;
}) {
  const isPending = status === "pending";
  const isFailed = ingestRecord?.kind === "unreadable" ||
    ingestRecord?.kind === "rejected";

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-2.5 border-b last:border-0 text-sm",
        isPending && "opacity-60",
        isFailed && "bg-destructive/5",
      )}
    >
      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="font-mono text-xs text-muted-foreground">
            {shortId(event.id)}
          </code>
          <IconCopyButton
            text={event.id}
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0"
          />
          {isPending || !ingestRecord
            ? (
              <>
                <div className="w-2 h-2 rounded-full bg-muted-foreground/40 ring-1 ring-muted-foreground/20 shrink-0" />
                <Badge
                  variant="outline"
                  className="font-mono text-[10px] text-muted-foreground"
                >
                  pending
                </Badge>
              </>
            )
            : <IngestKindIndicator record={ingestRecord} />}
          <span className="text-xs text-muted-foreground ml-auto tabular-nums">
            {formatTime(event.created_at)}
          </span>
        </div>

        {ingestRecord && <IngestRecordDetail record={ingestRecord} />}
      </div>
    </div>
  );
}

export default function GroupEventsPage() {
  const { group } = useOutletContext<GroupOutletContext>();
  const manager = getGroupSubscriptionManager();

  const nostrGroupIdHex = useMemo(
    () => getNostrGroupIdHex(group.state),
    [group],
  );

  const ingestRecords = use$(
    manager?.getIngestResults$(group.idStr) ?? undefined,
  );

  const pendingEvents = use$(
    () =>
      nostrGroupIdHex && manager
        ? manager.getPendingEvents$(nostrGroupIdHex, group.idStr)
        : undefined,
    [nostrGroupIdHex, manager],
  );

  // Build a lookup from event id → ingest record for O(1) access.
  const ingestById = useMemo(() => {
    const map = new Map<string, IngestEventRecord>();
    for (const r of ingestRecords ?? []) map.set(r.event.id, r);
    return map;
  }, [ingestRecords]);

  // Merge ingested + pending into a single timeline sorted by created_at.
  const timeline = useMemo(() => {
    type Entry =
      | { status: "ingested"; event: NostrEvent; record: IngestEventRecord }
      | { status: "pending"; event: NostrEvent };

    const entries: Entry[] = [];

    for (const r of ingestRecords ?? []) {
      entries.push({ status: "ingested", event: r.event, record: r });
    }
    for (const e of pendingEvents ?? []) {
      if (!ingestById.has(e.id)) {
        entries.push({ status: "pending", event: e });
      }
    }

    entries.sort((a, b) => b.event.created_at - a.event.created_at);
    return entries;
  }, [ingestRecords, pendingEvents, ingestById]);

  // Compute per-kind counts for the summary bar.
  const counts = useMemo(() => {
    let processed = 0;
    let rejected = 0;
    let skipped = 0;
    let unreadable = 0;
    for (const r of ingestRecords ?? []) {
      if (r.kind === "processed") processed++;
      else if (r.kind === "rejected") rejected++;
      else if (r.kind === "skipped") skipped++;
      else if (r.kind === "unreadable") unreadable++;
    }
    return { processed, rejected, skipped, unreadable };
  }, [ingestRecords]);

  const pendingCount = pendingEvents?.length ?? 0;

  return (
    <div className="flex flex-col h-[calc(100vh-118px)]">
      {/* Summary bar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b bg-muted/30 text-xs text-muted-foreground shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span>
            <span className="font-mono text-foreground">
              {counts.processed}
            </span>{" "}
            processed
          </span>
        </div>
        {counts.rejected > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-yellow-500" />
            <span>
              <span className="font-mono text-foreground">
                {counts.rejected}
              </span>{" "}
              rejected
            </span>
          </div>
        )}
        {counts.skipped > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-muted-foreground/40 ring-1 ring-muted-foreground/20" />
            <span>
              <span className="font-mono text-foreground">
                {counts.skipped}
              </span>{" "}
              skipped
            </span>
          </div>
        )}
        {counts.unreadable > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-destructive" />
            <span>
              <span className="font-mono text-destructive">
                {counts.unreadable}
              </span>{" "}
              unreadable
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-muted-foreground/40 ring-1 ring-muted-foreground/20" />
          <span>
            <span className="font-mono text-foreground">{pendingCount}</span>
            {" "}
            pending
          </span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="font-mono text-foreground">{timeline.length}</span>
          {" "}
          total
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {timeline.length === 0
          ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              No events yet
            </div>
          )
          : (
            <div>
              {timeline.map((entry) => (
                <EventRow
                  key={entry.event.id}
                  event={entry.event}
                  status={entry.status}
                  ingestRecord={entry.status === "ingested"
                    ? entry.record
                    : undefined}
                />
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

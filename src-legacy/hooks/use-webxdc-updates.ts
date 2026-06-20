import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import type { AppGroup } from "@/lib/marmot-client";
import { useEffect, useState } from "react";

import {
  getWebxdcId,
  WEBXDC_UPDATE_KIND,
  type WebxdcReceivedUpdate,
} from "@/lib/webxdc";

// Internal representation that keeps the source rumor alongside the derived update
interface UpdateEntry {
  id: string;
  createdAt: number;
  payload: unknown;
  info?: string;
  document?: string;
  summary?: string;
}

function rumorToEntry(rumor: Rumor): UpdateEntry {
  let payload: unknown = null;
  try {
    payload = JSON.parse(rumor.content);
  } catch {
    payload = rumor.content;
  }
  const entry: UpdateEntry = {
    id: rumor.id,
    createdAt: rumor.created_at,
    payload,
  };
  const infoTag = rumor.tags.find((t) => t[0] === "info");
  const documentTag = rumor.tags.find((t) => t[0] === "document");
  const summaryTag = rumor.tags.find((t) => t[0] === "summary");
  if (infoTag?.[1]) entry.info = infoTag[1];
  if (documentTag?.[1]) entry.document = documentTag[1];
  if (summaryTag?.[1]) entry.summary = summaryTag[1];
  return entry;
}

function entriesToUpdates(entries: UpdateEntry[]): WebxdcReceivedUpdate[] {
  const maxSerial = entries.length;
  return entries.map((e, i) => {
    const update: WebxdcReceivedUpdate = {
      payload: e.payload,
      serial: i + 1,
      max_serial: maxSerial,
    };
    if (e.info !== undefined) update.info = e.info;
    if (e.document !== undefined) update.document = e.document;
    if (e.summary !== undefined) update.summary = e.summary;
    return update;
  });
}

/**
 * Hook that loads historical and live kind 4932 (webxdc state update) rumors
 * for a specific webxdc app instance, identified by its coordinator ID.
 *
 * Returns updates sorted by created_at ascending, each assigned a monotonic
 * serial number so the webxdc runtime can replay them in order.
 *
 * @param group - The current MLS group
 * @param webxdcId - The webxdc coordinator ID (from the "i" tag), or null
 *
 * @example
 * ```tsx
 * const updates = useWebxdcUpdates(group, webxdcId);
 * // updates[0].serial === 1, updates[0].max_serial === updates.length
 * ```
 */
export function useWebxdcUpdates(
  group: AppGroup | null,
  webxdcId: string | null,
): WebxdcReceivedUpdate[] {
  const [entries, setEntries] = useState<UpdateEntry[]>([]);

  function mergeEntries(incoming: UpdateEntry[]) {
    setEntries((prev) => {
      const seenIds = new Set(prev.map((e) => e.id));
      const newEntries = incoming.filter((e) => !seenIds.has(e.id));
      if (newEntries.length === 0) return prev;
      return [...prev, ...newEntries].sort((a, b) => a.createdAt - b.createdAt);
    });
  }

  // Clear and reload when group or webxdc ID changes
  useEffect(() => {
    setEntries([]);
    if (!group?.history || !webxdcId) return;

    group.history
      .queryRumors({ kinds: [WEBXDC_UPDATE_KIND] })
      .then((rumors) => {
        const matching = rumors
          .filter((r) => getWebxdcId(r) === webxdcId)
          .map(rumorToEntry);
        if (matching.length > 0) mergeEntries(matching);
      })
      .catch(() => {
        // history query failed — start fresh
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, webxdcId]);

  // Subscribe to live rumors
  useEffect(() => {
    if (!group?.history || !webxdcId) return;
    const listener = (rumor: Rumor) => {
      if (
        rumor.kind === WEBXDC_UPDATE_KIND &&
        getWebxdcId(rumor) === webxdcId
      ) {
        mergeEntries([rumorToEntry(rumor)]);
      }
    };
    group.history.addListener("rumor", listener);
    return () => {
      group?.history?.removeListener("rumor", listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, webxdcId]);

  return entriesToUpdates(entries);
}

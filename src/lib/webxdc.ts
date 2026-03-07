import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import { getEventHash } from "applesauce-core/helpers";
import { unixNow } from "@internet-privacy/marmot-ts";

// ============================================================================
// Kind constants
// ============================================================================

/** State update from webxdc sendUpdate() — MLS rumor, hidden from chat list */
export const WEBXDC_UPDATE_KIND = 4932;

/** Ephemeral realtime channel data — MLS rumor, hidden from chat list */
export const WEBXDC_REALTIME_KIND = 20932;

/** Set of rumor kinds used for webxdc protocol messages (not shown in chat) */
export const WEBXDC_PROTOCOL_KINDS = new Set([
  WEBXDC_UPDATE_KIND,
  WEBXDC_REALTIME_KIND,
]);

// ============================================================================
// Types
// ============================================================================

export interface WebxdcUpdatePayload {
  payload: unknown;
  info?: string;
  href?: string;
  document?: string;
  summary?: string;
  notify?: Record<string, string>;
}

export interface WebxdcReceivedUpdate extends WebxdcUpdatePayload {
  serial: number;
  max_serial: number;
}

// ============================================================================
// Detection helpers
// ============================================================================

/**
 * Returns true if a kind 9 rumor's content is a bare .xdc URL (possibly with
 * surrounding whitespace). Used to render an app card instead of plain text.
 */
export function isWebxdcMessage(rumor: Rumor): boolean {
  if (rumor.kind !== 9) return false;
  return getWebxdcUrl(rumor) !== null;
}

/**
 * Extracts the .xdc URL from a kind 9 rumor if the content is a bare .xdc URL.
 * Returns null if the message is not a webxdc attachment.
 */
export function getWebxdcUrl(rumor: Rumor): string | null {
  const text = rumor.content.trim();
  try {
    const url = new URL(text);
    if (url.pathname.endsWith(".xdc")) return text;
  } catch {
    // not a URL
  }
  return null;
}

/**
 * Derives a stable webxdc coordinator ID from a kind 9 rumor's ID.
 * All peers agree on the same identifier without extra coordination.
 * Formatted as a UUID-like string using the first 32 hex chars of the rumor ID.
 */
export function deriveWebxdcId(rumorId: string): string {
  const h = rumorId.replace(/-/g, "").substring(0, 32).padEnd(32, "0");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/**
 * Extracts the webxdc coordinator ID from the "i" tag of a kind 4932 or 20932 rumor.
 */
export function getWebxdcId(rumor: Rumor): string | null {
  const tag = rumor.tags.find((t) => t[0] === "i");
  return tag ? (tag[1] ?? null) : null;
}

/**
 * Derives a human-readable app name from the .xdc URL path.
 */
export function getAppNameFromUrl(xdcUrl: string): string {
  try {
    const url = new URL(xdcUrl);
    const filename = url.pathname.split("/").pop() ?? "";
    return filename.replace(/\.xdc$/i, "") || "Webxdc App";
  } catch {
    return "Webxdc App";
  }
}

// ============================================================================
// Rumor constructors
// ============================================================================

/**
 * Creates a kind 4932 state-update rumor to be sent via MLS.
 * Maps to webxdc sendUpdate() API.
 */
export function createWebxdcUpdateRumor(
  pubkey: string,
  webxdcId: string,
  update: WebxdcUpdatePayload,
): Rumor {
  const tags: string[][] = [
    ["i", webxdcId],
    ["alt", "Webxdc update"],
  ];
  if (update.info) tags.push(["info", update.info]);
  if (update.document) tags.push(["document", update.document]);
  if (update.summary) tags.push(["summary", update.summary]);

  const rumor: Rumor = {
    id: "",
    kind: WEBXDC_UPDATE_KIND,
    pubkey,
    created_at: unixNow(),
    content: JSON.stringify(update.payload),
    tags,
  };
  rumor.id = getEventHash(rumor);
  return rumor;
}

/**
 * Creates a kind 20932 realtime-channel rumor to be sent via MLS.
 * Maps to webxdc realtimeChannel.send() API.
 */
export function createWebxdcRealtimeRumor(
  pubkey: string,
  webxdcId: string,
  data: Uint8Array,
): Rumor {
  const rumor: Rumor = {
    id: "",
    kind: WEBXDC_REALTIME_KIND,
    pubkey,
    created_at: unixNow(),
    content: btoa(String.fromCharCode(...data)),
    tags: [["i", webxdcId]],
  };
  rumor.id = getEventHash(rumor);
  return rumor;
}

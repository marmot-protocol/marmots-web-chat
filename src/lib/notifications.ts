/**
 * MIP-05 notification server configuration helpers.
 *
 * Reads `VITE_NOTIFICATION_SERVER_PUBKEY` from the build environment, fetches
 * the server's kind:10050 DM relay list event to resolve the full
 * {@link WebPushServerConfig}, and exposes a reactive observable so components
 * can subscribe to the resolved config.
 *
 * The VAPID key is encoded in the `vapid` tag of the kind:10050 event:
 *   ["vapid", "<base64url-unpadded-uncompressed-P-256-pubkey>"]
 */

import type { WebPushServerConfig } from "@internet-privacy/marmot-ts";
import { mapEventsToTimeline } from "applesauce-core";
import { npubEncode } from "applesauce-core/helpers";
import {
  BehaviorSubject,
  firstValueFrom,
  from,
  type Observable,
  shareReplay,
} from "rxjs";
import { catchError } from "rxjs/operators";

import { pool } from "@/lib/nostr";
import { extraRelays$ } from "@/lib/settings";

// ---------------------------------------------------------------------------
// Env var
// ---------------------------------------------------------------------------

/**
 * The raw value of `VITE_NOTIFICATION_SERVER_PUBKEY`.
 * May be a 64-char hex pubkey.
 * `undefined` means the feature is disabled for this build.
 */
export const notificationServerPubkeyRaw: string | undefined = import.meta.env
  .VITE_NOTIFICATION_SERVER_PUBKEY;

/**
 * Resolved hex pubkey. Only plain 64-char hex is supported as a build-time
 * constant; npub/bech32 should be converted to hex before setting the env var.
 */
export const notificationServerPubkey: string | undefined = (() => {
  const raw = notificationServerPubkeyRaw;
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return trimmed.toLowerCase();
  return undefined;
})();

// ---------------------------------------------------------------------------
// kind:10050 fetch
// ---------------------------------------------------------------------------

const DM_RELAY_LIST_KIND = 10050;

/**
 * Fetches the notification server's kind:10050 (DM Relay List) event and
 * constructs a {@link WebPushServerConfig} from it.
 *
 * The kind:10050 event format (NIP-17 + MIP-05):
 *   - `relay` tags: the server's inbox relay URLs
 *   - `vapid` tag: the base64url-encoded VAPID public key (MIP-05 extension)
 *
 * @param serverPubkey - 64-char hex Nostr public key of the notification server
 * @param relays - Relay URLs to query (defaults to extra relays)
 * @returns Resolved config, or `null` if the event is not found / has no VAPID key
 */
export async function fetchNotificationServerConfig(
  serverPubkey: string,
  relays?: string[],
): Promise<WebPushServerConfig | null> {
  const queryRelays = relays ?? extraRelays$.getValue();

  try {
    const timeline = await firstValueFrom(
      pool
        .request(queryRelays, [
          { kinds: [DM_RELAY_LIST_KIND], authors: [serverPubkey], limit: 1 },
        ])
        .pipe(mapEventsToTimeline()),
    );

    const event = timeline[0];
    if (!event) return null;

    // Extract relay URLs from `relay` tags
    const serverRelays = event.tags
      .filter((t: string[]) => t[0] === "relay" && t[1])
      .map((t: string[]) => t[1]);

    // Extract VAPID key from `vapid` tag (MIP-05 extension to kind:10050)
    const vapidTag = event.tags.find((t: string[]) => t[0] === "vapid" && t[1]);
    if (!vapidTag) {
      // Server has no VAPID key — cannot do Web Push
      return null;
    }
    const vapidKey = vapidTag[1];

    return {
      platform: "web-push",
      pubkey: serverPubkey,
      relays: serverRelays.length > 0 ? serverRelays : queryRelays,
      vapidKey,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reactive observable
// ---------------------------------------------------------------------------

/**
 * Observable that resolves and emits the notification server's
 * {@link WebPushServerConfig} whenever the pubkey is configured.
 *
 * Emits `null` if:
 * - `VITE_NOTIFICATION_SERVER_PUBKEY` is not set
 * - The kind:10050 event cannot be found
 * - The server has no VAPID key
 *
 * Uses `shareReplay(1)` so the fetch is only done once per subscriber chain.
 */
export const notificationServerConfig$: Observable<WebPushServerConfig | null> =
  notificationServerPubkey
    ? from(fetchNotificationServerConfig(notificationServerPubkey)).pipe(
        catchError(() => from([null as WebPushServerConfig | null])),
        shareReplay(1),
      )
    : new BehaviorSubject<WebPushServerConfig | null>(null).asObservable();

// ---------------------------------------------------------------------------
// Per-group notification preference persistence
// ---------------------------------------------------------------------------

const NOTIFICATION_PREFS_KEY = "mip05-notification-prefs";

/** Persisted map of groupId (hex) → whether notifications are enabled */
function loadNotificationPrefs(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(NOTIFICATION_PREFS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    // ignore
  }
  return {};
}

function saveNotificationPrefs(prefs: Record<string, boolean>): void {
  try {
    localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

/** Returns whether the user has enabled notifications for a specific group */
export function isGroupNotificationEnabled(groupIdHex: string): boolean {
  return loadNotificationPrefs()[groupIdHex] ?? false;
}

/** Persists the notification preference for a specific group */
export function setGroupNotificationEnabled(
  groupIdHex: string,
  enabled: boolean,
): void {
  const prefs = loadNotificationPrefs();
  prefs[groupIdHex] = enabled;
  saveNotificationPrefs(prefs);
}

// ---------------------------------------------------------------------------
// Web Push subscription helpers
// ---------------------------------------------------------------------------

/**
 * Converts a base64url-encoded string (no padding) to a `Uint8Array<ArrayBuffer>`.
 * Used to pass the VAPID public key to `PushManager.subscribe()`.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buf = new ArrayBuffer(rawData.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < rawData.length; i++) {
    bytes[i] = rawData.charCodeAt(i);
  }
  return bytes as Uint8Array<ArrayBuffer>;
}

/**
 * Requests browser push notification permission and creates a Web Push
 * subscription using the server's VAPID public key.
 *
 * @param serverConfig - The resolved notification server config (must have `platform: "web-push"`)
 * @returns The browser's {@link PushSubscription}, or `null` if permission was denied
 * @throws If Web Push is not supported in this browser
 */
export async function subscribeToPush(
  serverConfig: WebPushServerConfig,
): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Web Push is not supported in this browser.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const registration = await navigator.serviceWorker.ready;

  const vapidBytes = urlBase64ToUint8Array(serverConfig.vapidKey);

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidBytes,
  });

  return subscription;
}

/**
 * Converts a browser {@link PushSubscription} to the MIP-05
 * `WebPushSubscription` shape expected by `NotificationManager.register()`.
 */
export function toMip05WebPushSubscription(sub: PushSubscription): {
  type: "web-push";
  endpoint: string;
  p256dh: Uint8Array;
  auth: Uint8Array;
} {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("PushSubscription is missing required fields");
  }
  return {
    type: "web-push",
    endpoint: json.endpoint,
    p256dh: urlBase64ToUint8Array(json.keys.p256dh),
    auth: urlBase64ToUint8Array(json.keys.auth),
  };
}

/** Gets the existing Web Push subscription for this browser, if any. */
export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** Unsubscribes the browser from Web Push at the device level. */
export async function unsubscribeFromPush(): Promise<void> {
  const sub = await getExistingPushSubscription();
  if (sub) await sub.unsubscribe();
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** Returns the npub encoding of a hex pubkey, for display. */
export function pubkeyToNpub(hex: string): string {
  try {
    return npubEncode(hex);
  } catch {
    return hex;
  }
}

// Re-export types
export type { WebPushServerConfig };

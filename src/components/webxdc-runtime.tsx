import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import { getDisplayName, getEventHash } from "applesauce-core/helpers";
import { npubEncode } from "applesauce-core/helpers/pointers";
import { use$ } from "applesauce-react/hooks";
import {
  type GroupRumorHistory,
  type MarmotGroup,
  unixNow,
} from "@internet-privacy/marmots";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWebxdcUpdates } from "@/hooks/use-webxdc-updates";
import { accounts } from "@/lib/accounts";
import { eventStore } from "@/lib/nostr";
import {
  createWebxdcRealtimeRumor,
  createWebxdcUpdateRumor,
  getAppNameFromUrl,
  getWebxdcId,
  WEBXDC_REALTIME_KIND,
  type WebxdcReceivedUpdate,
  type WebxdcUpdatePayload,
} from "@/lib/webxdc";

// ============================================================================
// Logging
// ============================================================================

const log = {
  info: (msg: string, ...args: unknown[]) =>
    console.log(`[webxdc] ${msg}`, ...args),
  send: (msg: string, ...args: unknown[]) =>
    console.log(`%c[webxdc ↑ send] ${msg}`, "color: #4ade80", ...args),
  recv: (msg: string, ...args: unknown[]) =>
    console.log(`%c[webxdc ↓ recv] ${msg}`, "color: #60a5fa", ...args),
  error: (msg: string, ...args: unknown[]) =>
    console.error(`[webxdc] ${msg}`, ...args),
};

// ============================================================================
// JSON-RPC helpers
// ============================================================================

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

function rpcResponse(id: number | string, result: unknown): object {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: number | string, message: string): object {
  return { jsonrpc: "2.0", id, error: { code: -1, message } };
}

function rpcNotify(method: string, params?: unknown): JsonRpcNotification {
  return {
    jsonrpc: "2.0",
    method,
    ...(params !== undefined ? { params } : {}),
  };
}

// ============================================================================
// Props
// ============================================================================

interface WebxdcRuntimeProps {
  /** The MLS group this app runs in */
  group: MarmotGroup<GroupRumorHistory>;
  /** Stable coordinator ID derived from the kind 9 rumor that shared the app */
  webxdcId: string;
  /** URL of the .xdc ZIP file */
  xdcUrl: string;
  /** Called when the user closes the runtime */
  onClose: () => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Full-screen modal that runs a webxdc app in a sandboxed iframe hosted on
 * webxdc.app. Implements the JSON-RPC postMessage bridge between the iframe
 * and the MLS group.
 *
 * State updates (sendUpdate) are published as kind 4932 MLS rumors.
 * Realtime data (realtimeChannel.send) is published as kind 20932 MLS rumors.
 * Both are invisible in the chat message list.
 */
export function WebxdcRuntime({
  group,
  webxdcId,
  xdcUrl,
  onClose,
}: WebxdcRuntimeProps) {
  const account = use$(accounts.active$);
  const profile = use$(
    () => (account ? eventStore.profile(account.pubkey) : undefined),
    [account],
  );

  // All stored state updates for this webxdc ID (for history replay)
  const storedUpdates = useWebxdcUpdates(group, webxdcId);
  const storedUpdatesRef = useRef<WebxdcReceivedUpdate[]>(storedUpdates);
  useEffect(() => {
    storedUpdatesRef.current = storedUpdates;
  }, [storedUpdates]);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [initSent, setInitSent] = useState(false);
  const [status, setStatus] = useState<"loading" | "running" | "error">(
    "loading",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Track active realtime channel subscriptions: channelId → webxdcId
  const realtimeChannels = useRef<Map<string, string>>(new Map());

  // Stable random subdomain for this session
  const subdomain = useRef<string>(
    Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
  );

  const iframeSrc = `https://${subdomain.current}.webxdc.app/`;
  const appName = getAppNameFromUrl(xdcUrl);

  // ── Send a message to the iframe ──────────────────────────────────────────

  const sendToIframe = useCallback(
    (msg: object, transferables?: Transferable[]) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      if (transferables && transferables.length > 0) {
        win.postMessage(msg, "*", transferables);
      } else {
        win.postMessage(msg, "*");
      }
    },
    [],
  );

  // ── Deliver a stored/live update to the iframe ────────────────────────────

  const deliverUpdate = useCallback(
    (update: WebxdcReceivedUpdate) => {
      sendToIframe(rpcNotify("webxdc.update", { update }));
    },
    [sendToIframe],
  );

  // ── Send webxdc.init once the frame is ready and we have the .xdc bytes ──

  const sendInit = useCallback(async () => {
    if (!account) return;
    try {
      const res = await fetch(xdcUrl);
      if (!res.ok)
        throw new Error(
          `Failed to fetch .xdc: ${res.status} ${res.statusText}`,
        );
      const xdcBuffer = await res.arrayBuffer();

      const selfAddr = npubEncode(account.pubkey);
      const selfName = getDisplayName(profile, selfAddr);

      log.info(
        "fetched .xdc (%d bytes), sending init as %s (%s)",
        xdcBuffer.byteLength,
        selfName,
        selfAddr,
      );

      const msg = {
        jsonrpc: "2.0",
        method: "webxdc.init",
        params: {
          xdc: xdcBuffer,
          selfAddr,
          selfName,
          sendUpdateInterval: 0,
          sendUpdateMaxSize: 128000,
        },
      };

      // Transfer the ArrayBuffer for zero-copy
      sendToIframe(msg, [xdcBuffer]);
      setInitSent(true);
      setStatus("running");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("init failed:", msg);
      setStatus("error");
      setErrorMsg(msg);
    }
  }, [account, xdcUrl, profile, sendToIframe]);

  useEffect(() => {
    if (iframeReady && !initSent) {
      sendInit();
    }
  }, [iframeReady, initSent, sendInit]);

  // ── Handle incoming JSON-RPC messages from the iframe ────────────────────

  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const msg = event.data as JsonRpcRequest | JsonRpcNotification;
      if (!msg || msg.jsonrpc !== "2.0") return;

      // --- Notification: frame is ready ---
      if (msg.method === "webxdc.ready" && !("id" in msg)) {
        log.info("frame ready, sending init");
        setIframeReady(true);
        return;
      }

      // --- Requests (have an id) ---
      if (!("id" in msg) || msg.id === undefined) return;
      const req = msg as JsonRpcRequest;

      switch (req.method) {
        // ── sendUpdate ──────────────────────────────────────────────────────
        case "webxdc.sendUpdate": {
          if (!account) {
            sendToIframe(rpcError(req.id, "No active account"));
            return;
          }
          try {
            const params = req.params as {
              update: WebxdcUpdatePayload;
              descr?: string;
            };
            log.send(
              "sendUpdate payload=%o info=%s",
              params.update.payload,
              params.update.info ?? "",
            );
            const pubkey = await account.signer.getPublicKey();
            const rumor = createWebxdcUpdateRumor(
              pubkey,
              webxdcId,
              params.update,
            );
            await group.sendApplicationRumor(rumor);
            if (group.history) await group.history.saveRumor(rumor);
            log.send("sendUpdate published rumor %s", rumor.id);
            sendToIframe(rpcResponse(req.id, null));
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            log.error("sendUpdate failed:", msg);
            sendToIframe(rpcError(req.id, msg));
          }
          break;
        }

        // ── setUpdateListener ───────────────────────────────────────────────
        case "webxdc.setUpdateListener": {
          const params = req.params as { serial?: number };
          const fromSerial = params?.serial ?? 0;
          // Backfill all updates with serial > fromSerial
          const backfill = storedUpdatesRef.current.filter(
            (u) => u.serial > fromSerial,
          );
          log.info(
            "setUpdateListener from serial %d — backfilling %d update(s)",
            fromSerial,
            backfill.length,
          );
          for (const update of backfill) {
            log.recv(
              "backfill update serial=%d payload=%o",
              update.serial,
              update.payload,
            );
            sendToIframe(rpcNotify("webxdc.update", { update }));
          }
          sendToIframe(rpcResponse(req.id, null));
          break;
        }

        // ── getAllUpdates (deprecated) ───────────────────────────────────────
        case "webxdc.getAllUpdates": {
          sendToIframe(rpcResponse(req.id, storedUpdatesRef.current));
          break;
        }

        // ── sendToChat ──────────────────────────────────────────────────────
        case "webxdc.sendToChat": {
          if (!account) {
            sendToIframe(rpcError(req.id, "No active account"));
            return;
          }
          try {
            const params = req.params as {
              message: { text?: string; file?: unknown };
            };
            const text = params?.message?.text;
            if (text) {
              const pubkey = await account.signer.getPublicKey();
              const rumor: Rumor = {
                id: "",
                kind: 9,
                pubkey,
                created_at: unixNow(),
                content: text,
                tags: [],
              };
              rumor.id = getEventHash(rumor);
              await group.sendApplicationRumor(rumor);
              if (group.history) await group.history.saveRumor(rumor);
            }
            sendToIframe(rpcResponse(req.id, null));
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            sendToIframe(rpcError(req.id, msg));
          }
          break;
        }

        // ── joinRealtimeChannel ─────────────────────────────────────────────
        case "webxdc.joinRealtimeChannel": {
          const channelId = crypto.randomUUID();
          realtimeChannels.current.set(channelId, webxdcId);
          log.info("joinRealtimeChannel channelId=%s", channelId);
          sendToIframe(rpcResponse(req.id, { channelId }));
          break;
        }

        // ── realtimeChannel.send ────────────────────────────────────────────
        case "webxdc.realtimeChannel.send": {
          if (!account) {
            sendToIframe(rpcError(req.id, "No active account"));
            return;
          }
          try {
            const params = req.params as { channelId: string; data: number[] };
            const data = new Uint8Array(params.data);
            log.send(
              "realtimeChannel.send channelId=%s bytes=%d",
              params.channelId,
              data.byteLength,
            );
            const pubkey = await account.signer.getPublicKey();
            const rumor = createWebxdcRealtimeRumor(pubkey, webxdcId, data);
            await group.sendApplicationRumor(rumor);
            // Realtime rumors are ephemeral — do not save to history
            sendToIframe(rpcResponse(req.id, null));
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            log.error("realtimeChannel.send failed:", msg);
            sendToIframe(rpcError(req.id, msg));
          }
          break;
        }

        // ── realtimeChannel.leave ───────────────────────────────────────────
        case "webxdc.realtimeChannel.leave": {
          const params = req.params as { channelId: string };
          realtimeChannels.current.delete(params.channelId);
          log.info("realtimeChannel.leave channelId=%s", params.channelId);
          sendToIframe(rpcResponse(req.id, null));
          break;
        }

        // ── importFiles ─────────────────────────────────────────────────────
        case "webxdc.importFiles": {
          // Not implemented — return empty array
          sendToIframe(rpcResponse(req.id, []));
          break;
        }

        default:
          sendToIframe(rpcError(req.id, `Unknown method: ${req.method}`));
      }
    },
    [account, group, webxdcId, sendToIframe],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  // ── Deliver live updates and realtime data from other peers ──────────────

  useEffect(() => {
    if (!group?.history) return;
    const listener = (rumor: Rumor) => {
      const rumorWebxdcId = getWebxdcId(rumor);
      if (rumorWebxdcId !== webxdcId) return;

      if (rumor.kind === WEBXDC_REALTIME_KIND) {
        // Decode base64 → byte array
        const raw = atob(rumor.content);
        const data = Array.from(raw, (c) => c.charCodeAt(0));
        log.recv(
          "realtimeChannel.data bytes=%d from %s",
          data.length,
          rumor.pubkey.slice(0, 8),
        );
        // Deliver to all realtime channels for this webxdc ID
        for (const [channelId, cid] of realtimeChannels.current) {
          if (cid === webxdcId) {
            sendToIframe(
              rpcNotify("webxdc.realtimeChannel.data", { channelId, data }),
            );
          }
        }
      }
      // Note: kind 4932 updates are delivered via deliverUpdate which is called
      // separately when storedUpdates changes (live updates routed by useWebxdcUpdates)
    };
    group.history.addListener("rumor", listener);
    return () => {
      group?.history?.removeListener("rumor", listener);
    };
  }, [group, webxdcId, sendToIframe]);

  // Deliver newly arriving state updates (after setUpdateListener has been called)
  const lastDeliveredSerial = useRef(0);
  useEffect(() => {
    if (!initSent) return;
    const newUpdates = storedUpdates.filter(
      (u) => u.serial > lastDeliveredSerial.current,
    );
    if (newUpdates.length === 0) return;
    for (const update of newUpdates) {
      log.recv(
        "live update serial=%d/%d payload=%o",
        update.serial,
        update.max_serial,
        update.payload,
      );
      deliverUpdate(update);
    }
    lastDeliveredSerial.current =
      storedUpdates[storedUpdates.length - 1]?.serial ??
      lastDeliveredSerial.current;
  }, [storedUpdates, initSent, deliverUpdate]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-[calc(100vw-2rem)] h-[calc(100vh-2rem)] flex flex-col p-0 gap-0">
        <DialogHeader className="flex flex-row items-center justify-between px-4 py-2 border-b shrink-0">
          <DialogTitle className="text-sm font-medium">{appName}</DialogTitle>
          {status === "loading" && (
            <span className="text-xs text-muted-foreground">Loading…</span>
          )}
          {status === "error" && (
            <span className="text-xs text-destructive truncate max-w-xs">
              {errorMsg}
            </span>
          )}
        </DialogHeader>

        <div className="flex-1 relative overflow-hidden">
          {status === "error" ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
              <p className="text-sm">Failed to load app</p>
              <p className="text-xs max-w-sm text-center text-destructive">
                {errorMsg}
              </p>
              <Button variant="outline" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              src={iframeSrc}
              title={appName}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin"
              allow="fullscreen"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { createTokenListResponseRumor } from "@internet-privacy/marmot-ts";
import { use$ } from "applesauce-react/hooks";
import { BellIcon, BellOffIcon, Loader2Icon, ServerIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useGroup } from "@/contexts/group-context";
import { accounts } from "@/lib/accounts";
import {
  fetchNotificationServerConfig,
  getExistingPushSubscription,
  isGroupNotificationEnabled,
  notificationServerPubkey,
  pubkeyToNpub,
  setGroupNotificationEnabled,
  subscribeToPush,
  toMip05WebPushSubscription,
  type WebPushServerConfig,
} from "@/lib/notifications";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function NotConfiguredBanner() {
  return (
    <Alert>
      <ServerIcon className="h-4 w-4" />
      <AlertDescription>
        No notification server is configured for this build. Set{" "}
        <code className="text-xs bg-muted px-1 rounded">
          VITE_NOTIFICATION_SERVER_PUBKEY
        </code>{" "}
        to a server's Nostr pubkey to enable push notifications.
      </AlertDescription>
    </Alert>
  );
}

function NotSupportedBanner() {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        Web Push is not supported in this browser. Try Chrome, Firefox, or Edge
        on a supported platform.
      </AlertDescription>
    </Alert>
  );
}

function PermissionDeniedBanner() {
  return (
    <Alert variant="destructive">
      <AlertDescription>
        Notification permission was denied. You can re-enable it in your
        browser's site settings, then try again.
      </AlertDescription>
    </Alert>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function GroupNotificationsPage() {
  const { group } = useGroup();
  const account = use$(accounts.active$);

  // Whether the browser supports Web Push
  const supportsWebPush =
    "serviceWorker" in navigator && "PushManager" in window;

  // Server config (resolved lazily — fetched on mount if pubkey is set)
  const [serverConfig, setServerConfig] = useState<WebPushServerConfig | null>(
    null,
  );
  const [loadingServer, setLoadingServer] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Toggle state
  const [enabled, setEnabled] = useState(
    isGroupNotificationEnabled(group.idStr),
  );
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  // Registered token count for this group
  const [tokenCount, setTokenCount] = useState<number | null>(null);

  // Fetch kind:10050 server config on mount
  useEffect(() => {
    if (!notificationServerPubkey) return;
    setLoadingServer(true);
    fetchNotificationServerConfig(notificationServerPubkey)
      .then((config) => {
        setServerConfig(config);
        if (!config) {
          setServerError(
            "Could not resolve notification server config (kind:10050 not found or missing VAPID key).",
          );
        }
      })
      .catch((err: unknown) => {
        setServerError(
          err instanceof Error ? err.message : "Failed to fetch server config",
        );
      })
      .finally(() => setLoadingServer(false));
  }, []);

  // Load current registration state on mount
  useEffect(() => {
    const mgr = group.notifications;
    if (!mgr) return;
    mgr
      .getTokens()
      .then((tokens) => setTokenCount(tokens.length))
      .catch(() => {});
  }, [group.notifications]);

  // Refresh token count when manager emits changes
  useEffect(() => {
    const mgr = group.notifications;
    if (!mgr) return;
    const refresh = () => {
      mgr
        .getTokens()
        .then((tokens) => setTokenCount(tokens.length))
        .catch(() => {});
    };
    mgr.on("tokenRegistered", refresh);
    mgr.on("tokenRemoved", refresh);
    mgr.on("tokensPruned", refresh);
    return () => {
      mgr.off("tokenRegistered", refresh);
      mgr.off("tokenRemoved", refresh);
      mgr.off("tokensPruned", refresh);
    };
  }, [group.notifications]);

  // Check for an existing subscription on mount to reconcile state
  useEffect(() => {
    if (!supportsWebPush) return;
    getExistingPushSubscription()
      .then((sub) => {
        // If no browser subscription exists but we think we're enabled, clear
        if (!sub && enabled) {
          setEnabled(false);
          setGroupNotificationEnabled(group.idStr, false);
        }
      })
      .catch(() => {});
  }, [group.idStr, enabled, supportsWebPush]);

  const handleEnable = useCallback(async () => {
    if (!serverConfig || !group.notifications || !account) return;
    setToggling(true);
    setToggleError(null);
    setPermissionDenied(false);

    try {
      const browserSub = await subscribeToPush(serverConfig);
      if (!browserSub) {
        // User denied permission
        setPermissionDenied(true);
        return;
      }

      const mip05Sub = toMip05WebPushSubscription(browserSub);

      // Determine our MLS leaf index
      const pubkey = account.pubkey;
      const { getPubkeyLeafNodeIndexes } =
        await import("@internet-privacy/marmot-ts");
      const leafIndexes = getPubkeyLeafNodeIndexes(group.state, pubkey);
      const leafIndex = leafIndexes[0] ?? 0;

      const rumor = await group.notifications.register(
        mip05Sub,
        serverConfig,
        leafIndex,
      );
      await group.sendApplicationRumor(rumor);

      setEnabled(true);
      setGroupNotificationEnabled(group.idStr, true);

      // Refresh token count
      const tokens = await group.notifications.getTokens();
      setTokenCount(tokens.length);
    } catch (err) {
      setToggleError(
        err instanceof Error ? err.message : "Failed to enable notifications",
      );
    } finally {
      setToggling(false);
    }
  }, [serverConfig, group, account]);

  const handleDisable = useCallback(async () => {
    if (!group.notifications || !account) return;
    setToggling(true);
    setToggleError(null);

    try {
      const pubkey = account.pubkey;
      const { getPubkeyLeafNodeIndexes } =
        await import("@internet-privacy/marmot-ts");
      const leafIndexes = getPubkeyLeafNodeIndexes(group.state, pubkey);
      const leafIndex = leafIndexes[0] ?? 0;

      const rumor = await group.notifications.unregister(leafIndex);
      await group.sendApplicationRumor(rumor);

      // Unsubscribe at the browser level
      const { unsubscribeFromPush: doUnsubscribe } =
        await import("@/lib/notifications");
      await doUnsubscribe();

      setEnabled(false);
      setGroupNotificationEnabled(group.idStr, false);

      // Refresh token count
      const tokens = await group.notifications.getTokens();
      setTokenCount(tokens.length);
    } catch (err) {
      setToggleError(
        err instanceof Error ? err.message : "Failed to disable notifications",
      );
    } finally {
      setToggling(false);
    }
  }, [group, account]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!notificationServerPubkey) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <h2 className="text-xl font-semibold">Push Notifications</h2>
        <NotConfiguredBanner />
      </div>
    );
  }

  if (!supportsWebPush) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <h2 className="text-xl font-semibold">Push Notifications</h2>
        <NotSupportedBanner />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Push Notifications</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Receive push notifications when new messages arrive in this group,
          even when the app is closed.
        </p>
      </div>

      <Separator />

      {/* Server info */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Notification Server</h3>
        <div className="rounded-lg border p-3 space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <ServerIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            <code className="text-xs bg-muted px-1 rounded break-all select-all">
              {pubkeyToNpub(notificationServerPubkey)}
            </code>
          </div>
          {loadingServer && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2Icon className="h-3 w-3 animate-spin" />
              <span className="text-xs">Resolving server config…</span>
            </div>
          )}
          {serverConfig && !loadingServer && (
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>
                <span className="font-medium">VAPID:</span>{" "}
                <code className="bg-muted px-1 rounded">
                  {serverConfig.vapidKey.slice(0, 20)}…
                </code>
              </p>
              {serverConfig.relays.length > 0 && (
                <p>
                  <span className="font-medium">Relay:</span>{" "}
                  {serverConfig.relays[0]}
                </p>
              )}
            </div>
          )}
          {serverError && !loadingServer && (
            <p className="text-xs text-destructive">{serverError}</p>
          )}
        </div>
      </div>

      <Separator />

      {/* Enable / disable toggle */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Your Registration</h3>

        {permissionDenied && <PermissionDeniedBanner />}

        {toggleError && (
          <Alert variant="destructive">
            <AlertDescription>{toggleError}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">
              {enabled
                ? "Notifications enabled for this group"
                : "Notifications disabled"}
            </p>
            <p className="text-xs text-muted-foreground">
              {enabled
                ? "You will receive push notifications for new messages."
                : "Enable to receive push notifications when messages arrive."}
            </p>
          </div>

          <Button
            variant={enabled ? "destructive" : "default"}
            size="sm"
            disabled={
              toggling ||
              loadingServer ||
              !!serverError ||
              !serverConfig ||
              !group.notifications
            }
            onClick={enabled ? handleDisable : handleEnable}
          >
            {toggling ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : enabled ? (
              <>
                <BellOffIcon className="h-4 w-4 mr-1" />
                Disable
              </>
            ) : (
              <>
                <BellIcon className="h-4 w-4 mr-1" />
                Enable
              </>
            )}
          </Button>
        </div>

        {!group.notifications && (
          <p className="text-xs text-muted-foreground">
            Notification manager not available. Reload the page and try again.
          </p>
        )}
      </div>

      {/* Member registration stats */}
      {tokenCount !== null && (
        <>
          <Separator />
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Group Registration Status</h3>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{tokenCount}</span>{" "}
              {tokenCount === 1 ? "member has" : "members have"} registered for
              push notifications in this group.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import { IconApps } from "@tabler/icons-react";
import { useState } from "react";

import { deriveWebxdcId, getAppNameFromUrl, getWebxdcUrl } from "@/lib/webxdc";

interface WebxdcAppCardProps {
  /** The kind 9 rumor whose content is a bare .xdc URL */
  rumor: Rumor;
  /** Called when the user clicks Launch */
  onLaunch: (webxdcId: string, xdcUrl: string) => void;
}

/**
 * Renders an inline app card for a kind 9 rumor whose content is a .xdc URL.
 * Shown instead of the normal text bubble in the chat message list.
 */
export function WebxdcAppCard({ rumor, onLaunch }: WebxdcAppCardProps) {
  const xdcUrl = getWebxdcUrl(rumor)!;
  const appName = getAppNameFromUrl(xdcUrl);
  const webxdcId = deriveWebxdcId(rumor.id);

  const [iconError, setIconError] = useState(false);

  // Derive a short hostname label for the source URL
  let sourceHost = "";
  try {
    sourceHost = new URL(xdcUrl).hostname;
  } catch {
    // ignore
  }

  // The icon is inside the .xdc ZIP served by webxdc.app once running.
  // We attempt to load it from the same origin as the .xdc file as a preview.
  let iconUrl: string | null = null;
  try {
    const u = new URL(xdcUrl);
    iconUrl = `${u.origin}/icon.png`;
  } catch {
    // ignore
  }

  return (
    <div
      className="rounded-xl border bg-card shadow-sm overflow-hidden w-72 cursor-pointer group"
      onClick={() => onLaunch(webxdcId, xdcUrl)}
    >
      {/* Icon banner */}
      <div className="flex items-center justify-center bg-muted h-28">
        {!iconError && iconUrl ? (
          <img
            src={iconUrl}
            alt={appName}
            className="h-20 w-20 rounded-2xl object-contain shadow"
            onError={() => setIconError(true)}
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-background shadow">
            <IconApps className="h-10 w-10 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col gap-0.5 px-4 py-3">
        <span className="truncate font-semibold text-sm">{appName}</span>
        <span className="truncate text-xs text-muted-foreground">
          Mini app · {sourceHost}
        </span>
      </div>
    </div>
  );
}

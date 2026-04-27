import { NewDirectMessageRelays } from "applesauce-actions/actions";
import { createKeyPackageRelayListEvent } from "@internet-privacy/marmot-ts";
import { IconKey, IconLoader2 } from "@tabler/icons-react";
import { relaySet } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { accounts, actions, user$ } from "@/lib/accounts";
import { keyPackageRelays$ } from "@/lib/lifecycle";
import { liveKeyPackages$, marmotClient$ } from "@/lib/marmot-client";
import { extraRelays$, lookupRelays$ } from "@/lib/settings";

/**
 * One-click onboarding CTA that:
 * 1. Publishes a DM relay list (kind 10050) if the user has none
 * 2. Publishes a key package relay list (kind 10051) if the user has none
 * 3. Creates a first key package (kind 30443)
 *
 * Renders null when all three are already set up, or while loading.
 *
 * @example
 * <PublishKeyPackageCta />
 */
export function PublishKeyPackageCta() {
  const keyPackageRelays = use$(keyPackageRelays$);
  const dmRelays = use$(user$.directMessageRelays$);
  const keyPackages = use$(liveKeyPackages$);
  const client = use$(marmotClient$);

  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // Still loading — avoid a flash
  if (
    keyPackageRelays === undefined ||
    dmRelays === undefined ||
    keyPackages === undefined
  )
    return null;

  // Already fully set up — hide permanently
  const hasKeyPackageRelays = keyPackageRelays.length > 0;
  const hasDmRelays = dmRelays.length > 0;
  const hasKeyPackage = keyPackages.length > 0;
  if (hasKeyPackageRelays && hasDmRelays && hasKeyPackage) return null;

  const handleSetup = async () => {
    const account = accounts.active;
    if (!account) return;
    if (!client) return;

    setStatus("working");
    setError(null);

    try {
      const defaults = extraRelays$.value;
      const lookupRelays = lookupRelays$.value;

      // Step 1: publish DM relay list (kind 10050) if not already configured
      if (!hasDmRelays) {
        await actions.run(NewDirectMessageRelays, defaults);
      }

      // Step 2: publish key package relay list (kind 10051) if not already configured
      let kpRelays = keyPackageRelays;
      if (!hasKeyPackageRelays) {
        const unsignedEvent = createKeyPackageRelayListEvent({
          pubkey: account.pubkey,
          relays: defaults,
          client: "marmot-chat",
        });
        const signedEvent = await account.signEvent(unsignedEvent);

        const publishingRelays = relaySet(defaults, lookupRelays);
        await actions.publish(signedEvent, publishingRelays);

        kpRelays = defaults;
      }

      // Step 3: create key package
      await client.keyPackages.create({
        relays: kpRelays,
        ciphersuite: "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519",
        client: "marmot-chat",
      });

      setStatus("idle");
    } catch (err) {
      console.error("Failed to set up key package:", err);
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  const isWorking = status === "working";

  return (
    <Card className="bg-muted/40 border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <IconKey className="h-4 w-4 text-muted-foreground" />
          You're almost ready to chat
        </CardTitle>
        <CardDescription className="text-sm">
          Publish your key package so contacts can invite you to encrypted
          groups. This sets up your relay list and generates a key package in
          one click.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={handleSetup} disabled={isWorking || !client} size="sm">
          {isWorking ? (
            <>
              <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
              Setting up…
            </>
          ) : (
            "Get Set Up"
          )}
        </Button>

        {status === "error" && error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}

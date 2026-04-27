import {
  ADDRESSABLE_KEY_PACKAGE_KIND,
  createKeyPackageRelayListEvent,
} from "@internet-privacy/marmot-ts";
import {
  AddDirectMessageRelay,
  RemoveDirectMessageRelay,
} from "applesauce-actions/actions";
import { relaySet } from "applesauce-core/helpers";
import { use$ } from "applesauce-react/hooks";
import { useMemo, useState } from "react";
import { from } from "rxjs";

import { EventStatusButton } from "@/components/event-status-button";
import { PageBody } from "@/components/page-body";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { accounts, actions, user$ } from "@/lib/accounts";
import { keyPackageRelays$, publishedKeyPackages$ } from "@/lib/lifecycle";
import { marmotClient$ } from "@/lib/marmot-client";
import { extraRelays$, lookupRelays$ } from "@/lib/settings";
import { formatTimeAgo } from "@/lib/time";
import { NewRelayForm, RelayItem } from "./relays";

function ClientKeyPackageSection() {
  const client = use$(marmotClient$);
  const keyPackages = use$(
    () => (client ? from(client.keyPackages.watchKeyPackages()) : undefined),
    [client],
  );
  const keyPackageRelays = use$(keyPackageRelays$);

  // Start key package subscription
  use$(publishedKeyPackages$);

  const clientId = client?.keyPackages.clientId;

  const matchingKeyPackage = useMemo(() => {
    if (!clientId || !keyPackages) return undefined;
    return keyPackages.find((pkg) => pkg.identifier === clientId);
  }, [clientId, keyPackages]);

  const latestEvent = useMemo(() => {
    const addressableEvents = matchingKeyPackage?.published?.filter(
      (event) => event.kind === ADDRESSABLE_KEY_PACKAGE_KIND,
    );
    if (!addressableEvents || addressableEvents.length === 0) return undefined;
    return addressableEvents.reduce((latest, event) =>
      event.created_at > latest.created_at ? event : latest,
    );
  }, [matchingKeyPackage]);

  const [isRotating, setIsRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [rotateSuccess, setRotateSuccess] = useState(false);

  const handleRotate = async () => {
    if (!client || !matchingKeyPackage) return;

    try {
      setIsRotating(true);
      setRotateError(null);
      setRotateSuccess(false);

      // Rotate publishes a new addressable key package event under the same
      // `d` slot — relays automatically replace the old event.
      await client.keyPackages.rotate(matchingKeyPackage.keyPackageRef, {
        relays: keyPackageRelays ?? undefined,
        client: "marmot-chat",
      });

      setRotateSuccess(true);
      setTimeout(() => setRotateSuccess(false), 3000);
    } catch (err) {
      console.error("Error rotating key package:", err);
      setRotateError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRotating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">This Client's Key Package</h2>
        <p className="text-sm text-muted-foreground mt-1">
          The addressable key package published for this device. Other users
          fetch it from your key package relays to invite you to encrypted
          groups.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <Label className="text-muted-foreground/60 mb-0.5 text-xs">
            Client ID
          </Label>
          {clientId ? (
            <div className="font-mono text-xs text-muted-foreground break-all">
              {clientId}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Loading…</div>
          )}
        </div>

        <div>
          <Label className="text-muted-foreground/60 mb-0.5 text-xs">
            Published Key Package
          </Label>
          {latestEvent ? (
            <div>
              <EventStatusButton event={latestEvent} />
            </div>
          ) : (
            <div>
              <Badge variant="outline">Unpublished</Badge>
            </div>
          )}
        </div>

        {latestEvent && (
          <div>
            <Label className="text-muted-foreground/60 mb-0.5 text-xs">
              Last Rotated
            </Label>
            <div className="text-sm">
              {formatTimeAgo(latestEvent.created_at)}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          onClick={handleRotate}
          disabled={isRotating || !client || !matchingKeyPackage}
          variant="outline"
          className="w-full sm:w-auto"
        >
          {isRotating ? "Rotating..." : "Rotate key package"}
        </Button>
      </div>

      {!matchingKeyPackage && keyPackages !== undefined && clientId && (
        <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-md">
          No key package has been created for this client yet.
        </div>
      )}

      {rotateError && (
        <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">
          Error: {rotateError}
        </div>
      )}

      {rotateSuccess && (
        <div className="bg-green-500/15 text-green-600 text-sm p-3 rounded-md">
          Key package rotated successfully!
        </div>
      )}
    </div>
  );
}

function DirectMessageRelaysSection() {
  const directMessageRelays = use$(user$.directMessageRelays$);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Gift Wrap Relays</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Relays that other users send invites to you on
        </p>
      </div>

      <div className="space-y-2">
        {directMessageRelays && directMessageRelays.length > 0 ? (
          directMessageRelays.map((relay, index) => (
            <RelayItem
              key={index}
              relay={relay}
              onRemove={() => actions.run(RemoveDirectMessageRelay, relay)}
            />
          ))
        ) : (
          <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-md">
            No direct message relays configured. You might not see invites from
            other users.
          </div>
        )}
      </div>

      <NewRelayForm
        onAdd={(relay) => actions.run(AddDirectMessageRelay, relay)}
      />
    </div>
  );
}

function KeyPackageRelaysSection() {
  const lookupRelays = use$(lookupRelays$);
  const extraRelays = use$(extraRelays$);
  const keyPackageRelays = use$(keyPackageRelays$);
  const mailboxes = use$(user$.mailboxes$);

  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishSuccess, setPublishSuccess] = useState(false);

  const handlePublishKeyPackageRelays = async (relays: string[]) => {
    const account = accounts.active;
    if (!account) return setPublishError("No active account");

    try {
      setIsPublishing(true);
      setPublishError(null);
      setPublishSuccess(false);

      // Create unsigned event
      const unsignedEvent = createKeyPackageRelayListEvent({
        pubkey: account.pubkey,
        relays: relays,
        client: "marmot-chat",
      });

      // Sign the event
      const signedEvent = await account.signEvent(unsignedEvent);

      // Determine publishing relays: combine outbox, advertised relays, extra, and lookup
      const outboxRelays = mailboxes?.outboxes || [];
      const allPublishingRelays = relaySet(
        outboxRelays,
        relays,
        extraRelays,
        lookupRelays,
      );

      if (allPublishingRelays.length === 0) {
        throw new Error(
          "No relays available for publishing. Configure your account or add relays.",
        );
      }

      // Publish to all publishing relays in parallel
      await actions.publish(signedEvent, allPublishingRelays);

      setPublishSuccess(true);
      // Clear success message after 3 seconds
      setTimeout(() => setPublishSuccess(false), 3000);
    } catch (err) {
      console.error("Error publishing key package relay list:", err);
      setPublishError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsPublishing(false);
    }
  };

  const handleAddRelay = async (relay: string) => {
    // Treat undefined as empty array to bootstrap the relay list
    const current = keyPackageRelays ?? [];
    await handlePublishKeyPackageRelays(relaySet(current, relay));
  };

  const handleRemoveRelay = async (relay: string) => {
    // Treat undefined as empty array (nothing to remove if no relays exist)
    const current = keyPackageRelays ?? [];
    await handlePublishKeyPackageRelays(current.filter((r) => r !== relay));
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Key Package Relays</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Relays where your key packages are published for encrypted group
          messaging
        </p>
      </div>

      <div className="space-y-2">
        {keyPackageRelays && keyPackageRelays.length > 0 ? (
          keyPackageRelays.map((relay, index) => (
            <RelayItem
              key={index}
              relay={relay}
              onRemove={() => handleRemoveRelay(relay)}
            />
          ))
        ) : (
          <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-md">
            {keyPackageRelays === undefined
              ? "No key package relay list published yet. Add your first relay below to publish it."
              : "No relays configured. Add a relay to publish your key package relay list."}
          </div>
        )}
      </div>

      <NewRelayForm onAdd={handleAddRelay} />

      {/* Error Message */}
      {publishError && (
        <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">
          Error: {publishError}
        </div>
      )}

      {/* Success Message */}
      {publishSuccess && (
        <div className="bg-green-500/15 text-green-600 text-sm p-3 rounded-md">
          Key package relay list published successfully!
        </div>
      )}

      {/* Publishing indicator */}
      {isPublishing && (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <span className="loading loading-spinner loading-sm"></span>
          <span>Publishing changes...</span>
        </div>
      )}
    </div>
  );
}

export default function MarmotSettingsPage() {
  return (
    <>
      <PageHeader
        items={[
          { label: "Home", to: "/" },
          { label: "Settings", to: "/settings" },
          { label: "Marmot" },
        ]}
      />
      <PageBody>
        <ClientKeyPackageSection />
        <KeyPackageRelaysSection />
        <DirectMessageRelaysSection />
      </PageBody>
    </>
  );
}

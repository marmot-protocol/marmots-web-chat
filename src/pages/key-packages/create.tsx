import { use$ } from "applesauce-react/hooks";
import { AlertCircle, Loader2, XCircle } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { CiphersuiteName } from "ts-mls";

import { CipherSuitePicker } from "@/components/form/cipher-suite-picker";
import { PageBody } from "@/components/page-body";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { withActiveAccount } from "@/components/with-active-account";
import { keyPackageRelays$ } from "@/lib/lifecycle";
import { marmotClient$ } from "@/lib/marmot-client";

/**
 * Reusable alert component that directs users to set up their key package relays
 * when they haven't configured them yet.
 */
export function KeyPackageRelaysAlert() {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Key Package Relays Not Configured</AlertTitle>
      <AlertDescription className="mt-2">
        <p className="mb-3">
          You need to configure your key package relays before creating a key
          package. This tells other users which relays to check for your key
          packages.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/settings/marmot">Configure Key Package Relays</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function CreateKeyPackagePage() {
  // Subscribe to the user's key package relays and marmot client
  const keyPackageRelays = use$(keyPackageRelays$);
  const client = use$(marmotClient$);
  const navigate = useNavigate();

  const [cipherSuite, setCipherSuite] = useState<CiphersuiteName>(
    "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519",
  );
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!keyPackageRelays || keyPackageRelays.length === 0) return;
    if (!client) throw new Error("No active marmot client");

    try {
      setIsCreating(true);
      setError(null);

      // The key package manager handles credential creation, key generation,
      // event signing, relay publication, and local storage in one call.
      const keyPackage = await client.keyPackages.create({
        relays: keyPackageRelays,
        ciphersuite: cipherSuite,
        client: "marmot-chat",
      });

      navigate(`/key-packages/${bytesToHex(keyPackage.keyPackageRef)}`);
    } catch (err) {
      console.error("Error creating key package:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreating(false);
    }
  };

  // Show alert if no key package relays are configured
  if (!keyPackageRelays || keyPackageRelays.length === 0) {
    return (
      <div className="container mx-auto p-6 max-w-4xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Create Key Package</h1>
          <p className="text-muted-foreground">
            Generate and publish a new MLS key package to enable encrypted group
            messaging.
          </p>
        </div>
        <KeyPackageRelaysAlert />
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <PageHeader
        items={[
          { label: "Home", to: "/" },
          { label: "Key Packages", to: "/key-packages" },
          { label: "Create Key Package" },
        ]}
      />
      <PageBody>
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>
              Configure the cipher suite for your key package. The key package
              will be published to your key package relays and outboxes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CipherSuitePicker
              value={cipherSuite}
              onChange={setCipherSuite}
              disabled={isCreating}
            />
          </CardContent>
          <CardFooter>
            <Button
              onClick={handleCreate}
              disabled={isCreating || !client}
              className="w-full"
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Key Package"
              )}
            </Button>
          </CardFooter>
        </Card>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>Error: {error}</AlertDescription>
          </Alert>
        )}
      </PageBody>
    </>
  );
}

export default withActiveAccount(CreateKeyPackagePage);

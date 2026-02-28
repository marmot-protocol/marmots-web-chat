import { use$ } from "applesauce-react/hooks";
import { Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { CiphersuiteName } from "ts-mls/crypto/ciphersuite.js";

import { CipherSuitePicker } from "@/components/form/cipher-suite-picker";
import { PubkeyListCreator } from "@/components/form/pubkey-list-creator";
import { RelayListCreator } from "@/components/form/relay-list-creator";
import { PageBody } from "@/components/page-body";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { withActiveAccount } from "@/components/with-active-account";
import accountManager from "@/lib/accounts";
import { marmotClient$ } from "@/lib/marmot-client";
import { extraRelays$ } from "@/lib/settings";

// ============================================================================
// Types
// ============================================================================

interface ConfigurationFormData {
  groupName: string;
  groupDescription: string;
  adminPubkeys: string[];
  relays: string[];
  ciphersuite: CiphersuiteName;
}

// ============================================================================
// Component: ConfigurationForm
// ============================================================================

interface ConfigurationFormProps {
  isCreating: boolean;
  defaultRelays: string[];
  onSubmit: (data: ConfigurationFormData) => void;
}

function ConfigurationForm({
  isCreating,
  defaultRelays,
  onSubmit,
}: ConfigurationFormProps) {
  const [groupName, setGroupName] = useState("My Group");
  const [groupDescription, setGroupDescription] = useState("");
  const [adminPubkeys, setAdminPubkeys] = useState<string[]>([]);
  const [relays, setRelays] = useState<string[]>(defaultRelays);
  const [ciphersuite, setCiphersuite] = useState<CiphersuiteName>(
    "MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519",
  );

  // Keep relays populated with the user's default relays unless the user has
  // already made an explicit change.
  const [hasTouchedRelays, setHasTouchedRelays] = useState(false);

  // If default relays change (initial load / account switch), refresh the list
  // only if the user hasn't edited it.
  useEffect(() => {
    if (hasTouchedRelays) return;
    if (defaultRelays.length === 0) return;
    setRelays(defaultRelays);
  }, [defaultRelays.join(","), hasTouchedRelays]);

  const handleSubmit = () => {
    const effectiveRelays = relays.length > 0 ? relays : defaultRelays;

    onSubmit({
      groupName,
      groupDescription,
      adminPubkeys,
      relays: effectiveRelays,
      ciphersuite,
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">Configuration</h2>
        <p className="text-sm text-muted-foreground">
          Configure your new MLS group with Marmot Group Data Extension
        </p>
      </div>

      <div className="space-y-6">
        {/* Cipher Suite */}
        <div className="space-y-2">
          <Label>Cipher Suite</Label>
          <CipherSuitePicker
            value={ciphersuite}
            onChange={setCiphersuite}
            disabled={isCreating}
          />
        </div>

        {/* Group Name */}
        <div className="space-y-2">
          <Label htmlFor="group-name">Group Name</Label>
          <Input
            id="group-name"
            type="text"
            placeholder="Enter group name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            disabled={isCreating}
          />
        </div>

        {/* Group Description */}
        <div className="space-y-2">
          <Label htmlFor="group-description">Description (Optional)</Label>
          <Textarea
            id="group-description"
            placeholder="Enter group description"
            value={groupDescription}
            onChange={(e) => setGroupDescription(e.target.value)}
            rows={2}
            disabled={isCreating}
          />
        </div>

        {/* Admin Pubkeys */}
        <PubkeyListCreator
          pubkeys={adminPubkeys}
          label="Admin Public Keys (Optional)"
          placeholder="Enter hex-encoded public key or npub"
          disabled={isCreating}
          emptyMessage="No admin keys configured. The group creator will be the only admin."
          onPubkeysChange={setAdminPubkeys}
        />

        {/* Relays */}
        <RelayListCreator
          relays={relays}
          label="Relays (Required)"
          placeholder="wss://relay.example.com"
          disabled={isCreating}
          emptyMessage="Leave this empty to use your default relay set."
          onRelaysChange={(next) => {
            setHasTouchedRelays(true);
            setRelays(next);
          }}
        />
      </div>

      <div>
        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={
            isCreating ||
            !groupName.trim() ||
            (relays.length === 0 && defaultRelays.length === 0)
          }
        >
          {isCreating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            "Create Group"
          )}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function CreateGroupPage() {
  const client = use$(marmotClient$);
  const extraRelays = use$(extraRelays$);

  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  const handleFormSubmit = async (data: ConfigurationFormData) => {
    if (!client) {
      setError("Marmot client not available");
      return;
    }

    try {
      setIsCreating(true);
      setError(null);

      // Get current user's pubkey as admin
      const account = accountManager.active;
      if (!account) {
        setError("No active account");
        return;
      }

      // Include current user as the first admin, then add any additional admins from the picker
      const currentUserPubkey = account.pubkey;
      const adminPubkeysList = [
        currentUserPubkey,
        ...data.adminPubkeys.filter((pubkey) => pubkey !== currentUserPubkey),
      ];
      const allRelays = [...data.relays];

      // createGroup handles key package generation internally
      const group = await client.createGroup(data.groupName, {
        description: data.groupDescription,
        adminPubkeys: adminPubkeysList,
        relays: allRelays,
        ciphersuite: data.ciphersuite,
      });

      // Navigate directly to the group detail page
      navigate(`/groups/${group.idStr}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsCreating(false);
    }
  };

  return (
    <>
      <PageHeader
        items={[
          { label: "Home", to: "/" },
          { label: "Groups", to: "/groups" },
          { label: "Create Group" },
        ]}
      />
      <PageBody>
        {/* Configuration Form */}
        <ConfigurationForm
          isCreating={isCreating}
          defaultRelays={extraRelays ?? []}
          onSubmit={(data) => {
            // Populate group relays from the user's relay config if none provided.
            // This keeps UX simple: in most cases the defaults are acceptable.
            const relays =
              data.relays.length > 0 ? data.relays : (extraRelays ?? []);
            return handleFormSubmit({ ...data, relays });
          }}
        />

        {/* Error Display */}
        {error && (
          <Alert variant="destructive" className="mt-4">
            <XCircle className="h-4 w-4" />
            <AlertDescription>Error: {error}</AlertDescription>
          </Alert>
        )}
      </PageBody>
    </>
  );
}

export default withActiveAccount(CreateGroupPage);

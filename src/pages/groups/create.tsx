import { IconCircleX, IconLoader2 } from "@tabler/icons-react";
import { use$ } from "applesauce-react/hooks";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { CiphersuiteName } from "ts-mls";

import { CipherSuitePicker } from "@/components/form/cipher-suite-picker";
import { PubkeyListCreator } from "@/components/form/pubkey-list-creator";
import { RelayListCreator } from "@/components/form/relay-list-creator";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileShell } from "@/layouts/mobile/shell";
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

interface ConfigurationFormData {
  groupName: string;
  groupDescription: string;
  adminPubkeys: string[];
  relays: string[];
  ciphersuite: CiphersuiteName;
}

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
              <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
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
// Layout: Desktop
// ============================================================================

interface CreateGroupDesktopProps {
  isCreating: boolean;
  error: string | null;
  defaultRelays: string[];
  onSubmit: (data: ConfigurationFormData) => void;
}

function CreateGroupDesktop({
  isCreating,
  error,
  defaultRelays,
  onSubmit,
}: CreateGroupDesktopProps) {
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
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Create Group</h1>
            <p className="text-muted-foreground mt-2">
              Configure your new MLS group with Marmot Group Data Extension
            </p>
          </div>
          <ConfigurationForm
            isCreating={isCreating}
            defaultRelays={defaultRelays}
            onSubmit={onSubmit}
          />
          {error && (
            <Alert variant="destructive" className="mt-4">
              <IconCircleX className="h-4 w-4" />
              <AlertDescription>Error: {error}</AlertDescription>
            </Alert>
          )}
        </div>
      </PageBody>
    </>
  );
}

// ============================================================================
// Layout: Mobile
// ============================================================================

interface CreateGroupMobileProps {
  isCreating: boolean;
  error: string | null;
  defaultRelays: string[];
  onSubmit: (data: ConfigurationFormData) => void;
}

function CreateGroupMobile({
  isCreating,
  error,
  defaultRelays,
  onSubmit,
}: CreateGroupMobileProps) {
  return (
    <MobileShell title="Create Group">
      <div className="p-4 space-y-6">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Configuration</h2>
          <p className="text-sm text-muted-foreground">
            Configure your new MLS group with Marmot Group Data Extension
          </p>
        </div>
        <ConfigurationForm
          isCreating={isCreating}
          defaultRelays={defaultRelays}
          onSubmit={onSubmit}
        />
        {error && (
          <Alert variant="destructive" className="mt-4">
            <IconCircleX className="h-4 w-4" />
            <AlertDescription>Error: {error}</AlertDescription>
          </Alert>
        )}
      </div>
    </MobileShell>
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

      const account = accountManager.active;
      if (!account) {
        setError("No active account");
        return;
      }

      const currentUserPubkey = account.pubkey;
      const adminPubkeysList = [
        currentUserPubkey,
        ...data.adminPubkeys.filter((pubkey) => pubkey !== currentUserPubkey),
      ];
      const allRelays = [...data.relays];

      const group = await client.groups.create(data.groupName, {
        description: data.groupDescription,
        adminPubkeys: adminPubkeysList,
        relays: allRelays,
        ciphersuite: data.ciphersuite,
      });

      navigate(`/groups/${group.idStr}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsCreating(false);
    }
  };

  const defaultRelays = extraRelays ?? [];
  const onSubmit = (data: ConfigurationFormData) => {
    const relays = data.relays.length > 0 ? data.relays : defaultRelays;
    return handleFormSubmit({ ...data, relays });
  };

  const isMobile = useIsMobile();
  return isMobile ? (
    <CreateGroupMobile
      isCreating={isCreating}
      error={error}
      defaultRelays={defaultRelays}
      onSubmit={onSubmit}
    />
  ) : (
    <CreateGroupDesktop
      isCreating={isCreating}
      error={error}
      defaultRelays={defaultRelays}
      onSubmit={onSubmit}
    />
  );
}

export default withActiveAccount(CreateGroupPage);

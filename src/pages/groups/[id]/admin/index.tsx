import { getMarmotGroupData, Proposals } from "@internet-privacy/marmot-ts";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { RelayListCreator } from "@/components/form/relay-list-creator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useGroup } from "@/contexts/group-context";

export default function GroupAdminPage() {
  const { group, isAdmin } = useGroup();

  const groupData = getMarmotGroupData(group.state);

  const [name, setName] = useState(groupData?.name ?? "");
  const [description, setDescription] = useState(groupData?.description ?? "");
  const [relays, setRelays] = useState<string[]>(groupData?.relays ?? []);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Sync form fields when group state changes (e.g. after a successful commit)
  useEffect(() => {
    const data = getMarmotGroupData(group.state);
    setName(data?.name ?? "");
    setDescription(data?.description ?? "");
    setRelays(data?.relays ?? []);
  }, [group.state]);

  const isDirty =
    name !== (groupData?.name ?? "") ||
    description !== (groupData?.description ?? "") ||
    JSON.stringify(relays) !== JSON.stringify(groupData?.relays ?? []);

  const handleSave = async () => {
    if (!isAdmin || !isDirty) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await group.commit({
        extraProposals: [
          Proposals.proposeUpdateMetadata({ name, description, relays }),
        ],
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Group Info</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Edit the group's name, description, and relay configuration.
        </p>
      </div>

      <Separator />

      {!isAdmin && (
        <Alert>
          <AlertDescription>
            Only group admins can edit group settings.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="group-name">Name</Label>
          <Input
            id="group-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSuccess(false);
            }}
            disabled={!isAdmin || saving}
            placeholder="Group name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="group-description">Description</Label>
          <Textarea
            id="group-description"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setSuccess(false);
            }}
            disabled={!isAdmin || saving}
            placeholder="What is this group about?"
            rows={4}
          />
        </div>

        <RelayListCreator
          relays={relays}
          label="Relays"
          emptyMessage="No relays configured. Add at least one relay so members can sync."
          disabled={!isAdmin || saving}
          onRelaysChange={(updated) => {
            setRelays(updated);
            setSuccess(false);
          }}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <AlertDescription>Group info updated successfully.</AlertDescription>
        </Alert>
      )}

      {isAdmin && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving || !isDirty}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      )}
    </div>
  );
}

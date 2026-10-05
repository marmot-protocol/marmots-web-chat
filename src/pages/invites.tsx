import { useState } from "react";
import { Link } from "react-router";
import { IconArrowLeft } from "@tabler/icons-react";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { InvitesPanel } from "@/components/marmot/invites-panel";

/** Pending group invites with preview, acceptance, and dismissal actions. */
export function InvitesPage() {
  const [showUnavailable, setShowUnavailable] = useState(false);
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-2 border-b p-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/groups" aria-label="Back to groups">
            <IconArrowLeft />
          </Link>
        </Button>
        <h1 className="font-semibold">Invites</h1>
        <div className="ml-auto flex items-center gap-2">
          <Label htmlFor="show-unavailable-invites" className="text-xs">
            Show unavailable invites
          </Label>
          <Switch
            id="show-unavailable-invites"
            checked={showUnavailable}
            onCheckedChange={setShowUnavailable}
          />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Review your pending group invites. Accept an invite to join the
            group, or dismiss it to remove it from your inbox.
          </p>
          <InvitesPanel showUnavailable={showUnavailable} />
        </div>
      </div>
    </div>
  );
}

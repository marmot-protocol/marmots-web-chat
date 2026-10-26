import { useState } from "react";
import { useNavigate } from "react-router";
import { IconQrcode } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/user";
import { MyQrDialog } from "@/components/marmot/my-qr-dialog";
import { accounts } from "@/lib/accounts";
import { useAction } from "@/hooks/use-marmot";
import { useSettings } from "@/pages/settings/context";

/** Edit the active account's public profile and access account actions. */
export function ProfileSettings() {
  const { account, name, setName, picture, setPicture, about, setAbout } =
    useSettings();
  const save = useAction((account) =>
    account.saveProfile({ name, about, picture }),
  );
  const navigate = useNavigate();
  const [showQr, setShowQr] = useState(false);
  const signOut = () => {
    accounts.clearActive();
    navigate("/signin");
  };
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Profile</h2>
          <p className="break-all font-mono text-xs text-muted-foreground">
            {account.npub}
          </p>
        </header>
        <div>
          <FieldGroup>
            <div className="flex items-center gap-3">
              <UserAvatar pubkey={account.pubkey} size={48} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowQr(true)}
              >
                <IconQrcode data-icon="inline-start" /> Show invite QR
              </Button>
            </div>
            <Field>
              <FieldLabel htmlFor="p-name">Name</FieldLabel>
              <Input
                id="p-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="p-picture">Picture URL</FieldLabel>
              <Input
                id="p-picture"
                value={picture}
                onChange={(e) => setPicture(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="p-about">About</FieldLabel>
              <Textarea
                id="p-about"
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                rows={2}
              />
            </Field>
            <Button onClick={() => void save.run()} disabled={save.pending}>
              {save.pending ? "Working…" : "Save profile"}
            </Button>
          </FieldGroup>
        </div>
      </section>
      <section className="flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Account</h2>
        </header>
        <div>
          <Button variant="destructive" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </section>
      <MyQrDialog npub={account.npub} open={showQr} onOpenChange={setShowQr} />
    </div>
  );
}

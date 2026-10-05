import { useState } from "react";
import { useNavigate } from "react-router";
import { IconQrcode } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/user";
import { MyQrDialog } from "@/components/marmot/my-qr-dialog";
import { accounts } from "@/lib/accounts";
import { useSettings } from "@/pages/settings/context";

/** Edit the active account's public profile and access account actions. */
export function ProfileSettings() {
  const {
    snapshot,
    controller,
    name,
    setName,
    picture,
    setPicture,
    about,
    setAbout,
  } = useSettings();
  const navigate = useNavigate();
  const [showQr, setShowQr] = useState(false);
  const signOut = () => {
    accounts.clearActive();
    navigate("/signin");
  };
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription className="break-all font-mono text-xs">
            {snapshot.me.npub}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="flex items-center gap-3">
              <UserAvatar pubkey={snapshot.me.pubkey} size={48} />
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
            <Button
              onClick={() => controller?.saveProfile({ name, about, picture })}
              disabled={!controller || snapshot.busy}
            >
              {snapshot.busy ? "Working…" : "Save profile"}
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={signOut}>
            Sign out
          </Button>
        </CardContent>
      </Card>
      <MyQrDialog
        npub={snapshot.me.npub}
        open={showQr}
        onOpenChange={setShowQr}
      />
    </div>
  );
}

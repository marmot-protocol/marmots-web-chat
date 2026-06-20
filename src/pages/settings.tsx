import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QrCode } from "lucide-react";

import { UserAvatar } from "@/components/user";
import { KeyPackagesCard } from "@/components/marmot/key-packages-card";
import { MyQrDialog } from "@/components/marmot/my-qr-dialog";
import { accounts } from "@/lib/accounts";
import { useChat, useController } from "@/hooks/use-marmot";
import { useProfile } from "@/hooks/use-profile";

export function SettingsPage() {
  const navigate = useNavigate();
  const controller = useController();
  const snapshot = useChat();
  const me = snapshot?.me.pubkey;
  const profile = useProfile(me);

  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [picture, setPicture] = useState("");
  const [outbox, setOutbox] = useState("");
  const [inbox, setInbox] = useState("");
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    setName(profile?.name ?? "");
    setAbout(profile?.about ?? "");
    setPicture(profile?.picture ?? "");
  }, [profile]);

  useEffect(() => {
    if (snapshot) {
      setOutbox(snapshot.outboxRelays.join("\n"));
      setInbox(snapshot.inboxRelays.join("\n"));
    }
  }, [snapshot?.outboxRelays, snapshot?.inboxRelays]);

  const parseRelays = (value: string) =>
    value.split(/[\s,]+/).map((r) => r.trim()).filter(Boolean);

  const signOut = () => {
    accounts.clearActive();
    navigate("/signin");
  };

  if (!snapshot) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/groups")}>
          <ArrowLeft className="size-4" /> Back
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription className="break-all font-mono text-xs">
              {snapshot.me.npub}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <UserAvatar pubkey={snapshot.me.pubkey} size={48} />
              <Button variant="outline" size="sm" onClick={() => setShowQr(true)}>
                <QrCode className="size-4" /> Show invite QR
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-name">Name</Label>
              <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-picture">Picture URL</Label>
              <Input
                id="p-picture"
                value={picture}
                onChange={(e) => setPicture(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-about">About</Label>
              <Textarea
                id="p-about"
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                rows={2}
              />
            </div>
            <Button
              onClick={() => controller?.saveProfile({ name, about, picture })}
              disabled={!controller || snapshot.busy}
            >
              {snapshot.busy ? "Working…" : "Save profile"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Relays</CardTitle>
            <CardDescription>
              Outbox (NIP-65) is where your key packages live; inbox (kind 10050)
              is where invites are delivered. One relay per line.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="r-outbox">Outbox relays</Label>
              <Textarea
                id="r-outbox"
                value={outbox}
                onChange={(e) => setOutbox(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-inbox">Inbox relays</Label>
              <Textarea
                id="r-inbox"
                value={inbox}
                onChange={(e) => setInbox(e.target.value)}
                rows={3}
              />
            </div>
            <Button
              onClick={() =>
                controller?.saveRelayLists(parseRelays(outbox), parseRelays(inbox))
              }
              disabled={!controller || snapshot.busy}
            >
              {snapshot.busy ? "Working…" : "Publish relay lists"}
            </Button>
          </CardContent>
        </Card>

        <KeyPackagesCard />

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

        <MyQrDialog npub={snapshot.me.npub} open={showQr} onOpenChange={setShowQr} />
      </div>
    </div>
  );
}

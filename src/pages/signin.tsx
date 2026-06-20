import { useState } from "react";
import { useNavigate } from "react-router";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createNewAccount, importAccount } from "@/lib/accounts";
import { DEFAULT_NEW_ACCOUNT_RELAY } from "@/lib/settings";

export function SignInPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [relay, setRelay] = useState(DEFAULT_NEW_ACCOUNT_RELAY);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = () => {
    setError(null);
    try {
      createNewAccount({
        name: name.trim() || undefined,
        relays: relay.trim() ? [relay.trim()] : undefined,
      });
      navigate("/groups");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const importKey = () => {
    setError(null);
    try {
      importAccount(secret.trim());
      navigate("/groups");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Marmot Chat</CardTitle>
          <CardDescription>
            End-to-end encrypted group chat over Nostr (MLS). This build uses a
            local private key — needed to sign darkmatter key packages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="create">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="create">New account</TabsTrigger>
              <TabsTrigger value="import">Import key</TabsTrigger>
            </TabsList>

            <TabsContent value="create" className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">Display name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alice"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="relay">Home relay</Label>
                <Input
                  id="relay"
                  value={relay}
                  onChange={(e) => setRelay(e.target.value)}
                />
              </div>
              <Button className="w-full" onClick={create}>
                Generate identity
              </Button>
            </TabsContent>

            <TabsContent value="import" className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label htmlFor="secret">Private key (nsec or hex)</Label>
                <Input
                  id="secret"
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="nsec1…"
                />
              </div>
              <Button className="w-full" onClick={importKey} disabled={!secret.trim()}>
                Import
              </Button>
            </TabsContent>
          </Tabs>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

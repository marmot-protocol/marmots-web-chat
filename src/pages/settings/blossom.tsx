import {
  AddBlossomServer,
  RemoveBlossomServer,
} from "applesauce-actions/actions/blossom";
import { use$ } from "applesauce-react/hooks";
import { HardDriveUploadIcon, Loader2Icon, XIcon } from "lucide-react";
import { useState } from "react";

// ─── Server favicon ───────────────────────────────────────────────────────────

/**
 * Derives the favicon URL from a Blossom server base URL, then renders it with
 * a fallback to the generic HardDriveUpload icon if loading fails.
 */
function BlossomServerFavicon({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);

  let faviconUrl: string | null = null;
  try {
    faviconUrl = new URL("/favicon.ico", url).toString();
  } catch {
    // malformed URL — fall through to icon
  }

  if (!faviconUrl || failed) {
    return (
      <HardDriveUploadIcon className="w-5 h-5 text-muted-foreground shrink-0" />
    );
  }

  return (
    <img
      src={faviconUrl}
      alt=""
      className="w-5 h-5 rounded shrink-0 object-contain"
      onError={() => setFailed(true)}
    />
  );
}

import { PageBody } from "@/components/page-body";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actions, user$ } from "@/lib/accounts";
import { eventStore } from "@/lib/nostr";
import {
  blossomServers$,
  blossomSigningMode$,
  type BlossomSigningMode,
} from "@/lib/settings";

// ─── Shared: server item row ──────────────────────────────────────────────────

function BlossomServerItem({
  url,
  onRemove,
}: {
  url: string;
  onRemove: () => void | Promise<void>;
}) {
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const handleRemove = async () => {
    setRemoveError(null);
    setRemoving(true);
    try {
      await onRemove();
    } catch (err) {
      setRemoveError(
        err instanceof Error ? err.message : "Failed to remove server",
      );
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <BlossomServerFavicon url={url} />
        <code className="flex-1 text-xs bg-muted p-2 rounded font-mono select-all">
          {url}
        </code>
        <Button
          variant="destructive"
          size="icon"
          onClick={handleRemove}
          disabled={removing}
        >
          {removing ? (
            <Loader2Icon className="w-4 h-4 animate-spin" />
          ) : (
            <XIcon className="w-4 h-4" />
          )}
        </Button>
      </div>
      {removeError && <p className="text-xs text-destructive">{removeError}</p>}
    </div>
  );
}

// ─── Shared: add server form ──────────────────────────────────────────────────

function NewBlossomServerForm({
  onAdd,
  placeholder = "https://blossom.example.com",
}: {
  onAdd: (url: string) => void | Promise<void>;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);

    const trimmed = value.trim();
    if (!trimmed) return;

    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        setError("Must be an http:// or https:// URL");
        return;
      }
    } catch {
      setError("Invalid URL");
      return;
    }

    setAdding(true);
    try {
      await onAdd(trimmed.replace(/\/$/, ""));
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add server");
    } finally {
      setAdding(false);
    }
  };

  return (
    <form className="flex flex-col gap-1" onSubmit={handleAdd}>
      <div className="flex gap-2">
        <Input
          type="url"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          className="flex-1"
          disabled={adding}
        />
        <Button type="submit" disabled={!value.trim() || adding}>
          {adding ? <Loader2Icon className="w-4 h-4 animate-spin" /> : "Add"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

// ─── Ephemeral mode: local BehaviorSubject server list ────────────────────────

function EphemeralServersSection() {
  const servers = use$(blossomServers$) ?? [];

  const handleAdd = (url: string) => {
    blossomServers$.next([...new Set([...servers, url])]);
  };

  const handleRemove = (url: string) => {
    blossomServers$.next(servers.filter((s) => s !== url));
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        These servers are stored locally on this device. Uploads are signed with
        a fresh random keypair each time — the server cannot link uploads to
        your Nostr identity.
      </p>

      <div className="space-y-2">
        {servers.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            No servers configured. Add one below.
          </p>
        )}
        {servers.map((url) => (
          <BlossomServerItem
            key={url}
            url={url}
            onRemove={() => handleRemove(url)}
          />
        ))}
      </div>

      <NewBlossomServerForm onAdd={handleAdd} />
    </div>
  );
}

// ─── Account mode: kind-10063 Nostr server list ───────────────────────────────

function AccountServersSection() {
  const user = use$(user$);

  // Subscribe to the user's kind-10063 blossom server list via the EventStore
  const pubkey = user?.pubkey;
  const servers = use$(
    () => (pubkey ? eventStore.blossomServers(pubkey) : undefined),
    [pubkey],
  );

  const handleAdd = async (url: string) => {
    await actions.run(AddBlossomServer, url);
  };

  const handleRemove = async (url: URL) => {
    await actions.run(RemoveBlossomServer, url);
  };

  if (!user) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No active account. Sign in to manage your Blossom server list.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        These servers are stored in your Nostr kind-10063 event and published to
        your outbox relays. Other Nostr apps that support Blossom will also use
        this list. Uploads are signed with your account key.
      </p>

      <div className="space-y-2">
        {(!servers || servers.length === 0) && (
          <p className="text-sm text-muted-foreground italic">
            No servers in your kind-10063 list. Add one below.
          </p>
        )}
        {servers?.map((url) => (
          <BlossomServerItem
            key={url.toString()}
            url={url.toString()}
            onRemove={() => handleRemove(url)}
          />
        ))}
      </div>

      <NewBlossomServerForm onAdd={handleAdd} />
    </div>
  );
}

// ─── Signing mode picker ──────────────────────────────────────────────────────

function SigningModeSection() {
  const mode = use$(blossomSigningMode$) ?? "ephemeral";

  const options: {
    value: BlossomSigningMode;
    label: string;
    description: string;
  }[] = [
    {
      value: "ephemeral",
      label: "Ephemeral key (recommended)",
      description:
        "A fresh random keypair is generated for each upload. The Blossom server cannot link uploads to your Nostr identity.",
    },
    {
      value: "account",
      label: "Account key",
      description:
        "Uploads are signed with your active Nostr account. Required by some servers for quotas or moderation.",
    },
  ];

  return (
    <div className="space-y-3">
      {options.map((opt) => (
        <label
          key={opt.value}
          className="flex items-start gap-3 cursor-pointer rounded-lg border p-3 hover:bg-muted/50 transition-colors"
        >
          <input
            type="radio"
            name="signing-mode"
            value={opt.value}
            checked={mode === opt.value}
            onChange={() => blossomSigningMode$.next(opt.value)}
            className="mt-0.5"
          />
          <div>
            <Label className="font-medium cursor-pointer">{opt.label}</Label>
            <p className="text-sm text-muted-foreground mt-0.5">
              {opt.description}
            </p>
          </div>
        </label>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BlossomSettingsPage() {
  const mode = use$(blossomSigningMode$) ?? "ephemeral";

  return (
    <>
      <PageHeader
        items={[
          { label: "Home", to: "/" },
          { label: "Settings", to: "/settings" },
          { label: "Media" },
        ]}
      />
      <PageBody>
        {/* Signing mode — shown first so the server list below reflects the selection */}
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold">Upload Signing Mode</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Controls which key signs the Blossom authentication event (kind
              24242) and which server list is used for uploads.
            </p>
          </div>
          <SigningModeSection />
        </div>

        {/* Server list — changes based on mode */}
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold">Blossom Servers</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Encrypted media (MIP-04) is uploaded to these servers. Files are
              always encrypted before upload — the server never sees your
              plaintext content.
            </p>
          </div>

          {mode === "ephemeral" ? (
            <EphemeralServersSection />
          ) : (
            <AccountServersSection />
          )}
        </div>
      </PageBody>
    </>
  );
}

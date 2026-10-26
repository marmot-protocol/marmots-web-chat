import { useState } from "react";
import { use$ } from "applesauce-react/hooks";
import { IconUpload } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import {
  auditEnabled$,
  auditUploadEndpoint$,
  auditUploadToken$,
} from "@/lib/settings";
import { useAction } from "@/hooks/use-marmot";
import { useSettings } from "@/pages/settings/context";

/** Configure forensic recording and upload the account's audit log. */
export function AuditLogSettings() {
  const { account } = useSettings();
  const upload = useAction((account) => account.uploadAuditLog());
  const [uploaded, setUploaded] = useState<string | null>(null);
  const auditEnabled = use$(auditEnabled$) ?? false;
  const auditEndpoint = use$(auditUploadEndpoint$) ?? "";
  const auditToken = use$(auditUploadToken$) ?? "";
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">Audit log</h2>
        <p className="text-xs text-muted-foreground">
          Opt-in forensic logging of MLS and transport events for this account.
          Identity is hashed; you can upload the log to a Goggles tracker to
          help diagnose protocol issues. Toggling takes effect after you sign in
          again or reload.
        </p>
      </header>
      <div>
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="a-enabled">Record audit log</FieldLabel>
            <Switch
              id="a-enabled"
              checked={auditEnabled}
              onCheckedChange={(v) => auditEnabled$.next(v)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="a-endpoint">Tracker endpoint</FieldLabel>
            <Input
              id="a-endpoint"
              value={auditEndpoint}
              onChange={(e) => auditUploadEndpoint$.next(e.target.value)}
              placeholder="https://goggles.ipf.dev/"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="a-token">Bearer token</FieldLabel>
            <Input
              id="a-token"
              type="password"
              value={auditToken}
              onChange={(e) => auditUploadToken$.next(e.target.value)}
              placeholder="required for non-loopback trackers"
            />
          </Field>
          <Button
            variant="outline"
            onClick={async () => {
              const result = await upload.run();
              if (result)
                setUploaded(
                  `Uploaded ${result.bytesSent} bytes (HTTP ${result.status}).`,
                );
            }}
            disabled={!account.canUploadAudit || upload.pending}
          >
            <IconUpload data-icon="inline-start" />
            {upload.pending ? "Working…" : "Upload audit log"}
          </Button>
          {uploaded && (
            <p className="text-xs text-muted-foreground" role="status">
              {uploaded}
            </p>
          )}
          {!account.canUploadAudit && (
            <p className="text-xs text-muted-foreground">
              {auditEnabled
                ? "Reload to start recording, then upload becomes available."
                : "Enable recording (and set an endpoint) to upload."}
            </p>
          )}
        </FieldGroup>
      </div>
    </section>
  );
}

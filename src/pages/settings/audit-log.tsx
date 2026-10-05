import { use$ } from "applesauce-react/hooks";
import { IconUpload } from "@tabler/icons-react";

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
import { Switch } from "@/components/ui/switch";
import {
  auditEnabled$,
  auditUploadEndpoint$,
  auditUploadToken$,
} from "@/lib/settings";
import { useSettings } from "@/pages/settings/context";

/** Configure forensic recording and upload the account's audit log. */
export function AuditLogSettings() {
  const { snapshot, controller } = useSettings();
  const auditEnabled = use$(auditEnabled$) ?? false;
  const auditEndpoint = use$(auditUploadEndpoint$) ?? "";
  const auditToken = use$(auditUploadToken$) ?? "";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
        <CardDescription>
          Opt-in forensic logging of MLS and transport events for this account.
          Identity is hashed; you can upload the log to a Goggles tracker to
          help diagnose protocol issues. Toggling takes effect after you sign in
          again or reload.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
            onClick={() => controller?.uploadAuditLog()}
            disabled={!snapshot.canUploadAudit || snapshot.busy}
          >
            <IconUpload data-icon="inline-start" />
            {snapshot.busy ? "Working…" : "Upload audit log"}
          </Button>
          {!snapshot.canUploadAudit && (
            <p className="text-xs text-muted-foreground">
              {auditEnabled
                ? "Reload to start recording, then upload becomes available."
                : "Enable recording (and set an endpoint) to upload."}
            </p>
          )}
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

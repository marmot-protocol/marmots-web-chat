import { use$ } from "applesauce-react/hooks";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { debugMode$ } from "@/lib/settings";

/** Configure advanced developer options for the Marmot engine. */
export function AdvancedSettings() {
  const debugMode = use$(debugMode$) ?? false;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Advanced</CardTitle>
        <CardDescription>
          Debug mode configures the marmot engine to retain and process{" "}
          <em>everything</em>: the full per-group fork-history tree is persisted
          (so it survives reloads) and undecryptable events are kept for retry.
          Each group then gets a debug view with a fork graph and pending-events
          list, so you can see at a glance when a fork happens and which branch
          your client is following. Takes effect after you sign in again or
          reload.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldLabel htmlFor="d-enabled">Enable debug mode</FieldLabel>
            <Switch
              id="d-enabled"
              checked={debugMode}
              onCheckedChange={(v) => debugMode$.next(v)}
            />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { use$ } from "applesauce-react/hooks";

import { useAction } from "@/hooks/use-marmot";
import { useSettings } from "@/pages/settings/context";

/** Discover and edit the account's inbox and outbox relay lists. */
export function RelaySettings() {
  const { account, outbox, setOutbox, inbox, setInbox } = useSettings();
  const outboxRelays = use$(account.outboxRelays$);
  const inboxRelays = use$(account.inboxRelays$);
  const refresh = useAction((account) => account.refreshRelayLists());
  const save = useAction((account, outbox: string[], inbox: string[]) =>
    account.saveRelayLists(outbox, inbox),
  );
  const busy = refresh.pending || save.pending;
  const parseRelays = (value: string) =>
    value
      .split(/[\s,]+/)
      .map((r) => r.trim())
      .filter(Boolean);
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">Relays</h2>
        <p className="text-xs text-muted-foreground">
          Outbox (NIP-65) is where your key packages live; inbox (kind 10050) is
          where invites are delivered. One relay per line.
        </p>
      </header>
      <div>
        <FieldGroup>
          {(!outboxRelays?.length || !inboxRelays?.length) && (
            <Alert>
              <AlertTitle>Finish relay setup</AlertTitle>
              <AlertDescription>
                Set both lists so others can find your key package and deliver
                invites.
              </AlertDescription>
            </Alert>
          )}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void refresh.run()}
          >
            Retry relay discovery
          </Button>
          <Field>
            <FieldLabel htmlFor="r-outbox">Outbox relays</FieldLabel>
            <Textarea
              id="r-outbox"
              value={outbox}
              onChange={(e) => setOutbox(e.target.value)}
              rows={3}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="r-inbox">Inbox relays</FieldLabel>
            <Textarea
              id="r-inbox"
              value={inbox}
              onChange={(e) => setInbox(e.target.value)}
              rows={3}
            />
          </Field>
          <Button
            onClick={() =>
              void save.run(parseRelays(outbox), parseRelays(inbox))
            }
            disabled={busy}
          >
            {save.pending ? "Working…" : "Publish relay lists"}
          </Button>
        </FieldGroup>
      </div>
    </section>
  );
}

import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useSettings } from "@/pages/settings/context";

/** Discover and edit the account's inbox and outbox relay lists. */
export function RelaySettings() {
  const { snapshot, controller, outbox, setOutbox, inbox, setInbox } =
    useSettings();
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
          {(!snapshot.outboxRelays.length || !snapshot.inboxRelays.length) && (
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
            disabled={snapshot.busy}
            onClick={() => void controller?.refreshRelayLists()}
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
              controller?.saveRelayLists(
                parseRelays(outbox),
                parseRelays(inbox),
              )
            }
            disabled={!controller || snapshot.busy}
          >
            {snapshot.busy ? "Working…" : "Publish relay lists"}
          </Button>
        </FieldGroup>
      </div>
    </section>
  );
}

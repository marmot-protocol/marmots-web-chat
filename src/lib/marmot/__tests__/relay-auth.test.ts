import { describe, expect, it, vi } from "vitest";
import type { RelayAuthContext } from "applesauce-relay/types";

import { createRelayAuthHandler } from "@/lib/marmot/relay-auth";

function fixture() {
  const signer = { signEvent: vi.fn() };
  const relay = { authenticate: vi.fn().mockResolvedValue({ ok: true }) };
  let closed = false;
  const handler = createRelayAuthHandler(signer, () => closed);
  const context = { relay } as unknown as RelayAuthContext;
  return {
    signer,
    relay,
    handler,
    context,
    close: () => {
      closed = true;
    },
  };
}

describe("operation-scoped relay authentication", () => {
  it("only authenticates when the operation invokes its handler", async () => {
    const { signer, relay, handler, context } = fixture();
    expect(relay.authenticate).not.toHaveBeenCalled();
    await handler(context);
    expect(relay.authenticate).toHaveBeenCalledExactlyOnceWith(signer);
  });

  it("propagates a relay's rejected AUTH verdict", async () => {
    const { relay, handler, context } = fixture();
    relay.authenticate.mockResolvedValue({ ok: false, message: "denied" });
    await expect(handler(context)).rejects.toThrow("denied");
  });

  it("refuses authentication after account teardown", async () => {
    const { relay, handler, context, close } = fixture();
    close();
    await expect(handler(context)).rejects.toThrow("closed");
    expect(relay.authenticate).not.toHaveBeenCalled();
  });

  it("refuses late authentication completion after account teardown", async () => {
    const { relay, handler, context, close } = fixture();
    relay.authenticate.mockImplementation(async () => {
      close();
      return { ok: true };
    });
    await expect(handler(context)).rejects.toThrow("closed");
  });
});

import { describe, expect, it, vi } from "vitest";
import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import { getMessageOutbox, MessageOutbox } from "./message-outbox";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const rumor = (content: string): Rumor => ({
  id: content.padEnd(64, "0"),
  pubkey: "a".repeat(64),
  content,
  kind: 9,
  tags: [],
  created_at: 1,
});

describe("MessageOutbox", () => {
  it("tracks simultaneous messages independently when acknowledgments arrive out of order", async () => {
    const first = deferred(),
      second = deferred();
    const sender = {
      sendText: vi.fn(async (_group, text, _reply, prepared) => {
        prepared(rumor(text));
        await (text === "first" ? first : second).promise;
      }),
      sendMedia: vi.fn(),
      sendPreparedMessage: vi.fn(),
    };
    const outbox = new MessageOutbox(sender);
    outbox.send("group", "pubkey", "first");
    outbox.send("group", "pubkey", "second");
    expect(sender.sendText).toHaveBeenCalledTimes(2);
    expect(outbox.messages$.value.map((entry) => entry.status)).toEqual([
      "sending",
      "sending",
    ]);
    second.resolve();
    await vi.waitFor(() =>
      expect(outbox.messages$.value[1].status).toBe("sent"),
    );
    expect(outbox.messages$.value[0].status).toBe("sending");
    first.reject(new Error("Relay rejected"));
    await vi.waitFor(() =>
      expect(outbox.messages$.value[0].status).toBe("failed"),
    );
    expect(outbox.messages$.value[0].error).toBe("Relay rejected");
  });

  it("retries a prepared media rumor without uploading again or creating a second message", async () => {
    const retry = deferred();
    const mediaRumor = rumor("caption");
    const sender = {
      sendText: vi.fn(),
      sendMedia: vi.fn(async (_group, _file, _caption, _reply, prepared) => {
        prepared(mediaRumor);
        throw new Error("No relay acknowledged");
      }),
      sendPreparedMessage: vi.fn(() => retry.promise),
    };
    const outbox = getMessageOutbox(sender);
    expect(getMessageOutbox(sender)).toBe(outbox);
    outbox.send(
      "group",
      "pubkey",
      "caption",
      undefined,
      new File(["image"], "photo.png"),
    );
    await vi.waitFor(() =>
      expect(outbox.messages$.value[0].status).toBe("failed"),
    );
    const entry = outbox.messages$.value[0];
    entry.retry();
    entry.retry();
    expect(sender.sendPreparedMessage).toHaveBeenCalledTimes(1);
    expect(sender.sendPreparedMessage).toHaveBeenCalledWith(
      "group",
      mediaRumor,
    );
    retry.resolve();
    await vi.waitFor(() =>
      expect(outbox.messages$.value[0].status).toBe("sent"),
    );
    expect(sender.sendMedia).toHaveBeenCalledTimes(1);
    expect(outbox.messages$.value).toHaveLength(1);
    expect(outbox.messages$.value[0].message.id).toBe(mediaRumor.id);
  });

  it("keeps a file that fails before preparation available for retry", async () => {
    const sender = {
      sendText: vi.fn(),
      sendMedia: vi
        .fn()
        .mockRejectedValueOnce(new Error("Upload failed"))
        .mockResolvedValueOnce(undefined),
      sendPreparedMessage: vi.fn(),
    };
    const outbox = new MessageOutbox(sender);
    const file = new File(["file"], "file.txt");
    outbox.send("group", "pubkey", "", undefined, file);
    await vi.waitFor(() =>
      expect(outbox.messages$.value[0].status).toBe("failed"),
    );
    outbox.messages$.value[0].retry();
    await vi.waitFor(() =>
      expect(outbox.messages$.value[0].status).toBe("sent"),
    );
    expect(sender.sendMedia.mock.calls[1][1]).toBe(file);
  });
});

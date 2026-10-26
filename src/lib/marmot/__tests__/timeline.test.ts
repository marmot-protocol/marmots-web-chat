import { describe, expect, it, vi } from "vitest";
import { getEventHash, type Rumor } from "applesauce-core/helpers/event";
import { GroupRumorHistory } from "@internet-privacy/marmot-ts";
import {
  InMemoryKeyValueStore,
  KeyValueRumorHistoryBackend,
} from "@internet-privacy/marmot-ts/extra";

import { GroupTimeline } from "@/lib/marmot/timeline";

function rumor(index: number, kind = 9): Rumor {
  const draft = {
    pubkey: "11".repeat(32),
    kind,
    content: String(index),
    created_at: 100,
    tags: [],
  };
  return { ...draft, id: getEventHash(draft) };
}

function fixture() {
  const history = new GroupRumorHistory(
    new KeyValueRumorHistoryBackend(new InMemoryKeyValueStore()),
  );
  const onError = vi.fn();
  const onChange = vi.fn();
  return {
    history,
    onError,
    onChange,
    create: () => new GroupTimeline(history, { onError, onChange }),
  };
}

describe("private group history projection", () => {
  it("loads messages and reactions sharing a page-boundary timestamp without skips", async () => {
    const { history, create, onError } = fixture();
    const rumors = Array.from({ length: 75 }, (_, index) =>
      rumor(index, index % 3 === 0 ? 7 : 9),
    );
    for (const item of rumors) await history.saveRumor(item);
    const timeline = create();
    try {
      await vi.waitFor(() =>
        expect(timeline.store.getTimeline({})).toHaveLength(50),
      );
      timeline.loadOlder();
      await vi.waitFor(() =>
        expect(timeline.store.getTimeline({})).toHaveLength(75),
      );
      expect(
        new Set(timeline.store.getTimeline({}).map((item) => item.id)),
      ).toEqual(new Set(rumors.map((item) => item.id)));
      expect(timeline.pagination.exhausted).toBe(true);
      expect(onError).not.toHaveBeenCalled();
    } finally {
      timeline.dispose();
    }
  });

  it("retracts losing-fork rumors and refills the visible window from canonical history", async () => {
    const { history, create } = fixture();
    for (let index = 0; index < 55; index++)
      await history.saveRumor(rumor(index));
    const timeline = create();
    try {
      await vi.waitFor(() =>
        expect(timeline.store.getTimeline({})).toHaveLength(50),
      );
      const removed = timeline.store.getTimeline({})[0];
      await history.removeMessage(removed.id);
      expect(timeline.store.hasEvent(removed.id)).toBe(false);
      await vi.waitFor(() =>
        expect(timeline.store.getTimeline({})).toHaveLength(50),
      );
      expect(timeline.store.hasEvent(removed.id)).toBe(false);
      await history.purgeMessages();
      await vi.waitFor(() =>
        expect(timeline.store.getTimeline({})).toEqual([]),
      );
    } finally {
      timeline.dispose();
    }
  });

  it("discards a stale snapshot when history changes during its database read", async () => {
    const { history, create } = fixture();
    const item = rumor(1);
    await history.saveRumor(item);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = history.queryRumors.bind(history);
    vi.spyOn(history, "queryRumors").mockImplementationOnce(async (filters) => {
      const snapshot = await original(filters);
      await gate;
      return snapshot;
    });
    const timeline = create();
    try {
      await history.removeMessage(item.id);
      release();
      await vi.waitFor(() =>
        expect(history.queryRumors).toHaveBeenCalledTimes(2),
      );
      expect(timeline.store.hasEvent(item.id)).toBe(false);
    } finally {
      release();
      timeline.dispose();
    }
  });

  it("detaches idle listeners and ignores reads completing after disposal", async () => {
    const { history, create, onChange } = fixture();
    let release!: (value: Rumor[]) => void;
    vi.spyOn(history, "queryRumors").mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const timeline = create();
    expect(history.listenerCount("rumor")).toBe(1);
    timeline.dispose();
    timeline.dispose();
    expect(history.listenerCount("rumor")).toBe(0);
    expect(history.listenerCount("removed")).toBe(0);
    expect(history.listenerCount("cleared")).toBe(0);
    release([rumor(1)]);
    await Promise.resolve();
    await Promise.resolve();
    expect(timeline.store.getTimeline({})).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });
});

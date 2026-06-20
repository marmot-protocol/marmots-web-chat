import { useEffect, useRef, useState } from "react";

/**
 * Consume an async iterable (e.g. an `async *` generator) into React state.
 *
 * The bridge that lets marmot-ts's async generators — `client.groups.watch()`
 * and `watchInvites()` — drive a React tree: every yielded value becomes a
 * state update, and the generator is `return()`-ed on unmount so its `finally`
 * runs (detaching the library's internal listeners). `factory` is re-invoked
 * only when `deps` change.
 */
export function useAsyncIterable<T>(
  factory: () => AsyncIterable<T>,
  initial: T,
  deps: React.DependencyList = [],
): T {
  const [value, setValue] = useState<T>(initial);
  const factoryRef = useRef(factory);
  factoryRef.current = factory;

  useEffect(() => {
    let active = true;
    const iterator = factoryRef.current()[Symbol.asyncIterator]();

    (async () => {
      try {
        while (active) {
          const next = await iterator.next();
          if (next.done || !active) break;
          setValue(next.value);
        }
      } catch (err) {
        if (active) console.error("[marmot] async iterable error", err);
      }
    })();

    return () => {
      active = false;
      void iterator.return?.(undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return value;
}

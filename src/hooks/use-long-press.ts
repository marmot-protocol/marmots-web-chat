import { useCallback, useRef } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

interface LongPressOptions {
  /** How long (ms) the press must be held before firing. */
  delay?: number;
  /** How far (px) the pointer may move before the press is cancelled (scroll). */
  moveThreshold?: number;
}

/**
 * Fires `onLongPress` when a touch/pen is held still for `delay` ms. Ignores
 * mouse input (desktop uses a right-click context menu instead) and cancels if
 * the pointer moves far enough to be a scroll. Returns props to spread on the
 * target element.
 */
export function useLongPress(
  onLongPress: () => void,
  { delay = 450, moveThreshold = 10 }: LongPressOptions = {},
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    start.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.pointerType === "mouse") return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, delay);
    },
    [delay, onLongPress],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!start.current) return;
      const dx = Math.abs(e.clientX - start.current.x);
      const dy = Math.abs(e.clientY - start.current.y);
      if (dx > moveThreshold || dy > moveThreshold) clear();
    },
    [clear, moveThreshold],
  );

  const onContextMenu = useCallback((e: ReactMouseEvent) => {
    // Suppress the browser's native long-press menu/callout on touch.
    if (fired.current) e.preventDefault();
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu,
  };
}

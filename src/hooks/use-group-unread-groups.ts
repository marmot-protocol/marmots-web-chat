import { getGroupSubscriptionManager } from "@/lib/runtime";
import { useState } from "react";
import { Observable, EMPTY } from "rxjs";

/**
 * Returns a stable reference to the group subscription manager's unreadGroupIds$ observable.
 *
 * Prevents observable re-subscription by caching the manager reference on first render,
 * rather than calling getGroupSubscriptionManager() on every render which can flip
 * between null and the actual manager instance.
 *
 * @returns The unreadGroupIds$ BehaviorSubject from the singleton manager, or EMPTY
 *   if the manager is not yet initialized. The observable reference itself is stable.
 *
 * @example
 * ```tsx
 * const groupsUnread = use$(useGroupUnreadGroupIds$());
 * ```
 */
export function useGroupUnreadGroupIds$(): Observable<string[]> {
  const [unreadObservable] = useState(() => {
    const manager = getGroupSubscriptionManager();
    return manager?.unreadGroupIds$ ?? (EMPTY as Observable<string[]>);
  });

  return unreadObservable;
}

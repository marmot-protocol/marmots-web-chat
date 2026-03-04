import { createContext, useContext } from "react";

import type { AppGroup } from "@/lib/marmot-client";

/**
 * Value provided to all child routes of the group detail layout.
 * Replaces the React Router outlet context so any component in the
 * subtree can access the group without prop-drilling or outlet typing.
 *
 * Derived group data (members, admins, name, epoch) is intentionally
 * omitted — mini apps read it directly from `group.state` using the
 * marmots helper functions (`extractMarmotGroupData`, `getGroupMembers`).
 */
export interface GroupContextValue {
  /** The resolved MarmotGroup instance for this route. */
  group: AppGroup;
  /** Whether the currently active account is an admin of this group. */
  isAdmin: boolean;
  /** True while an older-messages load is in flight. */
  loadingMore: boolean;
  /** True once all historical messages have been fetched. */
  loadingDone: boolean;
  /** Trigger a load of the next batch of older messages. */
  loadMoreMessages: () => Promise<void>;
}

/**
 * React context that exposes the resolved group and derived state to all
 * components within a group route subtree. Provided by the `[id].tsx`
 * layout component.
 */
export const GroupContext = createContext<GroupContextValue | null>(null);

/**
 * Returns the {@link GroupContextValue} from the nearest provider.
 * Throws if used outside a `GroupContext.Provider`.
 */
export function useGroup(): GroupContextValue {
  const ctx = useContext(GroupContext);
  if (!ctx)
    throw new Error("useGroup must be used within a GroupContext.Provider");
  return ctx;
}

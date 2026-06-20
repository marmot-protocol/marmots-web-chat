import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { use$ } from "applesauce-react/hooks";

import type {
  ListedKeyPackage,
  MarmotGroup,
} from "@internet-privacy/marmot-ts/client";

import { marmotController$ } from "@/lib/accounts";
import type {
  ChatSnapshot,
  InviteEntry,
  MarmotController,
} from "@/lib/marmot/controller";
import { useAsyncIterable } from "./use-async-iterable";

const ControllerContext = createContext<MarmotController | null>(null);

/**
 * Provides the active account's controller (or null while starting / signed
 * out). Subscribes to the reactive `marmotController$` so the tree re-renders
 * when the account switches or the controller finishes booting.
 */
export function MarmotProvider(props: { children: ReactNode }) {
  const controller = use$(marmotController$) ?? null;
  return (
    <ControllerContext.Provider value={controller}>
      {props.children}
    </ControllerContext.Provider>
  );
}

/** The controller for the active account, or null when signed out / booting. */
export function useController(): MarmotController | null {
  return useContext(ControllerContext);
}

const NOOP_SUBSCRIBE = () => () => {};

/** Reactive controller snapshot, or null when no controller is active. */
export function useChat(): ChatSnapshot | null {
  const controller = useController();
  return useSyncExternalStore(
    controller ? controller.subscribe : NOOP_SUBSCRIBE,
    () => (controller ? controller.getSnapshot() : null),
  );
}

/** The live group list, driven by the library's `groups.watch()` generator. */
export function useWatchedGroups(): MarmotGroup[] {
  const controller = useController();
  return useAsyncIterable<MarmotGroup[]>(
    () =>
      controller
        ? controller.client.groups.watch()
        : (async function* () {})(),
    [],
    [controller],
  );
}

/** The live list of this account's local key packages. */
export function useKeyPackages(): ListedKeyPackage[] {
  const controller = useController();
  return useAsyncIterable<ListedKeyPackage[]>(
    () =>
      controller
        ? controller.client.keyPackages.watchKeyPackages()
        : (async function* () {})(),
    [],
    [controller],
  );
}

/** The live unread-invite list, each annotated with `joinable`. */
export function useWatchedInvites(): InviteEntry[] {
  const controller = useController();
  return useAsyncIterable<InviteEntry[]>(
    () => (controller ? controller.watchInvites() : (async function* () {})()),
    [],
    [controller],
  );
}

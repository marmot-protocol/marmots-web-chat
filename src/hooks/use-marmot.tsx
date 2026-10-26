import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RumorStore } from "applesauce-core/event-store";
import { use$ } from "applesauce-react/hooks";

import type { ListedKeyPackage } from "@internet-privacy/marmot-ts/client";

import { marmotAccount$ } from "@/lib/accounts";
import type { MarmotAccount } from "@/lib/marmot/account";
import type {
  AppGroup,
  AppMarmotClient,
  InviteEntry,
} from "@/lib/marmot/types";
import type { PaginationState } from "@/lib/marmot/timeline";
import { useAsyncIterable } from "./use-async-iterable";

const AccountContext = createContext<MarmotAccount | null>(null);

/**
 * Provides the active account's runtime (or null while starting / signed out).
 * Subscribes to `marmotAccount$` so the tree re-renders when the account
 * switches or finishes building.
 */
export function MarmotProvider(props: { children: ReactNode }) {
  const account = use$(marmotAccount$) ?? null;
  return (
    <AccountContext.Provider value={account}>
      {props.children}
    </AccountContext.Provider>
  );
}

/**
 * The active account's runtime: pubkey, relay lists, notices, and the client.
 * @returns The account, or null when signed out or still building.
 * @example const account = useMarmotAccount();
 */
export function useMarmotAccount(): MarmotAccount | null {
  return useContext(AccountContext);
}

/**
 * The active account's Marmot client, for direct library calls.
 * @returns The client, or null when signed out or still building.
 * @example const client = useMarmotClient();
 */
export function useMarmotClient(): AppMarmotClient | null {
  return useMarmotAccount()?.client ?? null;
}

/**
 * The loaded groups (`client.groups.loaded`), re-rendering when the set changes
 * or any group's state changes. marmot-ts gap: the manager's `updated` event
 * only fires when groups are added or removed, so per-group `stateChanged`
 * listeners are attached here.
 * @returns Loaded groups, or undefined until saved groups are restored.
 * @example const groups = useGroups();
 */
export function useGroups(): AppGroup[] | undefined {
  const account = useMarmotAccount();
  const restored = use$(() => account?.groupsRestored$, [account]) ?? false;
  const [groups, setGroups] = useState<AppGroup[]>();
  useEffect(() => {
    setGroups(undefined);
    if (!account || !restored) return;
    const client = account.client;
    let attached: AppGroup[] = [];
    const emit = () => setGroups([...attached]);
    const sync = (next: AppGroup[]) => {
      for (const group of attached)
        if (!next.includes(group)) group.off("stateChanged", emit);
      for (const group of next)
        if (!attached.includes(group)) group.on("stateChanged", emit);
      attached = next;
      emit();
    };
    client.groups.on("updated", sync);
    sync(client.groups.loaded);
    return () => {
      client.groups.off("updated", sync);
      for (const group of attached) group.off("stateChanged", emit);
    };
  }, [account, restored]);
  return groups;
}

/**
 * One loaded group, re-rendering on its state changes.
 * @param groupId - Hex group ID.
 * @returns The group, null when it is not loaded, or undefined while loading.
 * @example const group = useGroup(id);
 */
export function useGroup(
  groupId: string | undefined,
): AppGroup | null | undefined {
  const groups = useGroups();
  if (!groups) return undefined;
  return groups.find((group) => group.idStr === groupId) ?? null;
}

/**
 * The group's local history window and its loading state.
 * @param group - A loaded group.
 * @returns The timeline's RumorStore, pagination, and a loader for older messages.
 * @example const { store, pagination, loadOlder } = useGroupTimeline(group);
 */
export function useGroupTimeline(group: AppGroup | null | undefined) {
  const account = useMarmotAccount();
  const timeline = group && account ? account.timeline(group) : undefined;
  const pagination = use$(() => timeline?.pagination$, [timeline]) as
    PaginationState | undefined;
  return {
    store: timeline?.store,
    pagination,
    loadOlder: () => timeline?.loadOlder(),
  };
}

/**
 * A group's private RumorStore, resolved without subscribing to group changes.
 * Cheap enough for per-message hooks.
 * @param groupId - Hex group ID.
 * @returns The store, when the group is loaded.
 * @example const store = useGroupStore(groupId);
 */
export function useGroupStore(
  groupId: string | undefined,
): RumorStore | undefined {
  const account = useMarmotAccount();
  const group = groupId ? account?.findGroup(groupId) : undefined;
  return group && account ? account.timeline(group).store : undefined;
}

/**
 * The live list of this account's local key packages.
 * @returns Packages from `keyPackages.watchKeyPackages()`.
 * @example const packages = useKeyPackages();
 */
export function useKeyPackages(): ListedKeyPackage[] {
  const client = useMarmotClient();
  return useAsyncIterable<ListedKeyPackage[]>(
    () =>
      client
        ? client.keyPackages.watchKeyPackages()
        : (async function* () {})(),
    [],
    [client],
  );
}

/**
 * The live unread-invite list, each annotated with `joinable`.
 * @returns Invites from `client.watchInvites()`.
 * @example const invites = useWatchedInvites();
 */
export function useWatchedInvites(): InviteEntry[] {
  const client = useMarmotClient();
  return useAsyncIterable<InviteEntry[]>(
    () => (client ? client.watchInvites() : (async function* () {})()),
    [],
    [client],
  );
}

/**
 * Run a user action with local pending state; failures appear in the notice banner.
 * @param fn - Action to run; receives the active account first.
 * @returns `run` (resolves to the result, or undefined on failure) and `pending`.
 * @example
 * const save = useAction((account, name: string) => account.saveProfile({ name }));
 * <Button disabled={save.pending} onClick={() => save.run(name)} />
 */
export function useAction<A extends unknown[], R>(
  fn: (account: MarmotAccount, ...args: A) => Promise<R>,
): { run: (...args: A) => Promise<R | undefined>; pending: boolean } {
  const account = useMarmotAccount();
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const [count, setCount] = useState(0);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      if (!account) return undefined;
      setCount((c) => c + 1);
      try {
        return await fnRef.current(account, ...args);
      } catch (err) {
        account.notifyError(err);
        return undefined;
      } finally {
        setCount((c) => c - 1);
      }
    },
    [account],
  );
  return { run, pending: count > 0 };
}

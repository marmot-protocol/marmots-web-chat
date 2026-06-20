import {
  GroupSubscriptionManager,
  ingestResultsDatabaseName,
} from "@/lib/group-subscription-manager";
import { marmotClient$ } from "@/lib/marmot-client";
import accounts from "@/lib/accounts";
import { combineLatest } from "rxjs";

let groupMgr: GroupSubscriptionManager | null = null;

/** Shared access to the singleton group subscription manager (if running). */
export function getGroupSubscriptionManager(): GroupSubscriptionManager | null {
  return groupMgr;
}

/**
 * Runtime side effects: starts/stops background managers based on auth state.
 *
 * Import this module once (e.g. in `main.tsx`) to activate.
 */
combineLatest([marmotClient$, accounts.active$]).subscribe(
  async ([client, account]) => {
    if (!client || !account) {
      // Client is not created, stop the managers
      groupMgr?.stop();
      groupMgr = null;
    } else {
      // Client is created, start the managers
      groupMgr ??= new GroupSubscriptionManager(
        client,
        ingestResultsDatabaseName(account.pubkey),
      );

      await groupMgr.start();
    }
  },
);

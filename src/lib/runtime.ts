import { GroupSubscriptionManager } from "@/lib/group-subscription-manager";
import { marmotClient$ } from "@/lib/marmot-client";

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
marmotClient$.subscribe(async (client) => {
  if (!client) {
    // Client is not created, stop the managers
    groupMgr?.stop();

    groupMgr = null;
  } else {
    // Client is created, start the managers
    groupMgr ??= new GroupSubscriptionManager(client);

    await groupMgr.start();
  }
});

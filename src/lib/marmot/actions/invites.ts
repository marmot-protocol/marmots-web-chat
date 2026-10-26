import type { NostrEvent } from "applesauce-core/helpers/event";
import { relaySet } from "applesauce-core/helpers/relays";
import {
  createInviteIntent,
  Proposals,
  type WelcomeRecipient,
} from "@internet-privacy/marmot-ts/client";

import { npubShort, requireAdmin } from "@/lib/marmot/actions/guards";
import type { AppGroup, AppMarmotClient } from "@/lib/marmot/types";

/**
 * Create a group, optionally with founding members who receive Welcomes directly.
 * @param client - The account's Marmot client.
 * @param name - Group name.
 * @param options - Description, group relays (required), and founding KeyPackage events.
 * @returns The new group and warnings for founding Welcomes that failed to deliver.
 */
export async function createGroup(
  client: AppMarmotClient,
  name: string,
  options: { description?: string; relays: string[]; invitees?: NostrEvent[] },
): Promise<{ group: AppGroup; warnings: string[] }> {
  const relays = relaySet(options.relays);
  if (!relays.length) throw new Error("group needs at least one relay");
  const group = await client.groups.create(name, {
    description: options.description,
    relays,
    invitees: options.invitees,
  });
  // marmot-ts gap: pendingWelcomes are in memory only, so a failed founding
  // Welcome cannot be retried after a reload.
  const warnings = group.pendingWelcomes.flatMap((outcome) =>
    outcome.kind === "failed"
      ? [
          `Welcome delivery failed for ${npubShort(outcome.recipient.pubkey)}: ${outcome.error}`,
        ]
      : [],
  );
  return { group, warnings };
}

/** Membership was committed, but at least one Welcome was not delivered. */
export class InviteDeliveryError extends Error {
  readonly failures: string[];
  constructor(failures: string[]) {
    super(
      "Membership was updated, but some invites were not delivered. Remove the unreachable members, then invite them again with fresh key packages.",
    );
    this.failures = failures;
  }
}

/**
 * Add KeyPackages to a group in one commit and require every Welcome to be delivered.
 * @param client - The account's Marmot client.
 * @param group - Group to invite into (admin only).
 * @param events - Selected KeyPackage events.
 * @throws {InviteDeliveryError} After committing, when any Welcome was not delivered.
 */
export async function inviteKeyPackages(
  client: AppMarmotClient,
  group: AppGroup,
  events: NostrEvent[],
): Promise<void> {
  const actorPubkey = await client.signer.getPublicKey();
  requireAdmin(group, actorPubkey);
  if (!events.length) throw new Error("no key packages selected");
  for (const event of events)
    createInviteIntent({ keyPackageEvent: event, actorPubkey });

  // marmot-ts gap: `groups.invite()` takes one KeyPackage; batching several
  // devices into one commit needs a hand-built commit intent.
  const recipients: WelcomeRecipient[] = events.map((event) => ({
    pubkey: event.pubkey,
    keyPackageEventId: event.id,
    keyPackageEvent: event,
  }));
  const results = await client.groups.send(group.id, {
    kind: "commit",
    actorPubkey,
    extraProposals: events.map((event) => Proposals.proposeInviteUser(event)),
    welcomeRecipients: recipients,
  });
  const failed = results.flatMap((result) =>
    result.welcomeDelivery.kind === "attempted"
      ? result.welcomeDelivery.outcomes.filter(
          (outcome) => outcome.kind === "failed",
        )
      : [],
  );
  if (failed.length)
    throw new InviteDeliveryError(
      failed.map(
        (outcome) =>
          `Welcome delivery failed for ${npubShort(outcome.recipient.pubkey)}: ${outcome.error}`,
      ),
    );
}

/**
 * Retry a failed founding Welcome without adding the member again.
 * @param client - The account's Marmot client.
 * @param group - Newly created group (admin only).
 * @param pubkey - Recipient whose delivery failed.
 */
export async function retryFoundingWelcome(
  client: AppMarmotClient,
  group: AppGroup,
  pubkey: string,
): Promise<void> {
  requireAdmin(group, await client.signer.getPublicKey());
  const outcome = await group.retryWelcome(pubkey);
  if (outcome.kind === "failed") throw new Error(outcome.error);
}

/**
 * Join from an unread invite, then remove it from the inbox.
 * @param client - The account's Marmot client.
 * @param inviteId - Unread invite rumor ID.
 * @returns The joined group.
 */
export async function joinInvite(
  client: AppMarmotClient,
  inviteId: string,
): Promise<AppGroup> {
  const rumor = (await client.invites.getUnread()).find(
    (entry) => entry.id === inviteId,
  );
  if (!rumor) throw new Error("invite not found (already accepted?)");
  const { group } = await client.joinGroupFromWelcome({ welcomeRumor: rumor });
  await client.invites.markAsRead(rumor.id);
  return group;
}

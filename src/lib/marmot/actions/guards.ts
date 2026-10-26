import { npubEncode } from "applesauce-core/helpers/pointers";

import type { AppGroup } from "@/lib/marmot/types";

/**
 * Abbreviate a pubkey for status messages.
 * @param pubkey - Hex public key.
 * @returns A shortened npub.
 */
export function npubShort(pubkey: string): string {
  const npub = npubEncode(pubkey);
  return `${npub.slice(0, 12)}…${npub.slice(-4)}`;
}

/**
 * A group's display name, falling back to its short ID.
 * @param group - Loaded group.
 * @returns The name from group metadata, or the first ID characters.
 */
export function groupName(group: AppGroup): string {
  return group.groupData?.name || `${group.idStr.slice(0, 8)}…`;
}

/**
 * Whether a pubkey is in the group's admin set.
 * @param group - Loaded group.
 * @param pubkey - Hex public key to check.
 * @returns True for group admins.
 */
export function isGroupAdmin(group: AppGroup, pubkey: string): boolean {
  return (group.groupData?.adminPubkeys ?? []).includes(pubkey);
}

/**
 * Refuse operations on read-only groups (older profile, removed, disbanded).
 * @param group - Loaded group.
 * @returns The same group, when it can send.
 */
export function requireActiveGroup(group: AppGroup): AppGroup {
  if (group.profileSupport.kind === "unsupported")
    throw new Error(
      "This group uses an older profile. Recreate it to continue chatting.",
    );
  if (group.status !== "active")
    throw new Error(`This group is ${group.status}`);
  return group;
}

/**
 * Refuse admin operations for non-admins before building a commit.
 * @param group - Loaded group.
 * @param pubkey - The acting account.
 * @returns The same group, when the account is an admin of an active group.
 */
export function requireAdmin(group: AppGroup, pubkey: string): AppGroup {
  requireActiveGroup(group);
  if (!isGroupAdmin(group, pubkey))
    throw new Error("only group admins can perform this action");
  return group;
}

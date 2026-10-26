import type { NostrEvent } from "applesauce-core/helpers/event";
import type { UnreadInvite } from "@internet-privacy/marmot-ts/client";
import type {
  GroupMediaStore,
  GroupRumorHistory,
  MarmotClient,
  MarmotGroup,
} from "@internet-privacy/marmot-ts";

/** A web group always has persistent rumor history and decrypted-media storage. */
export type AppGroup = MarmotGroup<GroupRumorHistory, GroupMediaStore>;
/** The web client with its concrete per-group backends. */
export type AppMarmotClient = MarmotClient<GroupRumorHistory, GroupMediaStore>;

/** One warning or error shown in the notice banner. */
export interface StatusLine {
  id: number;
  level: "info" | "warn" | "error";
  text: string;
  at: number;
}

/** Display-only information derived from the library package list. */
export interface KeyPackageSummary {
  total: number;
  unused: number;
  legacy: number;
  slot: string | null;
  newestPublishedAt: number | null;
  newestPublishedId: string | null;
  currentRefHex: string | null;
}

/** One of an invitee's published KeyPackages, evaluated against a group. */
export interface InviteCandidate {
  id: string;
  event: NostrEvent;
  createdAt: number;
  deviceId: string | null;
  refHex: string | null;
  invitable: boolean;
  alreadyMember: boolean;
  reasons: string[];
}

/** Devices discovered for an existing group invitation. */
export interface InviteCandidates {
  pubkey: string;
  npub: string;
  groupId: string;
  groupName: string;
  candidates: InviteCandidate[];
}

/** A library invitation annotated with its current joinability. */
export interface InviteEntry {
  invite: UnreadInvite;
  joinable: boolean;
}

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

/** Loading state for the local history window. */
export interface PaginationState {
  loadingOlder: boolean;
  exhausted: boolean;
}

/** One application diagnostic shown in the status UI. */
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

/**
 * Immutable snapshot consumed by React via `useSyncExternalStore`. The group
 * and invite lists are NOT here — React reads those from the library's
 * `groups.watch()` / `watchInvites()` generators. Per-group message timelines
 * live in dedicated RumorStore instances reached via the controller's getGroupStore().
 */
export interface ChatSnapshot {
  me: { pubkey: string; npub: string };
  relays: string[];
  connectedRelayCount: number;
  outboxRelays: string[];
  inboxRelays: string[];
  keyPackages: KeyPackageSummary;
  clientId: string;
  activeGroupId: string | null;
  pagination: Record<string, PaginationState>;
  status: StatusLine[];
  busy: boolean;
  /** True when audit logging is active AND an upload target is configured. */
  canUploadAudit: boolean;
}

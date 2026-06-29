import { EventStore } from "applesauce-core/event-store";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { getEventHash } from "applesauce-core/helpers/event";
import { normalizeRelayUrl } from "applesauce-core/helpers";
import {
  normalizeToPubkey,
  npubEncode,
} from "applesauce-core/helpers/pointers";
import {
  getProfileContent,
  type ProfileContent,
} from "applesauce-core/helpers/profile";
import { relaySet } from "applesauce-core/helpers/relays";
import type { Rumor } from "applesauce-common/helpers/gift-wrap";

import {
  createApplicationMessageIntent,
  createChatRumor,
  type GroupRumorHistory,
  type ListedKeyPackage,
  type MarmotClient,
  type MarmotGroup,
  Proposals,
  type UnreadInvite,
  type Unsubscribable,
  type WelcomeRecipient,
} from "@internet-privacy/marmot-ts/client";
import {
  ADDRESSABLE_KEY_PACKAGE_KIND,
  BLOSSOM_LOCATOR_KIND,
  createInboxRelayListEvent,
  createNip65RelayListEvent,
  encodeMediaImetaTag,
  encryptedMediaBlossomDefault,
  getKeyPackageIdentifier,
  getKeyPackageReference,
  resolveMediaFetchUrls,
  type EncryptedMediaPolicyV1,
  type MediaAttachment,
} from "@internet-privacy/marmot-ts";
import type { Proposal } from "@internet-privacy/marmot-ts/mls";
import {
  Actions,
  createUploadAuth,
  type SignedEvent,
  type Signer as BlossomSigner,
} from "blossom-client-sdk";

import type { Directory } from "./discovery";
import type { MarmotNetwork } from "./network";

/** Kinds projected into the per-group timeline: chat (9) + reactions (7). */
const TIMELINE_KINDS = [9, 7];
const CHAT_MESSAGE_KIND = 9;
const REACTION_KIND = 7;

/** How many of the newest messages the live history window holds per group. */
const HISTORY_WINDOW = 50;

/** Suggested Blossom servers when enabling encrypted media on a group. */
export const DEFAULT_BLOSSOM_SERVERS = ["https://blossom.primal.net"];

/** Best-effort `<width>x<height>` render hint for an image file. */
async function imageDimensions(file: File): Promise<string | undefined> {
  if (!file.type.startsWith("image/")) return undefined;
  try {
    const bitmap = await createImageBitmap(file);
    const dim = `${bitmap.width}x${bitmap.height}`;
    bitmap.close();
    return dim;
  } catch {
    return undefined;
  }
}

/** Minimal signer shape (applesauce `EventSigner`) the controller needs. */
type Signer = {
  getPublicKey(): Promise<string> | string;
  signEvent(draft: unknown): Promise<NostrEvent> | NostrEvent;
};

function shortHex(value: Uint8Array): string {
  let s = "";
  for (const b of value.slice(0, 4)) s += b.toString(16).padStart(2, "0");
  return s;
}

function npubShort(pubkey: string): string {
  const npub = npubEncode(pubkey);
  return `${npub.slice(0, 12)}…${npub.slice(-4)}`;
}

function normalizeRelays(relays: string[]): string[] {
  return relaySet(
    relays.flatMap((relay) => {
      try {
        return [normalizeRelayUrl(relay)];
      } catch {
        return [];
      }
    }),
  );
}

function groupName(group: MarmotGroup): string {
  return group.groupData?.name || shortGroupId(group.idStr);
}

function shortGroupId(idStr: string): string {
  return `${idStr.slice(0, 8)}…`;
}

function groupIsAdmin(group: MarmotGroup, pubkey: string): boolean {
  return (group.groupData?.adminPubkeys ?? []).includes(pubkey);
}

/** Build an unsigned rumor of any kind with its id filled in. */
function createRumor(options: {
  pubkey: string;
  kind: number;
  content: string;
  tags?: string[][];
  created_at?: number;
}): Rumor {
  const rumor: Rumor = {
    id: "",
    kind: options.kind,
    pubkey: options.pubkey,
    created_at: options.created_at ?? Math.floor(Date.now() / 1000),
    content: options.content,
    tags: options.tags ?? [],
  } as Rumor;
  rumor.id = getEventHash(rumor);
  return rumor;
}

export interface MarmotControllerOptions {
  client: MarmotClient;
  network: MarmotNetwork;
  directory: Directory;
  /** Shared reactive event cache (public Nostr data). */
  eventStore: EventStore;
  signer: Signer;
  pubkey: string;
  /** Bootstrap/discovery relays — read-only, never a publish target. */
  relays: string[];
  /** True for a freshly-created account (seeds outbox/inbox from `relays`). */
  fresh: boolean;
  /** This device's key-package slot (`d` tag / clientId). */
  clientId: string;
  /** Display name to publish as the kind 0 profile on first start (fresh only). */
  initialProfileName?: string;
}

export interface PaginationState {
  loadingOlder: boolean;
  exhausted: boolean;
}

export interface StatusLine {
  id: number;
  level: "info" | "warn" | "error";
  text: string;
  at: number;
}

export interface KeyPackageSummary {
  total: number;
  unused: number;
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

export interface InviteCandidates {
  pubkey: string;
  npub: string;
  groupId: string;
  groupName: string;
  candidates: InviteCandidate[];
}

export interface InviteEntry {
  invite: UnreadInvite;
  joinable: boolean;
}

/**
 * Immutable snapshot consumed by React via `useSyncExternalStore`. The group
 * and invite lists are NOT here — React reads those from the library's
 * `groups.watch()` / `watchInvites()` generators. Per-group message timelines
 * live in dedicated {@link EventStore}s reached via {@link getGroupStore}.
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
}

type Listener = () => void;

/**
 * Headless driver for the marmot-ts chat lifecycle. It owns every imperative
 * side effect — publishing identity, restoring groups, the per-group history
 * projection — and exposes an immutable {@link ChatSnapshot} plus per-group
 * {@link EventStore}s that React subscribes to. Inbound relay transport is owned
 * by the library (`groups.connectAll`, `invites.listen`).
 */
export class MarmotController {
  readonly #client: MarmotClient;
  readonly #network: MarmotNetwork;
  readonly #directory: Directory;
  readonly #eventStore: EventStore;
  readonly #signer: Signer;
  readonly #pubkey: string;
  readonly #relays: string[];
  readonly #fresh: boolean;
  readonly #clientId: string;
  readonly #initialProfileName?: string;

  /** Adapts the account signer to the function-shaped signer Blossom expects. */
  readonly #blossomSigner: BlossomSigner = async (draft) =>
    (await this.#signer.signEvent(draft)) as unknown as SignedEvent;

  readonly #groups = new Map<string, MarmotGroup>();
  readonly #bound = new Set<string>();
  /** Per-group rumor timeline store (kind 9 + 7), the source of the rendered chat. */
  readonly #groupStores = new Map<string, EventStore>();
  readonly #historySubs = new Map<string, AsyncGenerator<Rumor[]>>();
  readonly #pagination = new Map<string, PaginationState>();
  readonly #oldest = new Map<string, number>();

  readonly #listeners = new Set<Listener>();

  #status: StatusLine[] = [];
  #activeId: string | null = null;
  #keyPackages: KeyPackageSummary = {
    total: 0,
    unused: 0,
    slot: null,
    newestPublishedAt: null,
    newestPublishedId: null,
    currentRefHex: null,
  };
  #outboxRelays: string[];
  #inboxRelays: string[];
  #busy = false;
  #statusSeq = 0;

  #relayListsLoaded = false;
  #relayListsPromise?: Promise<void>;

  #watchAbort = false;
  #groupsConnection?: Unsubscribable;
  #inviteConnection?: Unsubscribable;

  #snapshot: ChatSnapshot;

  constructor(options: MarmotControllerOptions) {
    this.#client = options.client;
    this.#network = options.network;
    this.#directory = options.directory;
    this.#eventStore = options.eventStore;
    this.#signer = options.signer;
    this.#pubkey = options.pubkey;
    this.#relays = options.relays;
    this.#fresh = options.fresh;
    this.#clientId = options.clientId;
    this.#initialProfileName = options.initialProfileName;
    this.#outboxRelays = this.#fresh ? this.#relays : [];
    this.#inboxRelays = this.#fresh ? this.#relays : [];
    this.#snapshot = this.#buildSnapshot();
  }

  // --- React store interface -------------------------------------------------

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getSnapshot = (): ChatSnapshot => this.#snapshot;

  get client(): MarmotClient {
    return this.#client;
  }

  get eventStore(): EventStore {
    return this.#eventStore;
  }

  get pubkey(): string {
    return this.#pubkey;
  }

  /** The per-group timeline store (rumors), created lazily on attach. */
  getGroupStore(idStr: string): EventStore | undefined {
    return this.#groupStores.get(idStr);
  }

  getGroup(idStr: string): MarmotGroup | undefined {
    return this.#groups.get(idStr);
  }

  /**
   * The group's encrypted-media policy (component `0x8008`), or null when media
   * is not enabled. Read during render alongside {@link useChat} — group
   * `stateChanged` bumps the snapshot, so callers re-render when it changes.
   */
  getGroupMediaPolicy(idStr: string): EncryptedMediaPolicyV1 | null {
    return this.#groups.get(idStr)?.groupData?.encryptedMedia ?? null;
  }

  // --- lifecycle -------------------------------------------------------------

  async start(): Promise<void> {
    await this.#ensureKeyPackage();
    if (this.#watchAbort) return;
    await this.#publishInitialIdentity();
    if (this.#watchAbort) return;
    await this.#restoreGroups();
    if (this.#watchAbort) return;
    this.#client.groups.on("unreadable", () =>
      this.log("(dropped an unreadable group event)", "warn"),
    );
    this.#groupsConnection = this.#client.groups.connectAll({
      fallbackRelays: this.#relays,
    });
    this.#relistenInvites();
    void this.#watchGroups();
    this.log(`ready — you are ${npubEncode(this.#pubkey)}`);
    void this.#ensureRelayListsLoaded().catch((err) => {
      if (!this.#watchAbort) this.logError(err);
    });
  }

  async #publishInitialIdentity(): Promise<void> {
    const name = this.#initialProfileName;
    if (!name) return;
    await this.saveProfile({ name });
    if (this.#watchAbort) return;
    await this.saveRelayLists(this.#outboxRelays, this.#inboxRelays);
  }

  stop(): void {
    if (this.#watchAbort) return;
    this.#watchAbort = true;
    this.#inviteConnection?.unsubscribe();
    this.#groupsConnection?.unsubscribe();
    for (const gen of this.#historySubs.values()) void gen.return(undefined);
    this.#historySubs.clear();
    this.#network.close();
  }

  // --- actions ---------------------------------------------------------------

  setActive(idStr: string): void {
    if (!this.#groups.has(idStr)) return;
    this.#activeId = idStr;
    this.#publish();
  }

  async createGroup(
    name: string,
    options?: { description?: string; relays?: string[] },
  ): Promise<string | null> {
    let createdId: string | null = null;
    await this.#withBusy(async () => {
      const groupRelays = normalizeRelays(
        options?.relays ?? this.#outboxRelays,
      );
      if (!groupRelays.length)
        throw new Error("group needs at least one relay");
      const group = await this.#client.groups.create(name, {
        description: options?.description,
        relays: groupRelays,
      });
      this.#attachGroup(group);
      this.#activeId = group.idStr;
      createdId = group.idStr;
      this.log(`created "${name}" (${shortGroupId(group.idStr)}) — now active`);
    });
    return createdId;
  }

  async loadInviteCandidates(
    groupId: string,
    input: string,
  ): Promise<InviteCandidates | null> {
    if (this.#watchAbort) return null;
    this.#busy = true;
    this.#publish();
    try {
      const group = this.#groups.get(groupId);
      if (!group) throw new Error("group is not loaded");
      const pubkeyHex = normalizeToPubkey(input);
      if (!pubkeyHex) throw new Error(`invalid pubkey or npub: ${input}`);

      // Resolve the invitee's NIP-65 outbox relays — where their current key
      // packages live — and search THOSE specifically. Unioning with the
      // bootstrap relays surfaces stale key packages lingering on big public
      // relays; only fall back to bootstrap when no outbox can be found.
      const discovered = await this.#directory.outboxes(
        pubkeyHex,
        this.#relays,
      );
      const searchRelays = discovered.length
        ? relaySet(discovered)
        : relaySet(this.#relays);
      this.log(
        discovered.length
          ? `searching ${npubShort(pubkeyHex)}'s outbox relays for key packages`
          : `no outbox relays found for ${npubShort(pubkeyHex)} — using bootstrap relays`,
        discovered.length ? "info" : "warn",
      );
      const kps = await this.#network.request(searchRelays, {
        kinds: [ADDRESSABLE_KEY_PACKAGE_KIND],
        authors: [pubkeyHex],
      });
      if (!kps.length) {
        throw new Error(`no KeyPackage found for ${npubShort(pubkeyHex)}`);
      }

      // Keep only the newest key package per device slot (`d` tag). Relays that
      // don't honour replaceable semantics can return superseded versions; an
      // older one's private material is gone on the invitee's side, so inviting
      // it would deliver an undecryptable Welcome.
      const bySlot = new Map<string, NostrEvent>();
      for (const event of kps) {
        const slot = getKeyPackageIdentifier(event) ?? event.id;
        const prev = bySlot.get(slot);
        if (!prev || event.created_at > prev.created_at)
          bySlot.set(slot, event);
      }
      const candidates = [...bySlot.values()]
        .sort((a, b) => b.created_at - a.created_at)
        .map((event) => this.#describeCandidate(group, event));
      const invitable = candidates.filter((c) => c.invitable).length;
      this.log(
        `found ${candidates.length} KeyPackage(s) — ${invitable} invitable to "${groupName(group)}"`,
      );
      return {
        pubkey: pubkeyHex,
        npub: npubEncode(pubkeyHex),
        groupId: group.idStr,
        groupName: groupName(group),
        candidates,
      };
    } catch (err) {
      this.logError(err);
      return null;
    } finally {
      this.#busy = false;
      this.#publish();
    }
  }

  async inviteKeyPackages(
    groupId: string,
    events: NostrEvent[],
  ): Promise<void> {
    // Note: this does NOT go through #withBusy — that helper swallows errors and
    // no-ops when the client has stopped, which would let the invite dialog
    // close as if the send succeeded. Callers need failures to propagate.
    if (this.#watchAbort) throw new Error("client is not running");
    this.#busy = true;
    this.#publish();
    try {
      const group = this.#groups.get(groupId);
      if (!group) throw new Error("group is not loaded");
      if (!events.length) throw new Error("no key packages selected");

      const recipients: WelcomeRecipient[] = events.map((event) => ({
        pubkey: event.pubkey,
        keyPackageEventId: event.id,
        keyPackageEvent: event,
      }));
      await this.#client.groups.commit(group.id, {
        extraProposals: events.map((event) =>
          Proposals.proposeInviteUser(event),
        ),
        welcomeRecipients: recipients,
      });
      this.log(
        `invited ${events.length} key package(s) to "${groupName(group)}"`,
      );
    } catch (err) {
      this.logError(err);
      throw err;
    } finally {
      this.#busy = false;
      this.#publish();
    }
  }

  #describeCandidate(group: MarmotGroup, event: NostrEvent): InviteCandidate {
    const eligibility = group.evaluateKeyPackage(event);
    return {
      id: event.id,
      event,
      createdAt: event.created_at,
      deviceId: getKeyPackageIdentifier(event) ?? null,
      refHex: getKeyPackageReference(event) ?? null,
      invitable: eligibility.eligible,
      alreadyMember: eligibility.alreadyMember,
      reasons: eligibility.reasons,
    };
  }

  async joinInvite(inviteId: string): Promise<string | null> {
    let joinedId: string | null = null;
    await this.#withBusy(async () => {
      const unread = await this.#client.invites.getUnread();
      const rumor = unread.find((entry) => entry.id === inviteId);
      if (!rumor) throw new Error("invite not found (already accepted?)");
      const { group } = await this.#client.joinGroupFromWelcome({
        welcomeRumor: rumor,
      });
      await this.#client.invites.markAsRead(rumor.id);
      this.#attachGroup(group);
      this.#activeId = group.idStr;
      joinedId = group.idStr;
      this.log(`joined "${groupName(group)}" — now active`);
    });
    return joinedId;
  }

  previewInvite(invite: UnreadInvite) {
    return this.#client.previewWelcome(invite);
  }

  async dismissInvite(inviteId: string): Promise<void> {
    try {
      await this.#client.invites.markAsRead(inviteId);
      this.log("invite dismissed");
    } catch (err) {
      this.logError(err);
    }
  }

  async *watchInvites(): AsyncGenerator<InviteEntry[]> {
    yield* this.#client.watchInvites();
  }

  async leave(groupId: string): Promise<void> {
    await this.#withBusy(async () => {
      const group = this.#groups.get(groupId);
      if (!group) throw new Error("group is not loaded");
      await this.#client.groups.leave(group.id);
      this.#detachGroup(group.idStr);
      if (this.#activeId === group.idStr) {
        this.#activeId = [...this.#groups.keys()][0] ?? null;
      }
      this.log("left group");
    });
  }

  async updateGroupInfo(
    groupId: string,
    fields: { name?: string; description?: string },
  ): Promise<void> {
    await this.#withBusy(async () => {
      const group = this.#requireAdmin(groupId);
      const [proposal] = await Proposals.proposeUpdateMetadata(fields)(
        group.session.proposalContext(),
      );
      if (!proposal) return;
      await this.#client.groups.commit(group.id, {
        extraProposals: [proposal],
      });
      this.log(`updated group info`);
    });
  }

  async setMemberAdmin(
    groupId: string,
    pubkey: string,
    makeAdmin: boolean,
  ): Promise<void> {
    await this.#withBusy(async () => {
      const group = this.#requireAdmin(groupId);
      const current = group.groupData?.adminPubkeys ?? [];
      if (makeAdmin === current.includes(pubkey)) return;
      const next = makeAdmin
        ? [...current, pubkey]
        : current.filter((key) => key !== pubkey);
      if (next.length === 0) throw new Error("cannot demote the last admin");
      const [proposal] = await Proposals.proposeUpdateMetadata({
        adminPubkeys: next,
      })(group.session.proposalContext());
      if (!proposal) return;
      await this.#client.groups.commit(group.id, {
        extraProposals: [proposal],
      });
      this.log(`${makeAdmin ? "promoted" : "demoted"} ${npubShort(pubkey)}`);
    });
  }

  async removeMember(groupId: string, pubkey: string): Promise<void> {
    await this.#withBusy(async () => {
      const group = this.#requireAdmin(groupId);
      if (pubkey === this.#pubkey) {
        throw new Error("use leave to remove yourself");
      }
      const context = group.session.proposalContext();
      const extraProposals: Proposal[] =
        await Proposals.proposeRemoveUser(pubkey)(context);
      if (!extraProposals.length) return;
      const current = group.groupData?.adminPubkeys ?? [];
      if (current.includes(pubkey)) {
        const [metadata] = await Proposals.proposeUpdateMetadata({
          adminPubkeys: current.filter((key) => key !== pubkey),
        })(context);
        if (metadata) extraProposals.push(metadata);
      }
      await this.#client.groups.commit(group.id, { extraProposals });
      this.log(`removed ${npubShort(pubkey)} from "${groupName(group)}"`);
    });
  }

  /** Send a chat message (kind 9), optionally as a NIP-C7 reply. */
  async sendText(
    groupId: string,
    text: string,
    replyTo?: { id: string; pubkey: string },
  ): Promise<void> {
    const group = this.#requireGroup(groupId);
    const pubkey = await group.signer.getPublicKey();
    const tags = replyTo ? [["q", replyTo.id, "", replyTo.pubkey]] : undefined;
    const rumor = createChatRumor({ pubkey, content: text, tags });
    await this.#client.groups.send(
      group.id,
      createApplicationMessageIntent(rumor),
    );
  }

  /**
   * Encrypt a file with the group's per-epoch media key, upload the ciphertext
   * to a Blossom server from the group's media policy, then send a kind 9
   * message carrying the attachment's `imeta` tag (optionally as a reply, with
   * an optional caption). Throws if the group has no encrypted-media policy.
   */
  async sendMedia(
    groupId: string,
    file: File,
    caption?: string,
    replyTo?: { id: string; pubkey: string },
  ): Promise<void> {
    const group = this.#requireGroup(groupId);
    const policy = group.groupData?.encryptedMedia;
    if (!policy) throw new Error("media is not enabled for this group");
    const servers = policy.defaultBlobEndpoints
      .filter((e) => e.locatorKind === BLOSSOM_LOCATOR_KIND)
      .map((e) => e.baseUrl);
    if (!servers.length) {
      throw new Error("this group's media policy has no Blossom server");
    }

    const dim = await imageDimensions(file);
    const { encrypted, attachment } = await group.encryptMedia(file, {
      filename: file.name,
      type: file.type || undefined,
      dim,
    });

    // The ciphertext's SHA-256 is its Blossom content id, so the auth event is
    // bound to attachment.ciphertextSha256 and the same blob bytes are uploaded.
    const blob = new Blob([encrypted as BlobPart]);
    const auth = await createUploadAuth(
      this.#blossomSigner,
      attachment.ciphertextSha256,
      { message: `Upload ${file.name}` },
    );
    let url: string | undefined;
    let lastErr: unknown;
    for (const server of servers) {
      try {
        const descriptor = await Actions.uploadBlob(server, blob, { auth });
        url = descriptor.url;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!url) {
      throw new Error(
        `failed to upload media: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
      );
    }
    attachment.locators.push({ kind: BLOSSOM_LOCATOR_KIND, value: url });

    const pubkey = await group.signer.getPublicKey();
    const tags: string[][] = [encodeMediaImetaTag(attachment)];
    if (replyTo) tags.push(["q", replyTo.id, "", replyTo.pubkey]);
    const rumor = createChatRumor({ pubkey, content: caption ?? "", tags });
    await this.#client.groups.send(
      group.id,
      createApplicationMessageIntent(rumor),
    );
  }

  /**
   * Download an attachment from a policy-allowed locator and decrypt it,
   * verifying the ciphertext and plaintext hashes. Decrypted bytes are cached
   * by the library, so repeated calls for the same attachment are cheap.
   */
  async fetchAndDecryptMedia(
    groupId: string,
    attachment: MediaAttachment,
  ): Promise<{ data: Uint8Array; mediaType: string }> {
    const group = this.#requireGroup(groupId);
    const policy = group.groupData?.encryptedMedia;
    const urls = policy
      ? resolveMediaFetchUrls(attachment, policy)
      : attachment.locators
          .filter((l) => l.kind === BLOSSOM_LOCATOR_KIND)
          .map((l) => l.value);
    if (!urls.length)
      throw new Error("no fetchable locator for this attachment");

    let lastErr: unknown;
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const encrypted = new Uint8Array(await res.arrayBuffer());
        const stored = await group.decryptMedia(encrypted, attachment);
        return { data: stored.data, mediaType: stored.attachment.mediaType };
      } catch (err) {
        lastErr = err;
      }
    }
    throw new Error(
      `failed to load media: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    );
  }

  /**
   * Enable or update encrypted media for a group (admin only) by writing its
   * encrypted-media policy (component `0x8008`) with the given Blossom servers.
   */
  async setGroupMediaPolicy(
    groupId: string,
    baseUrls: string[],
  ): Promise<void> {
    await this.#withBusy(async () => {
      const group = this.#requireAdmin(groupId);
      const urls = baseUrls.map((u) => u.trim()).filter(Boolean);
      if (!urls.length)
        throw new Error("provide at least one Blossom server URL");
      const [proposal] = await Proposals.proposeUpdateMetadata({
        encryptedMedia: encryptedMediaBlossomDefault(urls),
      })(group.session.proposalContext());
      if (!proposal) return;
      await this.#client.groups.commit(group.id, {
        extraProposals: [proposal],
      });
      this.log(`updated media settings for "${groupName(group)}"`);
    });
  }

  /** React to a message with an emoji (kind 7). */
  async sendReaction(
    groupId: string,
    target: { id: string; pubkey: string },
    emoji: string,
  ): Promise<void> {
    const group = this.#requireGroup(groupId);
    const pubkey = await group.signer.getPublicKey();
    const rumor = createRumor({
      pubkey,
      kind: REACTION_KIND,
      content: emoji,
      tags: [
        ["e", target.id],
        ["p", target.pubkey],
      ],
    });
    await this.#client.groups.send(
      group.id,
      createApplicationMessageIntent(rumor),
    );
  }

  async loadOlder(groupId: string): Promise<void> {
    const group = this.#groups.get(groupId);
    if (!group) return;
    const history = group.history as unknown as GroupRumorHistory | undefined;
    const store = this.#groupStores.get(groupId);
    if (!history || !store) return;
    const state = this.#paginationState(groupId);
    if (state.loadingOlder || state.exhausted) return;

    const oldest = this.#oldest.get(groupId);
    state.loadingOlder = true;
    this.#publish();
    try {
      const loader = history.createPaginatedLoader({
        kinds: TIMELINE_KINDS,
        until: oldest !== undefined ? oldest - 1 : undefined,
        limit: HISTORY_WINDOW,
      });
      const { value } = await loader.next();
      void loader.return?.(undefined);
      const page = (value ?? []) as Rumor[];
      if (page.length) this.#ingestRumors(groupId, store, page);
      if (page.length < HISTORY_WINDOW) state.exhausted = true;
    } catch (err) {
      this.logError(err);
    } finally {
      state.loadingOlder = false;
      this.#publish();
    }
  }

  #paginationState(id: string): PaginationState {
    let state = this.#pagination.get(id);
    if (!state) {
      state = { loadingOlder: false, exhausted: false };
      this.#pagination.set(id, state);
    }
    return state;
  }

  async publishKeyPackage(): Promise<void> {
    await this.#withBusy(async () => {
      const relays = await this.#requirePublishRelays();
      const kp = await this.#client.keyPackages.create({ relays });
      await this.#refreshKeyPackageSummary();
      this.log(`published KeyPackage ${shortHex(kp.keyPackageRef)}`);
    });
  }

  async rotateKeyPackage(): Promise<void> {
    await this.#withBusy(async () => {
      const list = await this.#client.keyPackages.list();
      const current =
        list.find((p) => !p.used && p.identifier === this.#clientId) ??
        list.find((p) => !p.used) ??
        list[0];
      if (!current) throw new Error("no KeyPackage to rotate");
      const relays = await this.#requirePublishRelays();
      const rotated = await this.#client.keyPackages.rotate(
        current.keyPackageRef,
        { relays },
      );
      await this.#refreshKeyPackageSummary();
      this.log(
        `rotated KeyPackage ${shortHex(current.keyPackageRef)} → ${shortHex(rotated.keyPackageRef)}`,
      );
    });
  }

  async saveRelayLists(outbox: string[], inbox: string[]): Promise<void> {
    await this.#withBusy(async () => {
      const nextOutbox = normalizeRelays(outbox);
      const nextInbox = normalizeRelays(inbox);
      if (!nextOutbox.length)
        throw new Error("outbox (NIP-65) list needs at least one valid relay");
      if (!nextInbox.length)
        throw new Error(
          "inbox (kind 10050) list needs at least one valid relay",
        );
      const announce = relaySet(nextOutbox, this.#outboxRelays);
      await this.#publishOutboxList(nextOutbox, announce);
      await this.#publishInboxList(nextInbox, announce);
      this.#outboxRelays = nextOutbox;
      this.#relayListsLoaded = true;
      const inboxChanged =
        relaySet(nextInbox).join(",") !== relaySet(this.#inboxRelays).join(",");
      this.#inboxRelays = nextInbox;
      if (inboxChanged) this.#relistenInvites();
      this.log(`published relay lists`);
    });
  }

  async saveProfile(fields: ProfileContent): Promise<void> {
    await this.#withBusy(async () => {
      const relays = await this.#requirePublishRelays();
      const existing = this.#eventStore.getReplaceable(0, this.#pubkey);
      const merged: ProfileContent = {
        ...(existing ? getProfileContent(existing) : {}),
      };
      for (const [key, value] of Object.entries(fields)) {
        const text = typeof value === "string" ? value.trim() : value;
        if (text === "" || text == null)
          delete (merged as Record<string, unknown>)[key];
        else (merged as Record<string, unknown>)[key] = text;
      }
      const event = await this.#signer.signEvent({
        kind: 0,
        content: JSON.stringify(merged),
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      });
      await this.#network.publish(relays, event);
      this.#eventStore.add(event);
      this.log(`published profile (${merged.name || "no name"})`);
    });
  }

  log(text: string, level: StatusLine["level"] = "info"): void {
    const line = { id: this.#statusSeq++, level, text, at: Date.now() };
    this.#status = [...this.#status.slice(-200), line];
    if (level === "error") console.error("[marmot]", text);
    this.#publish();
  }

  logError(err: unknown): void {
    this.log(err instanceof Error ? err.message : String(err), "error");
  }

  // --- internals -------------------------------------------------------------

  async #withBusy(fn: () => Promise<void>): Promise<void> {
    if (this.#watchAbort) return;
    this.#busy = true;
    this.#publish();
    try {
      await fn();
    } catch (err) {
      this.logError(err);
    } finally {
      this.#busy = false;
      this.#publish();
    }
  }

  async #ensureRelayListsLoaded(): Promise<void> {
    if (this.#fresh || this.#relayListsLoaded) return;
    if (!this.#relayListsPromise) {
      this.#relayListsPromise = this.#loadRelayLists().then(
        () => {
          this.#relayListsLoaded = true;
        },
        (err) => {
          this.#relayListsPromise = undefined;
          throw err;
        },
      );
    }
    await this.#relayListsPromise;
  }

  async #requirePublishRelays(): Promise<string[]> {
    await this.#ensureRelayListsLoaded();
    const relays = relaySet(this.#outboxRelays);
    if (!relays.length) {
      throw new Error(
        "no outbox relays configured — set your relays before publishing",
      );
    }
    return relays;
  }

  async #loadRelayLists(): Promise<void> {
    const [outbox, inbox] = await Promise.all([
      this.#directory.outboxes(this.#pubkey, this.#relays),
      this.#directory.welcomeInboxes(this.#pubkey, this.#relays),
    ]);
    if (this.#watchAbort) return;
    if (outbox.length) this.#outboxRelays = outbox;
    const before = relaySet(this.#inboxRelays).join(",");
    if (inbox.length) this.#inboxRelays = inbox;
    const inboxChanged = relaySet(this.#inboxRelays).join(",") !== before;
    if (outbox.length || inbox.length) this.log("loaded your relay lists");
    if (inboxChanged) this.#relistenInvites();
    this.#publish();
  }

  async #publishOutboxList(relays: string[], targets: string[]): Promise<void> {
    const event = await this.#signer.signEvent(
      createNip65RelayListEvent({ pubkey: this.#pubkey, relays }),
    );
    await this.#network.publish(targets, event);
    this.#eventStore.add(event);
  }

  async #publishInboxList(relays: string[], targets: string[]): Promise<void> {
    const event = await this.#signer.signEvent(
      createInboxRelayListEvent({ pubkey: this.#pubkey, relays }),
    );
    await this.#network.publish(targets, event);
    this.#eventStore.add(event);
  }

  async #ensureKeyPackage(): Promise<void> {
    const existing = await this.#client.keyPackages.list();
    if (this.#watchAbort) return;
    if (existing.some((pkg) => !pkg.used)) {
      this.#setKeyPackageSummary(existing);
      return;
    }
    await this.#ensureRelayListsLoaded();
    if (this.#watchAbort) return;
    const relays = relaySet(this.#outboxRelays);
    if (!relays.length) {
      this.log(
        "no outbox relays — skipping KeyPackage publish; set your relays so others can invite you",
        "warn",
      );
      return;
    }
    await this.#client.keyPackages.create({ relays });
    if (this.#watchAbort) return;
    await this.#refreshKeyPackageSummary();
    this.log(`published a fresh KeyPackage so others can invite you`);
  }

  async #refreshKeyPackageSummary(): Promise<void> {
    this.#setKeyPackageSummary(await this.#client.keyPackages.list());
    this.#publish();
  }

  #setKeyPackageSummary(packages: ListedKeyPackage[]): void {
    const current =
      packages.find((pkg) => !pkg.used && pkg.identifier === this.#clientId) ??
      packages.find((pkg) => !pkg.used) ??
      packages[0];
    const newestPublished = packages
      .flatMap((pkg) => pkg.published ?? [])
      .reduce<NostrEvent | null>(
        (newest, event) =>
          !newest || event.created_at > newest.created_at ? event : newest,
        null,
      );
    this.#keyPackages = {
      total: packages.length,
      unused: packages.filter((pkg) => !pkg.used).length,
      slot: current?.identifier ?? null,
      newestPublishedAt: newestPublished?.created_at ?? null,
      newestPublishedId: newestPublished?.id ?? null,
      currentRefHex: current ? shortHex(current.keyPackageRef) : null,
    };
  }

  async #restoreGroups(): Promise<void> {
    const groups = await this.#client.groups.loadAll();
    if (this.#watchAbort) return;
    for (const group of groups) {
      if (this.#watchAbort) return;
      this.#attachGroup(group);
    }
    if (groups.length && !this.#activeId) this.#activeId = groups[0].idStr;
    if (groups.length) this.log(`restored ${groups.length} group(s)`);
  }

  async #watchGroups(): Promise<void> {
    try {
      for await (const groups of this.#client.groups.watch()) {
        if (this.#watchAbort) break;
        const live = new Set(groups.map((g) => g.idStr));
        for (const group of groups) {
          if (this.#watchAbort) break;
          if (!this.#groups.has(group.idStr)) this.#attachGroup(group);
        }
        if (this.#watchAbort) break;
        for (const id of [...this.#groups.keys()]) {
          if (!live.has(id)) this.#detachGroup(id);
        }
      }
    } catch (err) {
      if (!this.#watchAbort) this.logError(err);
    }
  }

  #attachGroup(group: MarmotGroup): void {
    if (this.#watchAbort) return;
    const id = group.idStr;
    this.#groups.set(id, group);
    if (!this.#groupStores.has(id)) {
      const store = new EventStore();
      // Rumors are unsigned; skip signature verification for this private store.
      store.verifyEvent = () => true;
      this.#groupStores.set(id, store);
    }
    if (!this.#bound.has(id)) {
      group.on("stateChanged", () => this.#publish());
      this.#bound.add(id);
    }
    this.#startHistory(group);
    this.#publish();
  }

  #detachGroup(id: string): void {
    const history = this.#historySubs.get(id);
    if (history) {
      this.#historySubs.delete(id);
      void history.return(undefined);
    }
    this.#pagination.delete(id);
    this.#oldest.delete(id);
    this.#groupStores.delete(id);
    this.#groups.delete(id);
    this.#publish();
  }

  #relistenInvites(): void {
    if (this.#watchAbort) return;
    const relays = relaySet(this.#inboxRelays);
    this.#inviteConnection?.unsubscribe();
    this.#inviteConnection = undefined;
    void this.#client.invites
      .listen(relays)
      .then((handle) => {
        if (this.#watchAbort) handle.unsubscribe();
        else this.#inviteConnection = handle;
      })
      .catch((err) => console.error("[marmot] invite listen failed", err));
  }

  #startHistory(group: MarmotGroup): void {
    const id = group.idStr;
    const history = group.history as unknown as GroupRumorHistory | undefined;
    const store = this.#groupStores.get(id);
    if (!history || !store || this.#historySubs.has(id)) return;
    const gen = history.subscribe({
      kinds: TIMELINE_KINDS,
      limit: HISTORY_WINDOW,
    });
    this.#historySubs.set(id, gen);
    void this.#consumeHistory(id, store, gen);
  }

  async #consumeHistory(
    id: string,
    store: EventStore,
    gen: AsyncGenerator<Rumor[]>,
  ): Promise<void> {
    try {
      for await (const rumors of gen) {
        if (this.#watchAbort || this.#historySubs.get(id) !== gen) break;
        this.#ingestRumors(id, store, rumors);
      }
    } catch (err) {
      if (!this.#watchAbort) this.logError(err);
    }
  }

  /** Add rumors to a group's store (idempotent by id) and track the oldest. */
  #ingestRumors(id: string, store: EventStore, rumors: Rumor[]): void {
    for (const rumor of rumors) {
      store.add(rumor as unknown as NostrEvent);
      if (rumor.kind === CHAT_MESSAGE_KIND) {
        const oldest = this.#oldest.get(id);
        if (oldest === undefined || rumor.created_at < oldest) {
          this.#oldest.set(id, rumor.created_at);
        }
      }
    }
  }

  #requireGroup(groupId: string): MarmotGroup {
    const group = this.#groups.get(groupId);
    if (!group) throw new Error("group is not loaded");
    return group;
  }

  #requireAdmin(groupId: string): MarmotGroup {
    const group = this.#requireGroup(groupId);
    if (!groupIsAdmin(group, this.#pubkey)) {
      throw new Error("only group admins can perform this action");
    }
    return group;
  }

  // --- snapshot plumbing -----------------------------------------------------

  #publish(): void {
    this.#snapshot = this.#buildSnapshot();
    for (const listener of this.#listeners) listener();
  }

  #buildSnapshot(): ChatSnapshot {
    const pagination: Record<string, PaginationState> = {};
    for (const [id, state] of this.#pagination) pagination[id] = { ...state };
    return {
      me: { pubkey: this.#pubkey, npub: npubEncode(this.#pubkey) },
      relays: this.#relays,
      connectedRelayCount: this.#network.relayCount,
      outboxRelays: this.#outboxRelays,
      inboxRelays: this.#inboxRelays,
      keyPackages: this.#keyPackages,
      clientId: this.#clientId,
      activeGroupId: this.#activeId,
      pagination,
      status: this.#status,
      busy: this.#busy,
    };
  }
}

import type { EventSigner } from "applesauce-core";
import type { EventStore, RumorStore } from "applesauce-core/event-store";
import type { NostrEvent } from "applesauce-core/helpers/event";
import { kinds } from "applesauce-core/helpers/event";
import { ProfileFactory } from "applesauce-core/factories";
import {
  ChatMessageFactory,
  ReactionFactory,
} from "applesauce-common/factories";
import { toRumor } from "applesauce-common/operations/gift-wrap";
import { npubEncode } from "applesauce-core/helpers/pointers";
import {
  getProfileContent,
  type ProfileContent,
} from "applesauce-core/helpers/profile";
import { relaySet } from "applesauce-core/helpers/relays";
import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import {
  createInviteIntent,
  createApplicationMessageIntent,
  type ListedKeyPackage,
  Proposals,
  type UnreadInvite,
  type Unsubscribable,
  type WelcomeRecipient,
} from "@internet-privacy/marmot-ts/client";
import {
  createInboxRelayListEvent,
  createNip65RelayListEvent,
  encryptedMediaBlossomDefault,
  type EncryptedMediaPolicyV2,
  type HistoricalMediaAttachment,
} from "@internet-privacy/marmot-ts";
import type { Proposal } from "@internet-privacy/marmot-ts/mls";

import type {
  ChatSnapshot,
  InviteCandidate,
  InviteCandidates,
  InviteEntry,
  StatusLine,
  AppGroup,
  AppMarmotClient,
} from "@/lib/marmot/types";
import type { Directory } from "@/lib/marmot/discovery";
import type { MarmotNetwork } from "@/lib/marmot/network";
import {
  uploadAuditLog,
  type AuditUploadConfig,
  type BrowserAuditRecorder,
} from "@/lib/marmot/audit";
import {
  KeyPackageDiscovery,
  describeInviteCandidate,
} from "@/lib/marmot/invitations";
import { GroupTimeline } from "@/lib/marmot/timeline";
import { GroupMedia } from "@/lib/marmot/media";
import {
  isCurrentDevicePackage,
  selectDeviceKeyPackage,
  shortHex,
  summarizeKeyPackages,
} from "@/lib/marmot/key-packages";
import {
  hasLegacySlot,
  isLegacyKeyPackage,
} from "@/lib/marmot/key-package-slot";

function npubShort(pubkey: string): string {
  const npub = npubEncode(pubkey);
  return `${npub.slice(0, 12)}…${npub.slice(-4)}`;
}

function groupName(group: AppGroup): string {
  return group.groupData?.name || shortGroupId(group.idStr);
}

function shortGroupId(idStr: string): string {
  return `${idStr.slice(0, 8)}…`;
}

function groupIsAdmin(group: AppGroup, pubkey: string): boolean {
  return (group.groupData?.adminPubkeys ?? []).includes(pubkey);
}

/** Dependencies supplied by setup.ts; this controller has no application singletons. */
export interface MarmotControllerOptions {
  client: AppMarmotClient;
  network: MarmotNetwork;
  directory: Directory;
  /** Shared reactive event cache (public Nostr data). */
  eventStore: EventStore;
  signer: EventSigner;
  pubkey: string;
  /** Bootstrap/discovery relays — read-only, never a publish target. */
  relays: string[];
  /** True for a freshly-created account (seeds outbox/inbox from `relays`). */
  fresh: boolean;
  /** This device's key-package slot (`d` tag / clientId). */
  clientId: string;
  /** Current lookup relays, read lazily so settings changes take effect. */
  lookupRelays?: () => string[];
  /** Forensic audit recorder when opt-in audit logging is enabled. */
  audit?: BrowserAuditRecorder;
  /** Goggles upload target for the audit JSONL; absent disables uploading. */
  auditUpload?: AuditUploadConfig;
  /** Display name to publish as the kind 0 profile on first start (fresh only). */
  initialProfileName?: string;
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
  readonly #client: AppMarmotClient;
  readonly #network: MarmotNetwork;
  readonly #directory: Directory;
  readonly #keyPackageDiscovery: KeyPackageDiscovery;
  readonly #eventStore: EventStore;
  readonly #signer: EventSigner;
  readonly #pubkey: string;
  readonly #relays: string[];
  readonly #fresh: boolean;
  readonly #clientId: string;
  readonly #lookupRelays: () => string[];
  readonly #audit?: BrowserAuditRecorder;
  readonly #auditUpload?: AuditUploadConfig;
  readonly #initialProfileName?: string;

  readonly #abort = new AbortController();
  readonly #media = new GroupMedia(this.#abort.signal);

  readonly #groups = new Map<string, AppGroup>();
  readonly #groupListeners = new Map<string, () => void>();
  readonly #timelines = new Map<string, GroupTimeline>();

  readonly #listeners = new Set<Listener>();

  #status: StatusLine[] = [];
  #activeId: string | null = null;
  #keyPackages = summarizeKeyPackages([], "");
  #outboxRelays: string[];
  #inboxRelays: string[];
  #pendingActions = 0;
  #statusSeq = 0;

  #relayListsAuthoritative = false;
  #relayListsPromise?: Promise<void>;

  #stopped = false;
  #startPromise?: Promise<void>;
  readonly #onUnreadable = () =>
    this.log("(dropped an unreadable group event)", "warn");
  #groupsConnection?: Unsubscribable;
  #inviteConnection?: Unsubscribable;
  #inviteListenGeneration = 0;

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
    this.#lookupRelays = options.lookupRelays ?? (() => []);
    this.#audit = options.audit;
    this.#auditUpload = options.auditUpload;
    this.#initialProfileName = options.initialProfileName;
    this.#outboxRelays = this.#fresh ? this.#relays : [];
    this.#inboxRelays = this.#fresh ? this.#relays : [];
    this.#keyPackageDiscovery = new KeyPackageDiscovery({
      directory: this.#directory,
      network: this.#network,
      eventStore: this.#eventStore,
      relays: this.#relays,
      lookupRelays: this.#lookupRelays,
      signal: this.#abort.signal,
      log: (text, level) => this.log(text, level),
    });
    this.#snapshot = this.#buildSnapshot();
  }

  // --- React store interface -------------------------------------------------

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getSnapshot = (): ChatSnapshot => this.#snapshot;

  get client(): AppMarmotClient {
    return this.#client;
  }

  get eventStore(): EventStore {
    return this.#eventStore;
  }

  get pubkey(): string {
    return this.#pubkey;
  }

  /** The per-group timeline store (rumors), created lazily on attach. */
  getGroupStore(idStr: string): RumorStore | undefined {
    return this.#timelines.get(idStr)?.store;
  }

  getGroup(idStr: string): AppGroup | undefined {
    return this.#groups.get(idStr);
  }

  /**
   * The group's encrypted-media policy (component `0x800b`), or null when media
   * is not enabled. Read during render alongside {@link useChat} — group
   * `stateChanged` bumps the snapshot, so callers re-render when it changes.
   */
  getGroupMediaPolicy(idStr: string): EncryptedMediaPolicyV2 | null {
    return this.#groups.get(idStr)?.groupData?.encryptedMedia ?? null;
  }

  // --- lifecycle -------------------------------------------------------------

  /** Start this account once; callers share initialization and its failure. */
  start(): Promise<void> {
    if (this.#stopped)
      return Promise.reject(new Error("Controller is stopped"));
    return (this.#startPromise ??= this.#start());
  }

  async #start(): Promise<void> {
    await this.#publishInitialIdentity();
    if (this.#stopped) return;
    await this.#restoreGroups();
    if (this.#stopped) return;
    this.#client.groups.on("unreadable", this.#onUnreadable);
    this.#groupsConnection = this.#client.groups.connectAll({
      fallbackRelays: this.#relays,
    });
    this.#relistenInvites();
    void this.#watchGroups();
    try {
      await this.#ensureKeyPackage();
    } catch (error) {
      this.logError(error);
    }
    if (this.#stopped) return;
    this.log(`ready — you are ${npubEncode(this.#pubkey)}`);
    void this.#ensureRelayListsLoaded().catch((err) => {
      if (!this.#stopped) this.logError(err);
    });
  }

  async #publishInitialIdentity(): Promise<void> {
    const name = this.#initialProfileName;
    if (!this.#fresh) return;
    await this.saveRelayLists(this.#outboxRelays, this.#inboxRelays);
    if (this.#stopped) return;
    if (name) await this.saveProfile({ name });
  }

  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#abort.abort();
    this.#inviteConnection?.unsubscribe();
    this.#groupsConnection?.unsubscribe();
    this.#client.groups.off("unreadable", this.#onUnreadable);
    for (const timeline of this.#timelines.values()) timeline.dispose();
    this.#timelines.clear();
    for (const unsubscribe of this.#groupListeners.values()) unsubscribe();
    this.#groupListeners.clear();
    for (const group of this.#groups.values()) group.dispose();
    this.#network.close();
    // Flush the in-memory audit buffer to its OPFS file so the log survives the
    // teardown; best-effort, never blocks stop().
    void this.#audit?.close();
  }

  // --- actions ---------------------------------------------------------------

  setActive(idStr: string): void {
    if (!this.#groups.has(idStr)) return;
    this.#activeId = idStr;
    this.#publish();
  }

  async createGroup(
    name: string,
    options?: {
      description?: string;
      relays?: string[];
      invitees?: NostrEvent[];
    },
  ): Promise<string | null> {
    let createdId: string | null = null;
    await this.#withBusy(async () => {
      const groupRelays = relaySet(options?.relays ?? this.#outboxRelays);
      if (!groupRelays.length)
        throw new Error("group needs at least one relay");
      const group = await this.#client.groups.create(name, {
        description: options?.description,
        relays: groupRelays,
        invitees: options?.invitees,
      });
      this.#attachGroup(group);
      for (const outcome of group.pendingWelcomes) {
        if (outcome.kind === "failed")
          this.log(
            `Welcome delivery failed for ${npubShort(outcome.recipient.pubkey)}: ${outcome.error}`,
            "warn",
          );
      }
      this.#activeId = group.idStr;
      createdId = group.idStr;
      this.log(`created "${name}" (${shortGroupId(group.idStr)}) — now active`);
    });
    return createdId;
  }

  /** Discover and validate devices to include in a new group's founding membership.
   * @param input - Public key, npub, or NIP-05 identifier.
   * @param onProgress - Receives the current discovery step.
   * @returns Validated candidates, with rejection reasons for incompatible devices.
   */
  async loadFoundingCandidates(
    input: string,
    onProgress?: (step: string) => void,
  ): Promise<InviteCandidate[]> {
    const { events } = await this.#keyPackageDiscovery.load(input, onProgress);
    return events.map((event) => describeInviteCandidate(event, this.#pubkey));
  }

  async loadInviteCandidates(
    groupId: string,
    input: string,
    onProgress?: (step: string) => void,
  ): Promise<InviteCandidates | null> {
    if (this.#stopped) return null;
    this.#pendingActions++;
    this.#publish();
    try {
      const group = this.#groups.get(groupId);
      if (!group) throw new Error("group is not loaded");
      const { pubkey: pubkeyHex, events } =
        await this.#keyPackageDiscovery.load(input, onProgress);
      const candidates = events
        .sort((a, b) => b.created_at - a.created_at)
        .map((event) => describeInviteCandidate(event, this.#pubkey, group));
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
      this.#pendingActions--;
      this.#publish();
    }
  }

  /** Retry a failed founding Welcome without adding the member again.
   * @param groupId - Newly created group.
   * @param pubkey - Recipient whose delivery failed.
   * @returns Resolves after the retry, with failures shown in the group report.
   */
  async retryFoundingWelcome(groupId: string, pubkey: string): Promise<void> {
    await this.#withBusy(async () => {
      const outcome = await this.#requireAdmin(groupId).retryWelcome(pubkey);
      if (outcome.kind === "failed") throw new Error(outcome.error);
      this.log(`delivered Welcome to ${npubShort(pubkey)}`);
    });
  }

  async inviteKeyPackages(
    groupId: string,
    events: NostrEvent[],
  ): Promise<void> {
    // Note: this does NOT go through #withBusy — that helper swallows errors and
    // no-ops when the client has stopped, which would let the invite dialog
    // close as if the send succeeded. Callers need failures to propagate.
    if (this.#stopped) throw new Error("client is not running");
    this.#pendingActions++;
    this.#publish();
    try {
      const group = this.#requireAdmin(groupId);
      if (!events.length) throw new Error("no key packages selected");
      for (const event of events)
        createInviteIntent({
          keyPackageEvent: event,
          actorPubkey: this.#pubkey,
        });

      const recipients: WelcomeRecipient[] = events.map((event) => ({
        pubkey: event.pubkey,
        keyPackageEventId: event.id,
        keyPackageEvent: event,
      }));
      const results = await this.#client.groups.send(group.id, {
        kind: "commit",
        actorPubkey: this.#pubkey,
        extraProposals: events.map((event) =>
          Proposals.proposeInviteUser(event),
        ),
        welcomeRecipients: recipients,
      });
      const failed = results.flatMap((result) =>
        result.welcomeDelivery.kind === "attempted"
          ? result.welcomeDelivery.outcomes.filter(
              (outcome) => outcome.kind === "failed",
            )
          : [],
      );
      for (const outcome of failed)
        this.log(
          `Welcome delivery failed for ${npubShort(outcome.recipient.pubkey)}: ${outcome.error}`,
          "warn",
        );
      if (failed.length)
        throw new Error(
          "Membership was updated, but some invites were not delivered. Remove the unreachable members, then invite them again with fresh key packages.",
        );
      this.log(
        `invited ${events.length} key package(s) to "${groupName(group)}"`,
      );
    } catch (err) {
      this.logError(err);
      throw err;
    } finally {
      this.#pendingActions--;
      this.#publish();
    }
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

  /** Retry the exact pending commit without regenerating membership or metadata changes. */
  async retryPendingChanges(groupId: string): Promise<void> {
    await this.#withBusy(async () => {
      const count = await this.#resumePendingPublication(
        this.#requireGroup(groupId),
      );
      this.log(
        count ? "Pending changes published" : "No pending changes to publish",
      );
    });
  }

  /** Step down from the admin set and leave only after publication succeeds. */
  async leave(groupId: string): Promise<boolean> {
    return this.#withBusy(async () => {
      const group = this.#requireGroup(groupId);
      const admins = group.groupData?.adminPubkeys ?? [];
      if (admins.includes(this.#pubkey)) {
        if (!admins.some((pubkey) => pubkey !== this.#pubkey)) {
          throw new Error(
            "Promote another member to admin before leaving this group",
          );
        }
        await this.#client.groups.commit(group.id, {
          extraProposals: await Proposals.proposeUpdateMetadata({
            adminPubkeys: admins.filter((pubkey) => pubkey !== this.#pubkey),
          })(group.session.proposalContext()),
        });
      }
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
    onPrepared?: (rumor: Rumor) => void,
  ): Promise<void> {
    const group = this.#requireGroup(groupId);
    let message = ChatMessageFactory.create(text).modifyPublicTags((tags) => [
      ...tags,
      ["client_nonce", crypto.randomUUID()],
    ]);
    if (replyTo)
      message = message.replyTo({ id: replyTo.id, author: replyTo.pubkey });
    const rumor = await message.then(toRumor(group.signer));
    onPrepared?.(rumor);
    await this.sendPreparedMessage(groupId, rumor);
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
    onPrepared?: (rumor: Rumor) => void,
  ): Promise<void> {
    const group = this.#requireGroup(groupId);
    const rumor = await this.#media.prepare(group, file, caption, replyTo);
    onPrepared?.(rumor);
    await this.sendPreparedMessage(groupId, rumor);
  }

  /** Publish an already prepared message, preserving media's source-state guard. */
  async sendPreparedMessage(groupId: string, rumor: Rumor): Promise<void> {
    const group = this.#requireGroup(groupId);
    await this.#client.groups.send(group.id, this.#media.intentFor(rumor));
  }

  /** Download media using authenticated source evidence for its canonical rumor. */
  async fetchAndDecryptMedia(
    groupId: string,
    attachment: HistoricalMediaAttachment,
    rumorId: string,
    signal?: AbortSignal,
  ): Promise<{ data: Uint8Array; mediaType: string }> {
    return this.#media.download(
      this.#requireGroup(groupId),
      attachment,
      rumorId,
      signal,
    );
  }

  /**
   * Enable or update encrypted media for a group (admin only) by writing its
   * encrypted-media policy (component `0x800b`) with the given Blossom servers.
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
      const [proposal] = await Proposals.proposeSetEncryptedMediaPolicy(
        encryptedMediaBlossomDefault(urls),
      )(group.session.proposalContext());
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
    const rumor = await ReactionFactory.create(
      { ...target, kind: kinds.ChatMessage },
      emoji,
    ).then(toRumor(group.signer));
    await this.#client.groups.send(
      group.id,
      createApplicationMessageIntent(rumor),
    );
  }

  /** Expand the group's local history projection without making a relay request. */
  loadOlder(groupId: string): void {
    this.#timelines.get(groupId)?.loadOlder();
  }

  /** Retire legacy packages only after a current package is available.
   * @returns Resolves after relay deletions and local cleanup finish.
   */
  async purgeLegacyKeyPackages(): Promise<void> {
    await this.#withBusy(async () => {
      await this.#ensureKeyPackage();
      const packages = await this.#client.keyPackages.list();
      if (
        !packages.some(
          (pkg) =>
            !pkg.used &&
            !isLegacyKeyPackage(pkg) &&
            pkg.identifier === this.#clientId,
        )
      ) {
        throw new Error(
          "Publish a current key package before retiring legacy packages",
        );
      }
      const legacy = packages.filter(isLegacyKeyPackage);
      if (legacy.length)
        await this.#client.keyPackages.purge(
          legacy.map((pkg) => pkg.keyPackageRef),
        );
      await this.#refreshKeyPackageSummary();
      this.log(`retired ${legacy.length} legacy key package(s)`);
    });
  }

  /** Delete a legacy group's local state when explicitly requested.
   * @param groupId - Unsupported group to remove from this device.
   * @returns Whether local removal succeeded.
   */
  async removeLegacyGroup(groupId: string): Promise<boolean> {
    let removed = false;
    await this.#withBusy(async () => {
      const group = this.#groups.get(groupId);
      if (!group) throw new Error("Group is not loaded");
      if (group.profileSupport.kind !== "unsupported")
        throw new Error("Use Leave group for current groups");
      await group.destroy();
      this.#detachGroup(groupId);
      removed = true;
    });
    return removed;
  }

  async publishKeyPackage(): Promise<void> {
    await this.#withBusy(async () => {
      const relays = await this.#requireKeyPackageRelays();
      const kp = await this.#client.keyPackages.create({ relays });
      await this.#refreshKeyPackageSummary();
      this.log(`published KeyPackage ${shortHex(kp.keyPackageRef)}`);
    });
  }

  async rotateKeyPackage(): Promise<void> {
    await this.#withBusy(async () => {
      const list = await this.#client.keyPackages.list();
      const current = selectDeviceKeyPackage(list, this.#clientId);
      if (!current) throw new Error("no KeyPackage to rotate");
      const relays = await this.#requireKeyPackageRelays();
      const rotated = await this.#client.keyPackages.rotate(
        current.keyPackageRef,
        // Pin the slot so rotating a legacy device-label package migrates it.
        { relays, d: this.#clientId },
      );
      await this.#refreshKeyPackageSummary();
      this.log(
        `rotated KeyPackage ${shortHex(current.keyPackageRef)} → ${shortHex(rotated.keyPackageRef)}`,
      );
    });
  }

  async saveRelayLists(outbox: string[], inbox: string[]): Promise<void> {
    await this.#withBusy(async () => {
      const nextOutbox = relaySet(outbox);
      const nextInbox = relaySet(inbox);
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
      this.#relayListsAuthoritative = true;
      const inboxChanged =
        relaySet(nextInbox).join(",") !== relaySet(this.#inboxRelays).join(",");
      this.#inboxRelays = nextInbox;
      if (inboxChanged) this.#relistenInvites();
      this.log(`published relay lists`);
      await this.#ensureKeyPackage();
    });
  }

  async saveProfile(fields: ProfileContent): Promise<void> {
    await this.#withBusy(async () => {
      const relays = await this.#requirePublishRelays();
      const existing = this.#eventStore.getReplaceable(
        kinds.Metadata,
        this.#pubkey,
      );
      const merged: ProfileContent = {
        ...(existing ? getProfileContent(existing) : {}),
      };
      for (const [key, value] of Object.entries(fields)) {
        const text = typeof value === "string" ? value.trim() : value;
        if (text === "" || text == null)
          delete (merged as Record<string, unknown>)[key];
        else (merged as Record<string, unknown>)[key] = text;
      }
      const event = await ProfileFactory.create()
        .override(merged)
        .sign(this.#signer);
      await this.#network.publish(relays, event);
      this.#eventStore.add(event);
      this.log(`published profile (${merged.name || "no name"})`);
    });
  }

  log(text: string, level: StatusLine["level"] = "info"): void {
    if (this.#stopped) return;
    const line = { id: this.#statusSeq++, level, text, at: Date.now() };
    this.#status = [...this.#status.slice(-200), line];
    if (level === "error") console.error("[marmot]", text);
    this.#publish();
  }

  logError(err: unknown): void {
    this.log(err instanceof Error ? err.message : String(err), "error");
  }

  /** True when an audit log is being recorded *and* an upload target is set. */
  get canUploadAudit(): boolean {
    return Boolean(this.#audit && this.#auditUpload);
  }

  /**
   * Upload this device's audit JSONL to the configured Goggles tracker. A no-op
   * (returns null) when auditing or an upload endpoint isn't configured. The
   * recorder keeps the full log in memory, so this is safe to call repeatedly
   * while the app runs. Best-effort: any failure is logged and swallowed.
   */
  async uploadAuditLog(): Promise<void> {
    const audit = this.#audit;
    const upload = this.#auditUpload;
    if (!audit || !upload) return;
    await this.#withBusy(async () => {
      this.log(`uploading audit log to ${upload.endpoint}…`);
      const result = await uploadAuditLog(audit.readNdjson(), upload.endpoint, {
        bearerToken: upload.bearerToken,
        source: upload.source,
      });
      this.log(
        `uploaded audit log — ${result.bytesSent} bytes, HTTP ${result.status}`,
      );
    });
  }

  // --- internals -------------------------------------------------------------

  /** UI commands report errors as status and a success flag; message sends still throw. */
  async #withBusy(fn: () => Promise<void>): Promise<boolean> {
    if (this.#stopped) return false;
    this.#pendingActions++;
    this.#publish();
    try {
      await fn();
      return true;
    } catch (err) {
      this.logError(err);
      return false;
    } finally {
      this.#pendingActions--;
      this.#publish();
    }
  }

  /** Retry incomplete discovery; share only the in-flight request. */
  async #ensureRelayListsLoaded(): Promise<void> {
    if (this.#fresh || (this.#outboxRelays.length && this.#inboxRelays.length))
      return;
    if (!this.#relayListsPromise) {
      this.#relayListsPromise = this.#loadRelayLists().finally(() => {
        this.#relayListsPromise = undefined;
      });
    }
    await this.#relayListsPromise;
  }

  /** Re-attempt relay discovery when opening setup or group creation. */
  async refreshRelayLists(): Promise<void> {
    try {
      await this.#ensureRelayListsLoaded();
    } catch (err) {
      if (!this.#stopped) this.logError(err);
    }
  }

  async #requireKeyPackageRelays(): Promise<string[]> {
    const relays = await this.#requirePublishRelays();
    if (!this.#inboxRelays.length)
      throw new Error(
        "Set your invite inbox relays in Settings before publishing a key package",
      );
    return relays;
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
      this.#directory.outboxes(
        this.#pubkey,
        relaySet(this.#relays, this.#lookupRelays()),
      ),
      this.#directory.welcomeInboxes(
        this.#pubkey,
        relaySet(this.#relays, this.#lookupRelays()),
      ),
    ]);
    if (this.#stopped || this.#relayListsAuthoritative) return;
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
    if (this.#stopped) return;
    if (existing.some((pkg) => isCurrentDevicePackage(pkg, this.#clientId))) {
      this.#setKeyPackageSummary(existing);
      await this.#retireLegacySlotKeyPackages(existing);
      return;
    }
    await this.#ensureRelayListsLoaded();
    if (this.#stopped) return;
    if (!this.#outboxRelays.length || !this.#inboxRelays.length) {
      this.#setKeyPackageSummary(existing);
      this.log(
        "Set both outbox and invite inbox relays in Settings so others can invite you",
        "warn",
      );
      return;
    }
    await this.#client.keyPackages.ensurePublished({
      relays: relaySet(this.#outboxRelays),
      identifier: this.#clientId,
    });
    if (this.#stopped) return;
    // create/ensurePublished return a summary without publication events. Read the
    // durable list before deciding whether this device still needs a publication.
    if (
      !(await this.#client.keyPackages.list()).some((pkg) =>
        isCurrentDevicePackage(pkg, this.#clientId),
      )
    ) {
      await this.#client.keyPackages.create({
        relays: relaySet(this.#outboxRelays),
        identifier: this.#clientId,
      });
    }
    if (this.#stopped) return;
    await this.#refreshKeyPackageSummary();
    this.log(`published a fresh KeyPackage so others can invite you`);
    await this.#retireLegacySlotKeyPackages(
      await this.#client.keyPackages.list(),
    );
  }

  /** Delete packages left under pre-0.7 device-label slots once this device
   * has published under its random slot. Each is purged on its own so one
   * without stored relay routes stays listed for manual retirement.
   * @param packages - Current local KeyPackage list.
   */
  async #retireLegacySlotKeyPackages(
    packages: ListedKeyPackage[],
  ): Promise<void> {
    const legacy = packages.filter(
      (pkg) => hasLegacySlot(pkg) && !pkg.nonCurrent,
    );
    if (!legacy.length || this.#stopped) return;
    let retired = 0;
    for (const pkg of legacy) {
      try {
        await this.#client.keyPackages.purge(pkg.keyPackageRef);
        retired++;
      } catch (err) {
        this.log(
          `could not retire KeyPackage under old slot ${pkg.identifier}: ${err instanceof Error ? err.message : String(err)}`,
          "warn",
        );
      }
    }
    if (!retired) return;
    await this.#refreshKeyPackageSummary();
    this.log(`retired ${retired} KeyPackage(s) under old device-label slots`);
  }

  async #refreshKeyPackageSummary(): Promise<void> {
    this.#setKeyPackageSummary(await this.#client.keyPackages.list());
    this.#publish();
  }

  #setKeyPackageSummary(packages: ListedKeyPackage[]): void {
    this.#keyPackages = summarizeKeyPackages(packages, this.#clientId);
  }

  async #resumePendingPublication(group: AppGroup): Promise<number> {
    const results = await group.retryPendingPublication();
    if (this.#stopped) return 0;
    for (const result of results) {
      if (result.persistence.kind === "failed")
        this.log(
          `Changes published, but local persistence needs recovery: ${result.persistence.error}`,
          "warn",
        );
      if (result.welcomeDelivery.kind === "attempted") {
        for (const outcome of result.welcomeDelivery.outcomes) {
          if (outcome.kind === "failed")
            this.log(
              `Changes published, but Welcome delivery failed for ${npubShort(outcome.recipient.pubkey)}: ${outcome.error}`,
              "warn",
            );
        }
      }
    }
    return results.length;
  }

  async #restoreGroups(): Promise<void> {
    const groups = await this.#client.groups.loadAll();
    if (this.#stopped) return;
    for (const group of groups) {
      if (this.#stopped) return;
      this.#attachGroup(group);
      if (
        group.profileSupport.kind === "supported" &&
        group.status === "active"
      ) {
        void this.#resumePendingPublication(group).catch((error) => {
          if (!this.#stopped) this.logError(error);
        });
      }
    }
    if (groups.length && !this.#activeId) this.#activeId = groups[0].idStr;
    if (groups.length) this.log(`restored ${groups.length} group(s)`);
  }

  async #watchGroups(): Promise<void> {
    try {
      for await (const groups of this.#client.groups.watch({
        signal: this.#abort.signal,
      })) {
        if (this.#stopped) break;
        const live = new Set(groups.map((g) => g.idStr));
        for (const group of groups) {
          if (this.#stopped) break;
          if (this.#groups.get(group.idStr) !== group) this.#attachGroup(group);
        }
        if (this.#stopped) break;
        for (const id of [...this.#groups.keys()]) {
          if (!live.has(id)) this.#detachGroup(id);
        }
      }
    } catch (err) {
      if (!this.#stopped) this.logError(err);
    }
  }

  #attachGroup(group: AppGroup): void {
    if (this.#stopped) return;
    const id = group.idStr;
    if (this.#groups.get(id) === group) return;
    if (this.#groups.has(id)) this.#detachGroup(id);
    this.#groups.set(id, group);
    if (group.profileSupport.kind === "unsupported")
      this.log(
        `"${groupName(group)}" uses an older group profile. Recreate it to continue chatting.`,
        "warn",
      );
    if (!this.#timelines.has(id)) {
      this.#timelines.set(
        id,
        new GroupTimeline(group.history, {
          onChange: () => this.#publish(),
          onError: (error) => this.logError(error),
        }),
      );
    }
    if (!this.#groupListeners.has(id)) {
      const onStateChanged = () => this.#publish();
      group.on("stateChanged", onStateChanged);
      this.#groupListeners.set(id, () =>
        group.off("stateChanged", onStateChanged),
      );
    }
    this.#publish();
  }

  #detachGroup(id: string): void {
    this.#timelines.get(id)?.dispose();
    this.#timelines.delete(id);
    this.#groupListeners.get(id)?.();
    this.#groupListeners.delete(id);
    this.#groups.delete(id);
    this.#publish();
  }

  #relistenInvites(): void {
    if (this.#stopped) return;
    const generation = ++this.#inviteListenGeneration;
    const relays = relaySet(this.#inboxRelays);
    this.#inviteConnection?.unsubscribe();
    this.#inviteConnection = undefined;
    void this.#client.invites
      .listen(relays)
      .then((handle) => {
        if (this.#stopped || generation !== this.#inviteListenGeneration)
          handle.unsubscribe();
        else this.#inviteConnection = handle;
      })
      .catch((err) => console.error("[marmot] invite listen failed", err));
  }

  #requireGroup(groupId: string): AppGroup {
    if (this.#stopped) throw new Error("Controller is stopped");
    const group = this.#groups.get(groupId);
    if (!group) throw new Error("group is not loaded");
    if (group.profileSupport.kind === "unsupported")
      throw new Error(
        "This group uses an older profile. Recreate it to continue chatting.",
      );
    if (group.status !== "active")
      throw new Error(`This group is ${group.status}`);
    return group;
  }

  #requireAdmin(groupId: string): AppGroup {
    const group = this.#requireGroup(groupId);
    if (!groupIsAdmin(group, this.#pubkey)) {
      throw new Error("only group admins can perform this action");
    }
    return group;
  }

  // --- snapshot plumbing -----------------------------------------------------

  #publish(): void {
    if (this.#stopped) return;
    this.#snapshot = this.#buildSnapshot();
    for (const listener of this.#listeners) listener();
  }

  #buildSnapshot(): ChatSnapshot {
    const pagination = Object.fromEntries(
      [...this.#timelines].map(([id, timeline]) => [id, timeline.pagination]),
    );
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
      busy: this.#pendingActions > 0,
      canUploadAudit: this.canUploadAudit,
    };
  }
}

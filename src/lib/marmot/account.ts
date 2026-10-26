import type { EventSigner } from "applesauce-core";
import type { EventStore } from "applesauce-core/event-store";
import { npubEncode } from "applesauce-core/helpers/pointers";
import type { ProfileContent } from "applesauce-core/helpers/profile";
import { relaySet } from "applesauce-core/helpers/relays";
import type { Unsubscribable } from "@internet-privacy/marmot-ts/client";
import {
  BehaviorSubject,
  Observable,
  Subscription,
  distinctUntilChanged,
  map,
  switchMap,
} from "rxjs";

import type { AppGroup, AppMarmotClient, StatusLine } from "@/lib/marmot/types";
import type { Directory } from "@/lib/marmot/discovery";
import type { MarmotNetwork } from "@/lib/marmot/network";
import {
  uploadAuditLog,
  type AuditUploadConfig,
  type BrowserAuditRecorder,
} from "@/lib/marmot/audit";
import { KeyPackageDiscovery } from "@/lib/marmot/invitations";
import { GroupTimeline } from "@/lib/marmot/timeline";
import { GroupMedia } from "@/lib/marmot/media";
import type { MessageSender } from "@/lib/marmot/message-outbox";
import { groupName } from "@/lib/marmot/actions/guards";
import { retryPendingChanges } from "@/lib/marmot/actions/group-admin";
import {
  ensureDeviceKeyPackage,
  hasDeviceKeyPackage,
  retireLegacySlotKeyPackages,
} from "@/lib/marmot/actions/key-packages";
import {
  sendMedia,
  sendPreparedMessage,
  sendText,
} from "@/lib/marmot/actions/messages";
import {
  publishProfile,
  publishRelayLists,
  type IdentityPublisher,
} from "@/lib/marmot/actions/identity";

/** Dependencies supplied by setup.ts; this module has no application singletons. */
export interface MarmotAccountOptions {
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

const MAX_NOTICES = 200;

/**
 * Background runtime for one signed-in account. The UI reads groups, invites,
 * key packages and history from {@link client} directly; this class owns only
 * what no library can: the account's public relay lists and profile, KeyPackage
 * upkeep for this browser's slot, relay connections, per-group history windows,
 * and warnings from background work.
 */
export class MarmotAccount {
  readonly client: AppMarmotClient;
  readonly network: MarmotNetwork;
  readonly directory: Directory;
  readonly eventStore: EventStore;
  readonly signer: EventSigner;
  readonly pubkey: string;
  readonly npub: string;
  readonly clientId: string;
  /** Bootstrap/discovery relays. */
  readonly relays: string[];
  readonly keyPackageDiscovery: KeyPackageDiscovery;
  readonly media: GroupMedia;

  /** The account's published NIP-65 outbox relays (empty until discovered). */
  readonly outboxRelays$: BehaviorSubject<string[]>;
  /** The account's published kind 10050 invite inbox relays. */
  readonly inboxRelays$: BehaviorSubject<string[]>;
  /** Warnings and errors that need the user's attention. */
  readonly notices$ = new BehaviorSubject<StatusLine[]>([]);
  /** True once saved groups have been loaded into `client.groups.loaded`. */
  readonly groupsRestored$ = new BehaviorSubject(false);

  /** Sends for the optimistic message outbox, resolving groups by ID. */
  readonly messageSender: MessageSender;

  readonly #fresh: boolean;
  readonly #lookupRelays: () => string[];
  readonly #audit?: BrowserAuditRecorder;
  readonly #auditUpload?: AuditUploadConfig;
  readonly #initialProfileName?: string;
  readonly #abort = new AbortController();
  readonly #timelines = new Map<AppGroup, GroupTimeline>();
  readonly #subscriptions = new Subscription();

  #noticeSeq = 0;
  #relayListsAuthoritative = false;
  #relayListsPromise?: Promise<void>;
  #stopped = false;
  #startPromise?: Promise<void>;
  #groupsConnection?: Unsubscribable;

  readonly #onUnreadable = () =>
    this.notify("(dropped an unreadable group event)");
  readonly #onGroupsUpdated = (groups: AppGroup[]) => {
    for (const [group, timeline] of this.#timelines) {
      if (groups.includes(group)) continue;
      timeline.dispose();
      this.#timelines.delete(group);
    }
  };

  constructor(options: MarmotAccountOptions) {
    this.client = options.client;
    this.network = options.network;
    this.directory = options.directory;
    this.eventStore = options.eventStore;
    this.signer = options.signer;
    this.pubkey = options.pubkey;
    this.npub = npubEncode(options.pubkey);
    this.clientId = options.clientId;
    this.relays = options.relays;
    this.#fresh = options.fresh;
    this.#lookupRelays = options.lookupRelays ?? (() => []);
    this.#audit = options.audit;
    this.#auditUpload = options.auditUpload;
    this.#initialProfileName = options.initialProfileName;
    this.outboxRelays$ = new BehaviorSubject(this.#fresh ? this.relays : []);
    this.inboxRelays$ = new BehaviorSubject(this.#fresh ? this.relays : []);
    this.media = new GroupMedia(this.#abort.signal);
    this.keyPackageDiscovery = new KeyPackageDiscovery({
      directory: this.directory,
      network: this.network,
      eventStore: this.eventStore,
      relays: this.relays,
      lookupRelays: this.#lookupRelays,
      signal: this.#abort.signal,
      log: (text, level) => {
        if (level && level !== "info") this.notify(text, level);
      },
    });
    const group = (groupId: string) => this.group(groupId);
    this.messageSender = {
      sendText: (groupId, ...args) =>
        sendText(this.client, group(groupId), ...args),
      sendMedia: (groupId, ...args) =>
        sendMedia(this.client, this.media, group(groupId), ...args),
      sendPreparedMessage: (groupId, rumor) =>
        sendPreparedMessage(this.client, this.media, group(groupId), rumor),
    };
  }

  /** Aborted when the account stops; pass to long-running work. */
  get signal(): AbortSignal {
    return this.#abort.signal;
  }

  /**
   * A loaded group by ID, without waiting for storage.
   * @param groupId - Hex group ID.
   * @returns The group, if loaded.
   */
  findGroup(groupId: string): AppGroup | undefined {
    return this.client.groups.loaded.find((group) => group.idStr === groupId);
  }

  /**
   * A loaded group by ID.
   * @param groupId - Hex group ID.
   * @returns The group; throws when it is not loaded.
   */
  group(groupId: string): AppGroup {
    const group = this.findGroup(groupId);
    if (!group) throw new Error("group is not loaded");
    return group;
  }

  // --- lifecycle -------------------------------------------------------------

  /** Start this account once; callers share initialization and its failure. */
  start(): Promise<void> {
    if (this.#stopped) return Promise.reject(new Error("Account is stopped"));
    return (this.#startPromise ??= this.#start());
  }

  async #start(): Promise<void> {
    if (this.#fresh) {
      await this.saveRelayLists(
        this.outboxRelays$.value,
        this.inboxRelays$.value,
      );
      if (this.#stopped) return;
      if (this.#initialProfileName)
        await this.saveProfile({ name: this.#initialProfileName });
    }
    if (this.#stopped) return;
    await this.#restoreGroups();
    if (this.#stopped) return;
    this.client.groups.on("unreadable", this.#onUnreadable);
    this.client.groups.on("updated", this.#onGroupsUpdated);
    this.#groupsConnection = this.client.groups.connectAll({
      fallbackRelays: this.relays,
    });
    this.#listenForInvites();
    try {
      await this.ensureKeyPackage();
    } catch (error) {
      this.notifyError(error);
    }
    if (this.#stopped) return;
    void this.refreshRelayLists();
  }

  /** Stop background work and release every group; the account cannot restart. */
  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#abort.abort();
    this.#subscriptions.unsubscribe();
    this.#groupsConnection?.unsubscribe();
    this.client.groups.off("unreadable", this.#onUnreadable);
    this.client.groups.off("updated", this.#onGroupsUpdated);
    for (const timeline of this.#timelines.values()) timeline.dispose();
    this.#timelines.clear();
    for (const group of this.client.groups.loaded) group.dispose();
    this.network.close();
    // Flush the in-memory audit buffer to its OPFS file so the log survives the
    // teardown; best-effort, never blocks stop().
    void this.#audit?.close();
  }

  async #restoreGroups(): Promise<void> {
    const groups = await this.client.groups.loadAll();
    if (this.#stopped) return;
    this.groupsRestored$.next(true);
    for (const group of groups) {
      if (this.#stopped) return;
      if (group.profileSupport.kind === "unsupported") {
        this.notify(
          `"${groupName(group)}" uses an older group profile. Recreate it to continue chatting.`,
        );
      } else if (group.status === "active") {
        void retryPendingChanges(group)
          .then(({ warnings }) => warnings.forEach((w) => this.notify(w)))
          .catch((error) => this.notifyError(error));
      }
    }
  }

  /** Re-subscribe to gift-wrapped invites whenever the inbox list changes. */
  #listenForInvites(): void {
    this.#subscriptions.add(
      this.inboxRelays$
        .pipe(
          map((relays) => relaySet(relays)),
          distinctUntilChanged((a, b) => a.join(",") === b.join(",")),
          switchMap(
            (relays) =>
              new Observable<never>(() => {
                let handle: Unsubscribable | undefined;
                let closed = false;
                this.client.invites.listen(relays).then(
                  (next) => {
                    if (closed) next.unsubscribe();
                    else handle = next;
                  },
                  (err) => console.error("[marmot] invite listen failed", err),
                );
                return () => {
                  closed = true;
                  handle?.unsubscribe();
                };
              }),
          ),
        )
        .subscribe(),
    );
  }

  // --- notices ---------------------------------------------------------------

  /**
   * Show a warning or error to the user.
   * @param text - Message to show.
   * @param level - Severity; defaults to a warning.
   */
  notify(text: string, level: StatusLine["level"] = "warn"): void {
    if (this.#stopped) return;
    if (level === "error") console.error("[marmot]", text);
    const line = { id: this.#noticeSeq++, level, text, at: Date.now() };
    this.notices$.next([
      ...this.notices$.value.slice(-(MAX_NOTICES - 1)),
      line,
    ]);
  }

  /**
   * Show a failed action's error to the user.
   * @param err - Thrown value.
   */
  notifyError(err: unknown): void {
    this.notify(err instanceof Error ? err.message : String(err), "error");
  }

  // --- history ---------------------------------------------------------------

  /**
   * The group's reactive local history window, created on first use.
   * @param group - A loaded group.
   * @returns The group's timeline; disposed when the group unloads or the account stops.
   */
  timeline(group: AppGroup): GroupTimeline {
    let timeline = this.#timelines.get(group);
    if (!timeline) {
      timeline = new GroupTimeline(group.history, {
        onError: (error) => this.notifyError(error),
      });
      if (!this.#stopped) this.#timelines.set(group, timeline);
    }
    return timeline;
  }

  // --- relay lists and profile -----------------------------------------------

  /** Load the account's relay lists when either is still unknown. */
  async refreshRelayLists(): Promise<void> {
    try {
      await this.#ensureRelayListsLoaded();
    } catch (err) {
      this.notifyError(err);
    }
  }

  /**
   * Publish both relay lists, announcing on the old and new outbox relays.
   * @param outbox - NIP-65 outbox relays.
   * @param inbox - Kind 10050 invite inbox relays.
   */
  async saveRelayLists(outbox: string[], inbox: string[]): Promise<void> {
    const nextOutbox = relaySet(outbox);
    const nextInbox = relaySet(inbox);
    if (!nextOutbox.length)
      throw new Error("outbox (NIP-65) list needs at least one valid relay");
    if (!nextInbox.length)
      throw new Error("inbox (kind 10050) list needs at least one valid relay");
    await publishRelayLists(
      this.#publisher,
      nextOutbox,
      nextInbox,
      relaySet(nextOutbox, this.outboxRelays$.value),
    );
    this.#relayListsAuthoritative = true;
    this.outboxRelays$.next(nextOutbox);
    this.inboxRelays$.next(nextInbox);
    await this.ensureKeyPackage();
  }

  /**
   * Merge fields into the account's kind 0 profile and publish it.
   * @param fields - Profile fields; blank values are removed.
   */
  async saveProfile(fields: ProfileContent): Promise<void> {
    await publishProfile(
      this.#publisher,
      await this.requirePublishRelays(),
      fields,
    );
  }

  /**
   * Outbox relays to publish public events to, discovering them if needed.
   * @returns At least one relay.
   */
  async requirePublishRelays(): Promise<string[]> {
    await this.#ensureRelayListsLoaded();
    const relays = relaySet(this.outboxRelays$.value);
    if (!relays.length)
      throw new Error(
        "no outbox relays configured — set your relays before publishing",
      );
    return relays;
  }

  /**
   * Relays for KeyPackage publication; both relay lists must be set so invitees can reply.
   * @returns The account's outbox relays.
   */
  async requireKeyPackageRelays(): Promise<string[]> {
    const relays = await this.requirePublishRelays();
    if (!this.inboxRelays$.value.length)
      throw new Error(
        "Set your invite inbox relays in Settings before publishing a key package",
      );
    return relays;
  }

  get #publisher(): IdentityPublisher {
    return {
      signer: this.signer,
      network: this.network,
      eventStore: this.eventStore,
      pubkey: this.pubkey,
    };
  }

  /** Retry incomplete discovery; share only the in-flight request. */
  async #ensureRelayListsLoaded(): Promise<void> {
    if (
      this.#fresh ||
      (this.outboxRelays$.value.length && this.inboxRelays$.value.length)
    )
      return;
    this.#relayListsPromise ??= this.#loadRelayLists().finally(() => {
      this.#relayListsPromise = undefined;
    });
    await this.#relayListsPromise;
  }

  async #loadRelayLists(): Promise<void> {
    const hints = relaySet(this.relays, this.#lookupRelays());
    const [outbox, inbox] = await Promise.all([
      this.directory.outboxes(this.pubkey, hints),
      this.directory.welcomeInboxes(this.pubkey, hints),
    ]);
    if (this.#stopped || this.#relayListsAuthoritative) return;
    if (outbox.length) this.outboxRelays$.next(outbox);
    if (inbox.length) this.inboxRelays$.next(inbox);
  }

  // --- key packages ----------------------------------------------------------

  /**
   * Publish this browser's KeyPackage when missing, then retire packages left
   * under pre-0.7 device-label slots.
   */
  async ensureKeyPackage(): Promise<void> {
    if (!(await hasDeviceKeyPackage(this.client, this.clientId))) {
      if (this.#stopped) return;
      await this.#ensureRelayListsLoaded();
      if (this.#stopped) return;
      if (!this.outboxRelays$.value.length || !this.inboxRelays$.value.length) {
        this.notify(
          "Set both outbox and invite inbox relays in Settings so others can invite you",
        );
        return;
      }
      await ensureDeviceKeyPackage(
        this.client,
        this.clientId,
        this.outboxRelays$.value,
      );
    }
    if (this.#stopped) return;
    const { warnings } = await retireLegacySlotKeyPackages(this.client);
    warnings.forEach((warning) => this.notify(warning));
  }

  // --- audit -----------------------------------------------------------------

  /** True when an audit log is being recorded *and* an upload target is set. */
  get canUploadAudit(): boolean {
    return Boolean(this.#audit && this.#auditUpload);
  }

  /**
   * Upload this device's audit JSONL to the configured Goggles tracker.
   * @returns Bytes sent and the tracker's HTTP status.
   */
  async uploadAuditLog(): Promise<{ bytesSent: number; status: number }> {
    const audit = this.#audit;
    const upload = this.#auditUpload;
    if (!audit || !upload) throw new Error("audit upload is not configured");
    return uploadAuditLog(audit.readNdjson(), upload.endpoint, {
      bearerToken: upload.bearerToken,
      source: upload.source,
    });
  }
}

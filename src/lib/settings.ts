import { relaySet } from "applesauce-core/helpers";
import { BehaviorSubject } from "rxjs";

import { DEFAULT_GOGGLES_ENDPOINT } from "./marmot/audit";

/** Persist a BehaviorSubject to localStorage under `key`. */
export function persist<T>(key: string, subject: BehaviorSubject<T>) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) subject.next(JSON.parse(raw));
  } catch {}
  subject.subscribe((value) => {
    localStorage.setItem(key, JSON.stringify(value));
  });
}

/** Public NIP-65 indexers used to discover other users' relay lists/profiles. */
const DEFAULT_LOOKUP_RELAYS = [
  "wss://relay.us.whitenoise.chat",
  "wss://relay.eu.whitenoise.chat",
  "wss://purplepag.es",
  "wss://index.hzrd149.com",
];

/** General-purpose relays used to bootstrap discovery. */
const DEFAULT_EXTRA_RELAYS = relaySet([
  "wss://relay.damus.io",
  "wss://nos.lol",
]);

/** The default relay a freshly-created account adopts as its outbox + inbox. */
export const DEFAULT_NEW_ACCOUNT_RELAY = "wss://relay.us.whitenoise.chat";

export const extraRelays$ = new BehaviorSubject<string[]>(DEFAULT_EXTRA_RELAYS);
persist("extra-relays", extraRelays$);

export const lookupRelays$ = new BehaviorSubject<string[]>(
  DEFAULT_LOOKUP_RELAYS,
);
persist("lookup-relays", lookupRelays$);

/** Automatically publish a key package on startup if none exists. */
export const autoCreateKeyPackage$ = new BehaviorSubject<boolean>(true);
persist("auto-create-key-package", autoCreateKeyPackage$);

/**
 * Developer debug mode. When enabled, the marmot engine is configured to retain
 * and process *everything* — the full per-group fork-history tree is persisted
 * (so it survives reloads) and undecryptable events are kept indefinitely for
 * retry — and each group exposes a debug view (fork graph + pending events).
 * Off by default; like the audit toggle it takes effect the next time a
 * controller starts (sign in / reload), because the retention config is wired
 * into the marmot client at construction.
 */
export const debugMode$ = new BehaviorSubject<boolean>(false);
persist("debug-mode", debugMode$);

/**
 * Opt-in forensic audit logging. When enabled, the controller records a
 * MLS/transport audit JSONL for the active account (off by default). Toggling
 * takes effect the next time a controller starts (sign in / reload), because the
 * audit sink is wired into the marmot client at construction.
 */
export const auditEnabled$ = new BehaviorSubject<boolean>(false);
persist("audit-enabled", auditEnabled$);

/** Goggles tracker the audit log uploads to. */
export const auditUploadEndpoint$ = new BehaviorSubject<string>(
  DEFAULT_GOGGLES_ENDPOINT,
);
persist("audit-upload-endpoint", auditUploadEndpoint$);

/** Bearer token for the tracker (required for non-loopback endpoints). */
export const auditUploadToken$ = new BehaviorSubject<string>("");
persist("audit-upload-token", auditUploadToken$);

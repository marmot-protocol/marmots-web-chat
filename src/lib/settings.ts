import { relaySet } from "applesauce-core/helpers";
import { BehaviorSubject, combineLatest, map } from "rxjs";

// save and load settings from localStorage
export function persist<T>(key: string, subject: BehaviorSubject<T>) {
  try {
    if (localStorage.getItem(key))
      subject.next(JSON.parse(localStorage.getItem(key)!));
  } catch {}
  subject.subscribe((value) => {
    localStorage.setItem(key, JSON.stringify(value));
  });
}

// Default relay configurations
const DEFAULT_LOOKUP_RELAYS = [
  "wss://purplepag.es/",
  "wss://index.hzrd149.com/",
];

const DEFAULT_EXTRA_RELAYS = relaySet([
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://nostr.wine",
  "wss://relay.snort.social",
]);

export const extraRelays$ = new BehaviorSubject<string[]>(DEFAULT_EXTRA_RELAYS);
persist("extra-relays", extraRelays$);

export const lookupRelays$ = new BehaviorSubject<string[]>(
  DEFAULT_LOOKUP_RELAYS,
);
persist("lookup-relays", lookupRelays$);

// Manual relays (empty by default, can be extended in the future)
export const manualRelays$ = new BehaviorSubject<string[]>([]);

// Tabs that are pinned under the app switcher
export const pinnedTabs$ = new BehaviorSubject<string[]>([
  "/groups",
  "/invites",
  "/contacts",
]);
persist("pinned-tabs", pinnedTabs$);

// Combined relay configuration observable
export const relayConfig$ = combineLatest([
  lookupRelays$,
  extraRelays$,
  manualRelays$,
]).pipe(
  map(([lookupRelays, extraRelays, manualRelays]) => ({
    lookupRelays,
    extraRelays,
    manualRelays,
    // Keep commonRelays for backward compatibility during transition
    commonRelays: extraRelays,
  })),
);

/** Whether to automatically create a key package if none exists for the user */
export const autoCreateKeyPackage$ = new BehaviorSubject<boolean>(false);
persist("auto-create-key-package", autoCreateKeyPackage$);

// ─── Blossom media upload settings ───────────────────────────────────────────

/** Blossom server URLs to try when uploading encrypted media (MIP-04) */
export const blossomServers$ = new BehaviorSubject<string[]>([
  "https://blossom.primal.net",
]);
persist("blossom-servers", blossomServers$);

/**
 * How to sign Blossom upload auth events (kind 24242).
 *
 * - `"account"` — sign with the user's active Nostr account (identity visible to server)
 * - `"ephemeral"` — generate a fresh random keypair per upload (anonymous to server)
 */
export type BlossomSigningMode = "account" | "ephemeral";

export const blossomSigningMode$ = new BehaviorSubject<BlossomSigningMode>(
  "ephemeral",
);
persist("blossom-signing-mode", blossomSigningMode$);

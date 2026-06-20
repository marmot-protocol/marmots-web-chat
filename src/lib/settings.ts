import { relaySet } from "applesauce-core/helpers";
import { BehaviorSubject } from "rxjs";

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

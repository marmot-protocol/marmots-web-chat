/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base path for the app router (e.g. "/chat") */
  readonly VITE_BASE_PATH?: string;
  /**
   * MIP-05 notification server Nostr public key (hex or npub).
   * When set, the app will fetch the server's kind:10050 event to resolve
   * the full notification server configuration (relays, VAPID key) and
   * enable the push notification toggle in each group's Notifications tab.
   */
  readonly VITE_NOTIFICATION_SERVER_PUBKEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

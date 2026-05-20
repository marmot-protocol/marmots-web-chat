import {
  ADDRESSABLE_KEY_PACKAGE_KIND,
  KEY_PACKAGE_KIND,
} from "@internet-privacy/marmot-ts";

/** Nostr event kinds supported by marmot-ts for key package discovery. */
export const KEY_PACKAGE_EVENT_KINDS: number[] = [
  KEY_PACKAGE_KIND,
  ADDRESSABLE_KEY_PACKAGE_KIND,
];

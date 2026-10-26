import { bytesToHex } from "applesauce-core/helpers/event";
import { validateKeyPackageSlot } from "@internet-privacy/marmot-ts";
import type { ListedKeyPackage } from "@internet-privacy/marmot-ts/client";

const SLOT_STORAGE_KEY = "marmot-key-package-slot";

/**
 * This browser profile's KeyPackage publication slot (`d` tag / `clientId`):
 * 32 random bytes as lowercase hex, generated once and persisted so devices
 * sharing an account do not replace each other's packages.
 * @returns The stable 64-character hex slot.
 */
export function getKeyPackageSlot(): string {
  let slot: string | null = null;
  try {
    slot = localStorage.getItem(SLOT_STORAGE_KEY);
  } catch {}
  if (slot) {
    try {
      validateKeyPackageSlot(slot);
      return slot;
    } catch {}
  }

  slot = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  try {
    localStorage.setItem(SLOT_STORAGE_KEY, slot);
  } catch {}
  return slot;
}

/**
 * Whether a stored package was published under a pre-0.7 device-label slot
 * (e.g. `marmot-web-…`) rather than a random 64-hex slot.
 * @param pkg - Locally stored KeyPackage.
 * @returns `true` when the package's slot no longer meets the spec.
 */
export function hasLegacySlot(pkg: ListedKeyPackage): boolean {
  if (pkg.identifier === undefined) return false;
  try {
    validateKeyPackageSlot(pkg.identifier);
    return false;
  } catch {
    return true;
  }
}

/**
 * Whether a stored package can no longer be used for new invites: it carries
 * an older identity proof, or was published under a pre-0.7 device-label slot.
 * @param pkg - Locally stored KeyPackage.
 * @returns `true` when the package should be retired.
 */
export function isLegacyKeyPackage(pkg: ListedKeyPackage): boolean {
  return !!pkg.nonCurrent || hasLegacySlot(pkg);
}

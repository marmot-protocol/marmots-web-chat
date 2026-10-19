import type { ListedKeyPackage } from "@internet-privacy/marmot-ts/client";

const SLOT_STORAGE_KEY = "marmot-key-package-slot";
const SLOT_PATTERN = /^[0-9a-f]{64}$/;

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
  if (slot && SLOT_PATTERN.test(slot)) return slot;

  slot = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
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
  return pkg.identifier !== undefined && !SLOT_PATTERN.test(pkg.identifier);
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

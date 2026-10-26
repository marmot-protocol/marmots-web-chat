import { bytesToHex, type NostrEvent } from "applesauce-core/helpers/event";
import {
  getAppComponents,
  GROUP_ENCRYPTED_MEDIA_V2_COMPONENT_ID,
} from "@internet-privacy/marmot-ts";
import type { ListedKeyPackage } from "@internet-privacy/marmot-ts/client";
import {
  isDefaultExtension,
  type CustomExtension,
} from "@internet-privacy/marmot-ts/mls";

import { isLegacyKeyPackage } from "@/lib/marmot/key-package-slot";
import type { KeyPackageSummary } from "@/lib/marmot/types";

/**
 * Check signed media capabilities and a durable publication in this device's slot.
 * @param pkg - A library-listed KeyPackage.
 * @param slot - This browser's persistent publication identifier.
 * @returns Whether this device already has a published media-v2 package.
 */
export function isCurrentDevicePackage(
  pkg: ListedKeyPackage,
  slot: string,
): boolean {
  if (
    pkg.used ||
    isLegacyKeyPackage(pkg) ||
    pkg.identifier !== slot ||
    !pkg.published?.length
  )
    return false;
  try {
    return (
      getAppComponents(
        pkg.publicPackage.leafNode.extensions.filter(
          (extension): extension is CustomExtension =>
            !isDefaultExtension(extension),
        ),
      )?.includes(GROUP_ENCRYPTED_MEDIA_V2_COMPONENT_ID) ?? false
    );
  } catch {
    return false;
  }
}

/**
 * Short reference used only in UI status messages.
 * @param value - Binary KeyPackage reference.
 * @returns The first four bytes encoded as hex.
 */
export function shortHex(value: Uint8Array): string {
  return bytesToHex(value.subarray(0, 4));
}

/**
 * Select a usable package, preferring this device's published media-v2 bundle.
 * @param packages - The library's current list.
 * @param slot - This browser's publication identifier.
 * @returns The preferred package, or undefined when the list is empty.
 */
export function selectDeviceKeyPackage(
  packages: ListedKeyPackage[],
  slot: string,
): ListedKeyPackage | undefined {
  return (
    packages.find((pkg) => isCurrentDevicePackage(pkg, slot)) ??
    packages.find(
      (pkg) => !pkg.used && !isLegacyKeyPackage(pkg) && pkg.identifier === slot,
    ) ??
    packages.find((pkg) => !pkg.used && !isLegacyKeyPackage(pkg)) ??
    packages[0]
  );
}

/**
 * Derive display-only counts and publication information from the library's list.
 * @param packages - The library's current list.
 * @param slot - This browser's publication identifier.
 * @returns A UI summary; protocol state remains in the library.
 */
export function summarizeKeyPackages(
  packages: ListedKeyPackage[],
  slot: string,
): KeyPackageSummary {
  const current = selectDeviceKeyPackage(packages, slot);
  const newestPublished = packages
    .flatMap((pkg) => pkg.published ?? [])
    .reduce<NostrEvent | null>(
      (newest, event) =>
        !newest || event.created_at > newest.created_at ? event : newest,
      null,
    );
  return {
    total: packages.length,
    unused: packages.filter((pkg) => !pkg.used && !isLegacyKeyPackage(pkg))
      .length,
    legacy: packages.filter(isLegacyKeyPackage).length,
    slot: current?.identifier ?? null,
    newestPublishedAt: newestPublished?.created_at ?? null,
    newestPublishedId: newestPublished?.id ?? null,
    currentRefHex: current ? shortHex(current.keyPackageRef) : null,
  };
}

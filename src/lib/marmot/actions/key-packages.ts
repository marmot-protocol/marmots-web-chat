import { relaySet } from "applesauce-core/helpers/relays";
import type { ListedKeyPackage } from "@internet-privacy/marmot-ts/client";

import {
  isCurrentDevicePackage,
  selectDeviceKeyPackage,
} from "@/lib/marmot/key-packages";
import {
  hasLegacySlot,
  isLegacyKeyPackage,
} from "@/lib/marmot/key-package-slot";
import type { AppMarmotClient } from "@/lib/marmot/types";

/**
 * Make sure this device has a published media-v2 KeyPackage in its own slot.
 *
 * marmot-ts gap: `ensurePublished()` may select another locally stored slot and
 * returns a summary without publication events, so the durable list is checked
 * before deciding whether this browser still needs a publication.
 * @param client - The account's Marmot client.
 * @param clientId - This browser's slot (`d` tag).
 * @param relays - Outbox relays to publish to.
 * @returns Whether a new KeyPackage was published.
 */
export async function ensureDeviceKeyPackage(
  client: AppMarmotClient,
  clientId: string,
  relays: string[],
): Promise<boolean> {
  const has = (packages: ListedKeyPackage[]) =>
    packages.some((pkg) => isCurrentDevicePackage(pkg, clientId));
  if (has(await client.keyPackages.list())) return false;
  const options = { relays: relaySet(relays), identifier: clientId };
  await client.keyPackages.ensurePublished(options);
  if (!has(await client.keyPackages.list()))
    await client.keyPackages.create(options);
  return true;
}

/**
 * Whether this device already has a published current KeyPackage.
 * @param client - The account's Marmot client.
 * @param clientId - This browser's slot.
 * @returns True when no publication is needed.
 */
export async function hasDeviceKeyPackage(
  client: AppMarmotClient,
  clientId: string,
): Promise<boolean> {
  return (await client.keyPackages.list()).some((pkg) =>
    isCurrentDevicePackage(pkg, clientId),
  );
}

/**
 * Delete packages left under pre-0.7 device-label slots. Each is purged on its
 * own so one without stored relay routes stays listed for manual retirement.
 * @param client - The account's Marmot client.
 * @returns How many were retired, and a warning per failure.
 */
export async function retireLegacySlotKeyPackages(
  client: AppMarmotClient,
): Promise<{ retired: number; warnings: string[] }> {
  const legacy = (await client.keyPackages.list()).filter(
    (pkg) => hasLegacySlot(pkg) && !pkg.nonCurrent,
  );
  let retired = 0;
  const warnings: string[] = [];
  for (const pkg of legacy) {
    try {
      await client.keyPackages.purge(pkg.keyPackageRef);
      retired++;
    } catch (err) {
      warnings.push(
        `could not retire KeyPackage under old slot ${pkg.identifier}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return { retired, warnings };
}

/**
 * Retire all legacy packages, only after a current package for this slot exists.
 * @param client - The account's Marmot client.
 * @param clientId - This browser's slot.
 * @returns How many packages were retired.
 */
export async function purgeLegacyKeyPackages(
  client: AppMarmotClient,
  clientId: string,
): Promise<number> {
  const packages = await client.keyPackages.list();
  if (
    !packages.some(
      (pkg) =>
        !pkg.used && !isLegacyKeyPackage(pkg) && pkg.identifier === clientId,
    )
  )
    throw new Error(
      "Publish a current key package before retiring legacy packages",
    );
  const legacy = packages.filter(isLegacyKeyPackage);
  if (legacy.length)
    await client.keyPackages.purge(legacy.map((pkg) => pkg.keyPackageRef));
  return legacy.length;
}

/**
 * Rotate this device's preferred package, pinning the slot so a legacy
 * device-label package migrates to it.
 * @param client - The account's Marmot client.
 * @param clientId - This browser's slot.
 * @param relays - Outbox relays to publish to.
 * @returns The replaced and new packages.
 */
export async function rotateDeviceKeyPackage(
  client: AppMarmotClient,
  clientId: string,
  relays: string[],
): Promise<{ previous: ListedKeyPackage; rotated: ListedKeyPackage }> {
  const previous = selectDeviceKeyPackage(
    await client.keyPackages.list(),
    clientId,
  );
  if (!previous) throw new Error("no KeyPackage to rotate");
  const rotated = await client.keyPackages.rotate(previous.keyPackageRef, {
    relays,
    d: clientId,
  });
  return { previous, rotated };
}

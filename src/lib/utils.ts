import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns a short fingerprint of a cryptographic key for debug logging.
 * Shows first 16 hex chars of SHA-256(key) — enough to detect mismatches
 * without exposing the full key.
 */
export function keyFingerprint(key: Uint8Array): string {
  return bytesToHex(sha256(key)).slice(0, 16);
}

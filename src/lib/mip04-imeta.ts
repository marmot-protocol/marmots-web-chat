import { getFileMetadataFromImetaTag } from "applesauce-common/helpers";
import type { Mip04MediaAttachment } from "@internet-privacy/marmots";
import { MIP04_VERSION } from "@internet-privacy/marmots";

/**
 * Splits the space-separated entries of an `imeta` tag into a key→value map.
 *
 * Each entry after the leading `"imeta"` element has the form `"key value"`.
 * applesauce uses the same regex internally; we replicate it here so we can
 * extract fields that applesauce does not know about (and therefore strips from
 * its returned {@link FileMetadata} object).
 */
function parseRawImetaEntries(tag: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of tag.slice(1)) {
    const match = part.match(/^(.+?)\s(.+)$/);
    if (match) map.set(match[1], match[2]);
  }
  return map;
}

/**
 * Parses an `imeta` tag array into a {@link Mip04MediaAttachment}, correctly
 * handling the MIP-04-specific fields (`filename`, `n`, `v`) by reading them
 * directly from the raw tag entries.
 *
 * applesauce's {@link getFileMetadataFromImetaTag} only copies known NIP-92
 * fields onto its return value — unknown keys are silently dropped. We
 * therefore parse the raw tag ourselves for the MIP-04 fields and delegate
 * only the standard fields to applesauce.
 *
 * Returns `null` if:
 * - The tag is not a valid `imeta` tag
 * - The `v` field is absent or does not match the current MIP-04 version
 * - The required `n` (nonce) or `filename` fields are missing
 *
 * Clients MUST reject deprecated `mip04-v1` tags per the MIP-04 spec.
 *
 * @param tag - A raw `imeta` tag array from a Nostr event (e.g. `rumor.tags`)
 * @returns A fully-typed {@link Mip04MediaAttachment}, or `null` if the tag is
 *   not a valid MIP-04 v2 attachment
 */
export function parseMip04ImetaTag(tag: string[]): Mip04MediaAttachment | null {
  if (tag[0] !== "imeta") return null;

  // Parse the raw entries directly so we can read MIP-04 fields that
  // applesauce drops when building its FileMetadata return value.
  const raw = parseRawImetaEntries(tag);

  // Validate MIP-04-specific fields first — bail early if this isn't a
  // MIP-04 v2 attachment.
  const version = raw.get("v");
  const nonce = raw.get("n");
  const filename = raw.get("filename");

  if (version !== MIP04_VERSION) return null;
  if (!nonce || nonce.length === 0) return null;
  if (!filename || filename.length === 0) return null;

  // Delegate standard NIP-92 field parsing to applesauce (url, type/m,
  // sha256/x, size, dimensions/dim, blurhash, thumbnail/thumb, alt, etc.)
  const base = getFileMetadataFromImetaTag(tag);

  return {
    ...base,
    // MIP-04-specific fields sourced directly from the raw tag
    filename,
    nonce,
    version: MIP04_VERSION,
  };
}

/**
 * Extracts all valid MIP-04 v2 attachments from a rumor's tag list.
 * Non-imeta tags and imeta tags that fail MIP-04 validation are silently
 * skipped.
 */
export function getMip04Attachments(tags: string[][]): Mip04MediaAttachment[] {
  return tags
    .filter((t) => t[0] === "imeta")
    .map(parseMip04ImetaTag)
    .filter((a): a is Mip04MediaAttachment => a !== null);
}

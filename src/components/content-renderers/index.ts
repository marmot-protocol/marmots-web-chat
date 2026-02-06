import type { ComponentMap } from "applesauce-react/helpers";

import { TextRenderer } from "./text";
import { LinkRenderer } from "./link";
import { HashtagRenderer } from "./hashtag";
import { EmojiRenderer } from "./emoji";
import { MentionRenderer } from "./mention";
import { GalleryRenderer } from "./gallery";

/**
 * Default component map for rendering Nostr content
 *
 * Supports:
 * - Plain text
 * - Links (with smart media detection for images/videos)
 * - Hashtags
 * - Custom emojis
 * - Nostr mentions (npub, nevent, etc.)
 * - Image galleries
 *
 * Usage:
 * ```tsx
 * import { defaultContentComponents } from "@/components/content-renderers";
 * import { useRenderedContent } from "applesauce-react/hooks";
 *
 * function MyComponent({ event }) {
 *   const content = useRenderedContent(event, defaultContentComponents);
 *   return <div>{content}</div>;
 * }
 * ```
 */
export const defaultContentComponents: ComponentMap = {
  text: TextRenderer,
  link: LinkRenderer,
  hashtag: HashtagRenderer,
  emoji: EmojiRenderer,
  mention: MentionRenderer,
  gallery: GalleryRenderer,
};

// Export individual renderers for custom component maps
export { TextRenderer } from "./text";
export { LinkRenderer } from "./link";
export { HashtagRenderer } from "./hashtag";
export { EmojiRenderer } from "./emoji";
export { MentionRenderer } from "./mention";
export { GalleryRenderer } from "./gallery";

// Export sub-components for mention rendering
export { UserMention } from "./user-mention";
export { EventCard } from "./event-card";

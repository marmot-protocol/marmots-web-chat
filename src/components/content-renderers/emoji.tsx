import type { Emoji } from "applesauce-content/nast";

/**
 * Renders custom Nostr emojis
 */
export const EmojiRenderer = ({ node }: { node: Emoji }) => (
  <img
    src={node.url}
    alt={node.code}
    className="inline w-5 h-5 align-text-bottom"
  />
);

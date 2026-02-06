import type { Hashtag } from "applesauce-content/nast";

/**
 * Renders hashtags with styling
 */
export const HashtagRenderer = ({ node }: { node: Hashtag }) => (
  <span className="text-orange-500">#{node.hashtag}</span>
);

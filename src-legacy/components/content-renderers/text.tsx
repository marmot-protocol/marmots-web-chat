import type { Text } from "applesauce-content/nast";

/**
 * Renders plain text nodes
 */
export const TextRenderer = ({ node }: { node: Text }) => (
  <span>{node.value}</span>
);

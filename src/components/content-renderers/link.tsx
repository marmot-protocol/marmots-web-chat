import { isImageURL, isVideoURL } from "applesauce-core/helpers";
import type { Link } from "applesauce-content/nast";

/**
 * Renders links with smart media detection
 * - Images are rendered inline
 * - Videos are rendered with controls
 * - Regular links open in new tab
 */
export const LinkRenderer = ({ node }: { node: Link }) => {
  // Render images inline
  if (isImageURL(node.href)) {
    return (
      <img
        src={node.href}
        alt="Shared image"
        className="max-w-full max-h-96 rounded mt-2 mb-1"
        loading="lazy"
        onError={(e) => {
          // Fallback to link if image fails to load
          e.currentTarget.replaceWith(
            Object.assign(document.createElement("a"), {
              href: node.href,
              textContent: node.value,
              target: "_blank",
              rel: "noopener noreferrer",
              className: "text-blue-500 hover:underline break-all",
            }),
          );
        }}
      />
    );
  }

  // Render videos inline
  if (isVideoURL(node.href)) {
    return (
      <video
        src={node.href}
        controls
        className="max-w-full max-h-96 rounded mt-2 mb-1"
        onError={(e) => {
          // Fallback to link if video fails to load
          e.currentTarget.replaceWith(
            Object.assign(document.createElement("a"), {
              href: node.href,
              textContent: node.value,
              target: "_blank",
              rel: "noopener noreferrer",
              className: "text-blue-500 hover:underline break-all",
            }),
          );
        }}
      />
    );
  }

  // Regular links
  return (
    <a
      href={node.href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-500 hover:underline break-all"
    >
      {node.value}
    </a>
  );
};

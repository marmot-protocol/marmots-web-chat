import type { Gallery } from "applesauce-content/nast";

/**
 * Renders image galleries (consecutive images grouped together)
 */
export const GalleryRenderer = ({ node }: { node: Gallery }) => (
  <div className="flex flex-wrap gap-2 mt-2 mb-1">
    {node.links.map((link: string, i: number) => (
      <img
        key={i}
        src={link}
        alt={`Gallery image ${i + 1}`}
        className="max-h-64 rounded"
        loading="lazy"
      />
    ))}
  </div>
);

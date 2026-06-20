import { qrcode } from "@libs/qrcode";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

/**
 * Renders `data` as a scannable QR code (SVG, embedded as a data URI).
 *
 * Sizing is driven entirely by `className` (default: fill the container).
 * `aspect-square` keeps it square, so a width constraint like
 * `w-[min(280px,70vw,55dvh)]` makes it responsive without overflowing.
 */
export function QRImage({
  data,
  className,
}: {
  data: string;
  className?: string;
}) {
  const src = useMemo(() => {
    const svg = qrcode(data, { output: "svg" });
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }, [data]);

  return (
    <img
      src={src}
      alt="QR code"
      className={cn("aspect-square w-full rounded-lg bg-white p-3", className)}
    />
  );
}

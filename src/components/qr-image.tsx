import { qrcode } from "@libs/qrcode";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

/** Renders `data` as a scannable QR code (SVG, embedded as a data URI). */
export function QRImage({
  data,
  size = 256,
  className,
}: {
  data: string;
  size?: number;
  className?: string;
}) {
  const src = useMemo(() => {
    const svg = qrcode(data, { output: "svg" });
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }, [data]);

  // Scale to the container width (responsive on small screens) but never exceed
  // `size`. The QR SVG is square, so `aspect-square` keeps it square.
  return (
    <img
      src={src}
      alt="QR code"
      className={cn("h-auto w-full aspect-square rounded-lg bg-white p-3", className)}
      style={{ maxWidth: size }}
    />
  );
}

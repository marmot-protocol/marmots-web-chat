import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { extendedExtensionTypes } from "@internet-privacy/marmot-ts";
import { greaseValues } from "ts-mls";

interface ExtensionBadgeProps {
  extensionType: number;
  className?: string;
}

/**
 * A badge component that displays an extension type ID with a tooltip showing its name
 */
export default function ExtensionBadge({
  extensionType,
  className,
}: ExtensionBadgeProps) {
  // Convert to number if needed
  const extensionTypeId =
    typeof extensionType === "number"
      ? extensionType
      : extendedExtensionTypes[extensionType];

  const isGrease = (greaseValues as readonly number[]).includes(
    extensionTypeId,
  );

  // Find the extension name from the extendedExtensionTypes map
  const extensionName =
    Object.entries(extendedExtensionTypes).find(
      ([_, value]) => value === extensionTypeId,
    )?.[0] ?? (isGrease ? "GREASE" : "Unknown");

  // Format the hex ID with 0x prefix
  const hexId = `0x${extensionTypeId.toString(16).padStart(4, "0")}`;

  return (
    <Badge
      variant="outline"
      className={cn("font-mono whitespace-pre", className)}
    >
      {extensionName} ({hexId})
    </Badge>
  );
}

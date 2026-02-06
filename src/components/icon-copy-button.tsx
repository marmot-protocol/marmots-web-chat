import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface IconCopyButtonProps extends Omit<
  ComponentProps<typeof Button>,
  "onClick"
> {
  /** The text to copy to clipboard */
  text: string;
  /** Duration in ms to show the check icon (default: 2000) */
  duration?: number;
}

/**
 * IconCopyButton - An icon button that copies text to clipboard and shows a checkmark when copied
 *
 * Handles its own state for showing a temporary checkmark after copying.
 *
 * @example
 * ```tsx
 * <IconCopyButton text="npub1..." variant="outline" size="icon" />
 * ```
 */
export function IconCopyButton({
  text,
  duration = 2000,
  className,
  ...props
}: IconCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), duration);
  };

  return (
    <Button onClick={handleCopy} className={cn(className)} {...props}>
      {copied ? (
        <CheckIcon className="h-4 w-4 text-green-600" />
      ) : (
        <CopyIcon className="h-4 w-4" />
      )}
    </Button>
  );
}

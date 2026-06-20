import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyButtonProps extends Omit<
  ComponentProps<typeof Button>,
  "onClick"
> {
  text: string;
}

/**
 * CopyButton - A button that copies text to clipboard and shows a checkmark when copied
 *
 * @example
 * ```tsx
 * <CopyButton text="Hello World" variant="outline" size="icon" />
 * ```
 */
export function CopyButton({ text, className, ...props }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

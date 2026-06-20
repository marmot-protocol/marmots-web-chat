import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CopyButton } from "@/components/copy-button";
import { QRImage } from "@/components/qr-image";

/**
 * Shows the account's npub as a scannable QR code. Other Marmot/Nostr apps can
 * scan it to discover this account (and its published key package) and send an
 * invite.
 */
export function MyQrDialog({
  npub,
  open,
  onOpenChange,
}: {
  npub: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Scan to invite me</DialogTitle>
          <DialogDescription>
            Other apps can scan this to invite you to a group.
          </DialogDescription>
        </DialogHeader>
        <div className="flex w-full min-w-0 flex-col items-center gap-4">
          {/* Cap by both width and height so the code never overflows a small
              or short (landscape) screen. */}
          <QRImage
            data={npub}
            className="w-[min(280px,70vw,55dvh)]"
          />
          <div className="flex w-full items-center gap-2 rounded-md bg-muted p-2">
            <code className="min-w-0 flex-1 truncate text-xs">{npub}</code>
            <CopyButton text={npub} variant="ghost" size="icon" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { Button } from "./ui/button";
import QRModal from "./qr-modal";
import { QrCodeIcon } from "lucide-react";

interface QRButtonProps {
  data: string;
  label?: string;
  className?: string;
  variant?:
    | "default"
    | "outline"
    | "ghost"
    | "secondary"
    | "destructive"
    | "link";
  size?:
    | "default"
    | "xs"
    | "sm"
    | "lg"
    | "icon"
    | "icon-xs"
    | "icon-sm"
    | "icon-lg";
  modalSize?: number;
}

export default function QRButton({
  data,
  label = "QR",
  className = "",
  variant = "ghost",
  size = "sm",
  modalSize = 500,
}: QRButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
        type="button"
      >
        {label}
      </Button>
      <QRModal
        data={data}
        open={open}
        onOpenChange={setOpen}
        modalSize={modalSize}
      />
    </>
  );
}

export function QRIconButton({
  data,
  className = "",
  variant = "ghost",
  size = "icon",
  modalSize = 500,
}: Omit<QRButtonProps, "label">) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
        type="button"
      >
        <QrCodeIcon />
      </Button>
      <QRModal
        data={data}
        open={open}
        onOpenChange={setOpen}
        modalSize={modalSize}
      />
    </>
  );
}

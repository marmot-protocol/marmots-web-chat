import { bytesToHex } from "@noble/hashes/utils.js";
import { AlertCircle, Download, Info } from "lucide-react";
import type { StoredKeyPackage } from "marmot-ts";
import { useMemo, useState } from "react";
import { encodeKeyPackage } from "ts-mls/keyPackage.js";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// ============================================================================
// Types
// ============================================================================

/** A key package that is not stored locally but read from an event */
type RemoteKeyPackage = Omit<StoredKeyPackage, "privatePackage"> & {
  privatePackage: null;
};

// ============================================================================
// Props Interface
// ============================================================================

interface ExportKeyPackageModalProps {
  /** The key package to export */
  keyPackage: StoredKeyPackage | RemoteKeyPackage;
  /** Control modal visibility */
  open: boolean;
  /** Callback when modal closes */
  onClose: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Download a text file with the given content and filename
 */
function downloadJsonFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Encode a key package to JSON with hex-encoded fields
 */
function encodeKeyPackageToJson(keyPackage: StoredKeyPackage): string {
  // Encode public key package
  const publicHex = bytesToHex(encodeKeyPackage(keyPackage.publicPackage));

  // Encode private key package fields
  const privateData = {
    initPrivateKey: bytesToHex(keyPackage.privatePackage.initPrivateKey),
    hpkePrivateKey: bytesToHex(keyPackage.privatePackage.hpkePrivateKey),
    signaturePrivateKey: bytesToHex(
      keyPackage.privatePackage.signaturePrivateKey,
    ),
  };

  // Create export data structure
  const exportData = {
    keyPackageRef: bytesToHex(keyPackage.keyPackageRef),
    public: publicHex,
    private: privateData,
  };

  // Return pretty-printed JSON
  return JSON.stringify(exportData, null, 2);
}

// ============================================================================
// Main Component
// ============================================================================

export default function ExportKeyPackageModal({
  keyPackage,
  open,
  onClose,
}: ExportKeyPackageModalProps) {
  const [showContent, setShowContent] = useState(false);

  // Check if this key package has private key material
  const hasPrivateKey = keyPackage.privatePackage !== null;

  // Encode the key package to JSON (only when needed)
  const encodedJson = useMemo(() => {
    if (!showContent || !hasPrivateKey) return "";
    try {
      return encodeKeyPackageToJson(keyPackage as StoredKeyPackage);
    } catch (error) {
      console.error("Failed to encode key package:", error);
      return "";
    }
  }, [keyPackage, showContent, hasPrivateKey]);

  // Generate filename from key package ref
  const filename = useMemo(
    () => `${bytesToHex(keyPackage.keyPackageRef)}.json`,
    [keyPackage.keyPackageRef],
  );

  // Handle download button click
  const handleDownload = () => {
    if (!encodedJson) return;
    downloadJsonFile(encodedJson, filename);
  };

  // Reset state when modal closes
  const handleClose = () => {
    setShowContent(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent showCloseButton className="w-full max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export Key Package</DialogTitle>
        </DialogHeader>

        {!hasPrivateKey ? (
          // No private key available
          <div className="space-y-4 py-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Private Key Not Available</AlertTitle>
              <AlertDescription>
                This key package is published on relays but not stored locally.
                Private key material is not available for export.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                You can only export key packages that are stored locally with
                their private key material. This key package only contains
                public information.
              </p>
            </div>

            <Alert>
              <AlertDescription className="text-xs">
                To export a key package with private keys, you need to have
                created it on this device or imported it from a backup.
              </AlertDescription>
            </Alert>
          </div>
        ) : !showContent ? (
          // Step 1: Security Warning
          <div className="space-y-4 py-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Security Warning</AlertTitle>
              <AlertDescription>
                Exporting this key package will expose private key material in
                plain text. This data should be handled with extreme care and
                stored securely.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                The exported JSON file will contain:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground pl-2">
                <li>Key package reference (identifier)</li>
                <li>Public key package data (hex-encoded)</li>
                <li>Private signing key (hex-encoded)</li>
                <li>Private HPKE keys (hex-encoded)</li>
              </ul>
            </div>

            <Alert>
              <AlertDescription className="text-xs">
                Anyone with access to this file can impersonate you in MLS
                groups and decrypt messages sent to this key package. Only
                export if you need to backup or transfer your identity to
                another device.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          // Step 2: Display encoded JSON
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="json-content">Key Package Data (JSON)</Label>
              <Textarea
                id="json-content"
                className="font-mono text-xs h-64 resize-none"
                value={encodedJson}
                readOnly
              />
              <p className="text-xs text-muted-foreground">
                Filename: <code className="font-mono">{filename}</code>
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {hasPrivateKey ? "Cancel" : "Close"}
          </Button>
          {hasPrivateKey && !showContent && (
            <Button variant="destructive" onClick={() => setShowContent(true)}>
              Show Key Package
            </Button>
          )}
          {hasPrivateKey && showContent && (
            <Button onClick={handleDownload} disabled={!encodedJson}>
              <Download className="h-4 w-4 mr-2" />
              Download as JSON
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

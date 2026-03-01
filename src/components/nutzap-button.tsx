import type { GroupRumorHistory, MarmotGroup } from "@internet-privacy/marmots";
import type { Rumor } from "applesauce-common/helpers/gift-wrap";
import {
  getDecodedToken,
  getEncodedToken,
  MintQuoteState,
  sumProofs,
  Wallet,
} from "@cashu/cashu-ts";
import {
  IconBolt,
  IconCheck,
  IconCopy,
  IconLoader2,
} from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";

import QRImage from "@/components/qr-image";
import { useNutzapInfo } from "@/hooks/use-nutzap-info";
import { useSendNutzap } from "@/hooks/use-send-nutzap";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface NutzapButtonProps {
  group: MarmotGroup<GroupRumorHistory>;
  rumor: Rumor;
}

interface ParsedToken {
  mintUrl: string;
  amount: number;
}

function parseToken(raw: string): ParsedToken | null {
  try {
    const decoded = getDecodedToken(raw.trim());
    const mintUrl = decoded.mint;
    if (!mintUrl) return null;
    return { mintUrl, amount: sumProofs(decoded.proofs) };
  } catch {
    return null;
  }
}

function mintHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// ============================================================================
// Shared: Accepted Mints + Comment fields used by both tabs
// ============================================================================

function AcceptedMintsBadges({ mints }: { mints: string[] }) {
  if (mints.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
        Accepted mints
      </span>
      <div className="flex flex-wrap gap-1">
        {mints.map((host) => (
          <span
            key={host}
            className="inline-block px-1.5 py-0.5 rounded bg-muted text-xs font-mono"
          >
            {host}
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Tab 1: Cashu token
// ============================================================================

interface CashuTabProps {
  acceptedMintHostnames: string[];
  onSend: (tokenString: string, comment: string) => Promise<void>;
  isSending: boolean;
  error: string | null;
}

function CashuTab({
  acceptedMintHostnames,
  onSend,
  isSending,
  error,
}: CashuTabProps) {
  const [tokenString, setTokenString] = useState("");
  const [comment, setComment] = useState("");

  const parsed = tokenString.trim() ? parseToken(tokenString) : null;
  const tokenValid = parsed !== null;
  const tokenInvalid = tokenString.trim().length > 0 && !tokenValid;

  return (
    <div className="flex flex-col gap-4">
      <AcceptedMintsBadges mints={acceptedMintHostnames} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nutzap-token">Cashu token</Label>
        <Textarea
          id="nutzap-token"
          placeholder="cashuA..."
          value={tokenString}
          onChange={(e) => setTokenString(e.target.value)}
          rows={3}
          className="font-mono text-xs resize-none"
          disabled={isSending}
        />
        {tokenValid && (
          <p className="text-sm text-muted-foreground">
            Detected{" "}
            <span className="font-semibold text-foreground">
              {parsed.amount} sat
            </span>{" "}
            from{" "}
            <span className="font-mono text-xs break-all">
              {parsed.mintUrl}
            </span>
          </p>
        )}
        {tokenInvalid && (
          <p className="text-sm text-destructive">Invalid Cashu token</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cashu-comment">
          Comment{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="cashu-comment"
          placeholder="Great message!"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={isSending}
        />
      </div>

      {error && <p className="text-sm text-destructive break-words">{error}</p>}

      <Button
        onClick={() => onSend(tokenString.trim(), comment.trim())}
        disabled={isSending || !tokenValid}
        className="gap-1.5"
      >
        {isSending ? (
          <>
            <IconLoader2 className="w-4 h-4 animate-spin" />
            Sending…
          </>
        ) : (
          <>
            <IconBolt className="w-4 h-4" />
            {`Zap ${parsed ? `${parsed.amount} sat` : ""}`}
          </>
        )}
      </Button>
    </div>
  );
}

// ============================================================================
// Tab 2: Lightning invoice → mint fresh P2PK-locked proofs
// ============================================================================

type LnStep = "input" | "invoice" | "success";

interface LnTabProps {
  acceptedMints: { url: string; hostname: string }[];
  p2pkPubkey: string;
  onSendProofs: (
    mintUrl: string,
    lockedProofs: ReturnType<typeof sumProofs> extends number
      ? never
      : Parameters<typeof sumProofs>[0],
    comment: string,
  ) => Promise<void>;
  isSending: boolean;
  sendError: string | null;
}

function LnTab({
  acceptedMints,
  p2pkPubkey,
  onSendProofs,
  isSending,
  sendError,
}: LnTabProps) {
  const [step, setStep] = useState<LnStep>("input");
  const [selectedMint, setSelectedMint] = useState(acceptedMints[0]?.url ?? "");
  const [amount, setAmount] = useState("21");
  const [comment, setComment] = useState("");
  const [invoice, setInvoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCreatingQuote, setIsCreatingQuote] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Keep wallet + abort controller on refs so they survive re-renders and
  // don't get garbage-collected while the background subscription is running.
  const walletRef = useRef<Wallet | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const amountNum = parseInt(amount, 10);
  const amountValid = !isNaN(amountNum) && amountNum > 0;

  /**
   * Wait for the quote to be paid. Tries WebSocket first (onceMintPaid); if
   * the mint doesn't support WebSockets the connection throws, so we fall back
   * to HTTP polling every 3 seconds.
   */
  const waitForPayment = async (
    wallet: Wallet,
    quoteId: string,
    signal: AbortSignal,
  ): Promise<void> => {
    // --- WebSocket path ---
    try {
      await wallet.on.onceMintPaid(quoteId, { signal, timeoutMs: 5 * 60_000 });
      return; // resolved → payment confirmed via WS
    } catch (wsErr) {
      // If the user aborted, propagate the abort
      if (signal.aborted || (wsErr as Error).name === "AbortError") throw wsErr;
      // Otherwise the mint probably doesn't support WebSockets — fall through
      // to polling.
      console.warn(
        "[NutzapButton] WebSocket subscription failed, falling back to polling:",
        wsErr,
      );
    }

    // --- Polling fallback ---
    while (!signal.aborted) {
      await new Promise((r) => setTimeout(r, 3_000));
      if (signal.aborted) break;
      const status = await wallet.checkMintQuoteBolt11(quoteId);
      if (
        status.state === MintQuoteState.PAID ||
        status.state === MintQuoteState.ISSUED
      ) {
        return; // paid
      }
      // Check for expiry
      if (status.expiry && Date.now() / 1000 > status.expiry) {
        throw new Error("Invoice expired before payment");
      }
    }
    // signal aborted
    throw Object.assign(new Error("Aborted"), { name: "AbortError" });
  };

  const handleCreateInvoice = async () => {
    if (!selectedMint || !amountValid) return;
    setError(null);
    setIsCreatingQuote(true);

    try {
      const wallet = new Wallet(selectedMint, { unit: "sat" });
      await wallet.loadMint();
      walletRef.current = wallet; // keep alive on ref

      const quote = await wallet.createMintQuoteBolt11(amountNum);
      setInvoice(quote.request);
      setStep("invoice");

      // Start waiting for payment in the background
      const ac = new AbortController();
      abortRef.current = ac;
      setIsWaiting(true);

      // Capture comment value at the time the invoice is created
      const commentAtSubmit = comment.trim();

      waitForPayment(wallet, quote.quote, ac.signal)
        .then(async () => {
          setIsWaiting(false);
          // Mint fresh proofs P2PK-locked to the recipient
          const lockedProofs = await wallet.ops
            .mintBolt11(amountNum, quote.quote)
            .asP2PK({ pubkey: p2pkPubkey })
            .run();

          await onSendProofs(
            selectedMint,
            lockedProofs as never,
            commentAtSubmit,
          );
          setStep("success");
        })
        .catch((err) => {
          setIsWaiting(false);
          if ((err as Error).name === "AbortError") return; // user dismissed
          setError(
            err instanceof Error ? err.message : "Payment failed or timed out",
          );
        });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreatingQuote(false);
    }
  };

  const handleCopyInvoice = async () => {
    await navigator.clipboard.writeText(invoice);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    abortRef.current?.abort();
    setStep("input");
    setInvoice("");
    setError(null);
    setIsWaiting(false);
  };

  if (step === "success") {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10">
          <IconCheck className="w-6 h-6 text-green-500" />
        </div>
        <p className="font-medium">Nutzap sent!</p>
        <p className="text-sm text-muted-foreground">
          {amountNum} sat delivered to the recipient.
        </p>
      </div>
    );
  }

  if (step === "invoice") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Pay this Lightning invoice for{" "}
          <span className="font-semibold text-foreground">{amountNum} sat</span>{" "}
          via{" "}
          <span className="font-mono text-xs">
            {mintHostname(selectedMint)}
          </span>
          . Tokens will be minted and sent automatically once paid.
        </p>

        <div className="flex justify-center">
          <a href={`lightning:${invoice}`} title="Open in Lightning wallet">
            <QRImage data={invoice.toUpperCase()} size={200} />
          </a>
        </div>

        <div className="flex gap-1.5">
          <Input value={invoice} readOnly className="font-mono text-xs" />
          <Button
            variant="outline"
            size="icon"
            onClick={handleCopyInvoice}
            className="shrink-0"
          >
            {copied ? (
              <IconCheck className="w-4 h-4 text-green-500" />
            ) : (
              <IconCopy className="w-4 h-4" />
            )}
          </Button>
        </div>

        {isWaiting && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <IconLoader2 className="w-4 h-4 animate-spin shrink-0" />
            Waiting for payment… (5 min timeout)
          </div>
        )}

        {isSending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <IconLoader2 className="w-4 h-4 animate-spin shrink-0" />
            Sending nutzap…
          </div>
        )}

        {(error || sendError) && (
          <p className="text-sm text-destructive break-words">
            {error ?? sendError}
          </p>
        )}

        <Button variant="outline" onClick={handleReset} disabled={isSending}>
          Cancel
        </Button>
      </div>
    );
  }

  // step === "input"
  return (
    <div className="flex flex-col gap-4">
      <AcceptedMintsBadges mints={acceptedMints.map((m) => m.hostname)} />

      {acceptedMints.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ln-mint">Mint</Label>
          <select
            id="ln-mint"
            value={selectedMint}
            onChange={(e) => setSelectedMint(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {acceptedMints.map((m) => (
              <option key={m.url} value={m.url}>
                {m.hostname}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ln-amount">Amount (sats)</Label>
        <Input
          id="ln-amount"
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="21"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ln-comment">
          Comment{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="ln-comment"
          placeholder="Great message!"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-destructive break-words">{error}</p>}

      <Button
        onClick={handleCreateInvoice}
        disabled={isCreatingQuote || !amountValid || !selectedMint}
        className="gap-1.5"
      >
        {isCreatingQuote ? (
          <>
            <IconLoader2 className="w-4 h-4 animate-spin" />
            Creating invoice…
          </>
        ) : (
          <>
            <IconBolt className="w-4 h-4" />
            Create invoice
          </>
        )}
      </Button>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function NutzapButton({ group, rumor }: NutzapButtonProps) {
  const [open, setOpen] = useState(false);

  const { canReceiveNutzaps, nutzapInfo } = useNutzapInfo(rumor.pubkey);
  const { sendNutzap, isSending, error } = useSendNutzap(
    group,
    rumor.id,
    rumor.pubkey,
  );

  // Hide once we know the recipient can't receive
  if (nutzapInfo === null || (nutzapInfo !== undefined && !canReceiveNutzaps)) {
    return null;
  }

  const acceptedMints =
    nutzapInfo?.mints.map((m) => ({
      url: m.mint,
      hostname: mintHostname(m.mint),
    })) ?? [];
  const acceptedMintHostnames = acceptedMints.map((m) => m.hostname);
  const p2pkPubkey = nutzapInfo?.p2pk ?? "";

  const handleSendToken = useCallback(
    async (tokenString: string, comment: string) => {
      await sendNutzap(tokenString, comment || undefined);
      setOpen(false);
    },
    [sendNutzap],
  );

  // Called by LnTab once proofs are minted P2PK-locked.
  // Encode them as a cashu token string so sendNutzap can decode them.
  // sendNutzap detects the proofs are already correctly locked and skips the swap.
  const handleSendProofs = useCallback(
    async (
      mintUrl: string,
      lockedProofs: Parameters<typeof sumProofs>[0],
      comment: string,
    ) => {
      const tokenString = getEncodedToken({
        mint: mintUrl,
        proofs: lockedProofs,
        unit: "sat",
      });
      await sendNutzap(tokenString, comment || undefined);
    },
    [sendNutzap],
  );

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          className="flex items-center justify-center w-6 h-6 rounded-full text-muted-foreground hover:text-yellow-500 hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none"
          aria-label="Send nutzap"
          disabled={!canReceiveNutzaps}
        >
          <IconBolt className="w-3.5 h-3.5" />
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Nutzap</DialogTitle>
          <DialogDescription>
            Tip this message with Cashu. The tokens are P2PK-locked to the
            recipient and sent privately inside the group.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="cashu">
          <TabsList className="w-full">
            <TabsTrigger value="cashu" className="flex-1">
              Cashu token
            </TabsTrigger>
            <TabsTrigger value="lightning" className="flex-1">
              Lightning
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cashu" className="mt-4">
            <CashuTab
              acceptedMintHostnames={acceptedMintHostnames}
              onSend={handleSendToken}
              isSending={isSending}
              error={error}
            />
          </TabsContent>

          <TabsContent value="lightning" className="mt-4">
            <LnTab
              acceptedMints={acceptedMints}
              p2pkPubkey={p2pkPubkey}
              onSendProofs={handleSendProofs as never}
              isSending={isSending}
              sendError={error}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

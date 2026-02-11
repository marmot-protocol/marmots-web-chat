import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { PrivateKeyAccount } from "applesauce-accounts/accounts";
import { normalizeToSecretKey } from "applesauce-core/helpers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import accountManager from "@/lib/accounts";

interface ExistingKeyTabProps {
  onSuccess?: () => void;
}

export default function ExistingKeyTab({ onSuccess }: ExistingKeyTabProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [nsecInput, setNsecInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      // Normalize the input to a secret key (handles hex, nsec, etc.)
      const secretKey = normalizeToSecretKey(nsecInput.trim());

      if (!secretKey) {
        throw new Error(
          "Invalid secret key format. Please provide a valid nsec or hex private key.",
        );
      }

      // Create account from the secret key
      const account = PrivateKeyAccount.fromKey(secretKey);

      // Add the account to the account manager
      accountManager.addAccount(account);

      // Set it as the active account
      accountManager.setActive(account.id);

      // Clear the input for security
      setNsecInput("");

      // Call success callback or navigate
      if (onSuccess) {
        onSuccess();
      } else {
        const from = (location.state as any)?.from ?? "/";
        navigate(from);
      }
    } catch (err) {
      console.error("Login error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to login. Please check your secret key.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && nsecInput.trim() && !loading) {
      handleLogin();
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="nsec-input">Secret Key</Label>
        <Input
          id="nsec-input"
          type="password"
          placeholder="nsec1... or hex private key"
          value={nsecInput}
          onChange={(e) => setNsecInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Enter your nsec key or hex private key to login
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        className="w-full"
        onClick={handleLogin}
        disabled={loading || !nsecInput.trim()}
      >
        {loading ? "Logging in..." : "Login"}
      </Button>

      <div className="text-xs text-muted-foreground text-center space-y-1">
        <p>Your private key will be stored locally in your browser.</p>
        <p className="text-amber-600 dark:text-amber-500 font-medium">
          Never share your private key with anyone.
        </p>
      </div>
    </div>
  );
}

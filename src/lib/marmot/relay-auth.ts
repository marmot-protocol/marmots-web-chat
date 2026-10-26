import type { AuthSigner, RelayAuthHandler } from "applesauce-relay/types";

/**
 * Authenticate only the operation a relay refused, using the current account.
 * @param signer - Account signer used for NIP-42.
 * @param isClosed - Whether the owning account has been disconnected.
 * @returns An Applesauce v7 operation-scoped authentication handler.
 */
export function createRelayAuthHandler(
  signer: AuthSigner,
  isClosed: () => boolean,
): RelayAuthHandler {
  return async ({ relay }) => {
    if (isClosed()) throw new Error("Account connection is closed");
    const response = await relay.authenticate(signer);
    if (isClosed()) throw new Error("Account connection is closed");
    if (!response.ok) {
      throw new Error(response.message || "Relay authentication rejected");
    }
  };
}

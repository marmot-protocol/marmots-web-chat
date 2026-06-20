import type { PrivateKeyAccount } from "applesauce-accounts/accounts";

import {
  type AccountIdentityProofSigner,
  signAccountIdentityProof,
} from "@internet-privacy/marmot-ts";

/**
 * Builds an {@link AccountIdentityProofSigner} from a local `PrivateKeyAccount`.
 *
 * Every Marmot v2 KeyPackage/leaf MUST carry a valid account identity proof
 * (BIP-340 over the account's Nostr key) or a spec-conformant peer rejects the
 * membership. The applesauce `EventSigner` cannot sign the proof digest, so we
 * reach for the raw secret the account exposes at `account.signer.key`. Remote
 * signers (NIP-07/46) have no raw key and so cannot back a darkmatter account
 * yet — {@link resolveAccountProofSigner} returns null for those.
 */
export function accountProofSignerFor(
  account: PrivateKeyAccount<unknown>,
): AccountIdentityProofSigner {
  const secretKey = account.signer.key;
  return (request) => signAccountIdentityProof(request, secretKey);
}

/**
 * Returns a proof signer when the account exposes a raw secret key, else null.
 * Lets the rest of the app stay signer-agnostic: a null result means key
 * packages can't be published (surface this in the UI) rather than a crash.
 */
export function resolveAccountProofSigner(
  account: unknown,
): AccountIdentityProofSigner | null {
  const candidate = account as PrivateKeyAccount<unknown>;
  if (candidate?.signer && candidate.signer.key instanceof Uint8Array) {
    return accountProofSignerFor(candidate);
  }
  return null;
}

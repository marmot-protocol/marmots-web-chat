# marmot-ts Web Chat

A reference implementation of the [marmot-ts](https://github.com/marmot-protocol/marmot-ts) library - a TypeScript library for building MLS (Messaging Layer Security) group chat applications on Nostr.

This chat application demonstrates how to integrate marmot-ts with a modern React + TypeScript stack to build secure, end-to-end encrypted group messaging functionality.

## Technology Stack

- React 19 + TypeScript
- Vite for fast development and builds
- Applesauce libraries for Nostr integration
- marmot-ts for MLS group chat
- Tailwind CSS v4 + shadcn/ui components
- RxJS for reactive state management

## Getting Started

```bash
pnpm install   # Install dependencies
pnpm dev       # Start development server
pnpm build     # Build for production
pnpm preview   # Preview production build
pnpm format    # Format code with Prettier
pnpm test      # Run migration, relay-auth, and protocol integration tests
```

## Project Structure

See [AGENTS.md](./AGENTS.md) for detailed project structure and development guidelines.
The [Marmot integration guide](./src/lib/marmot/README.md) maps the library APIs, application boundaries, and tests.

## Dependency updates

The app depends on the published `@internet-privacy/marmot-ts` package (currently `0.9.0`) from npm, with Applesauce 7.x packages pinned to tested versions. To upgrade, bump the version in `package.json`, run `pnpm install`, then `pnpm test` and `pnpm build` before committing.

## Current protocol and migration

- Current identity proofs use the account's ordinary event signer. You can create/import a local key or connect a NIP-07 browser extension; no raw key access is required for the proof.
- Each browser profile has a persistent random 64-hex KeyPackage slot, so devices sharing an account do not overwrite each other's published key packages.
- After upgrading to marmot-ts 0.7, startup publishes a package under the new slot and then automatically retires packages left under the older `marmot-web-…` device-label slots (relay deletion plus private keys), so invites sent against those old packages can no longer be joined. Any that cannot be retired, e.g. without stored relay routes, stay listed as legacy in Settings for manual retirement.
- Startup uses `ensurePublished()` to refresh packages missing signed media v2 capabilities, preserving old private bundles for delayed Welcomes. Both outbox and invite inbox relay lists must be configured. Incomplete discovery can be retried in Settings.
- Legacy key packages stay stored for existing invites. Settings marks them and offers explicit retirement, which publishes deletion events and removes the private keys. Retire them after dealing with pending older invites.
- Stored groups with an older identity-proof profile remain listed, and their saved chat history is readable. They cannot send or receive new messages: recreate the group and invite its members again. Group info offers explicit removal of local state and cached media.
- New groups can include founding members. Select one device per account; the library creates the founding membership before delivering Welcomes. Failed deliveries appear in the chat with a retry button. This report and retry material are held in memory, so retry before reloading. After a reload, remove an unreachable member and invite them again using a fresh key package.
- Normal mode now persists relay catch-up cursors, delivery evidence, rewind state, and removal markers. Debug mode alone expands retention; ordinary operation retains the library's bounded defaults. Existing stores are preserved.
- Pending commit publication is retried with the original signed event after restart. Group info also offers **Retry pending changes** for failures during the current session. A successful commit can still have failed Welcome deliveries; inspect the invitation report.
- Encrypted media uses v2 (`0x800b`). Sending preserves the source-state guard; after a stale preparation, Retry re-encrypts and uploads the original file with a fresh nonce. Transfers are cancellable and bounded to 32 MiB of ciphertext and 30 seconds per preparation/download.
- Historical v1 references are parsed explicitly. Downloads require authenticated source evidence and retained keys; older history without that evidence shows an unavailable attachment while preserving its caption. Unsupported legacy groups must be recreated rather than relabeled as v2. Hash-only plaintext caches do not bypass verification.
- Admins must step down before leaving. Leave performs that change when another admin remains; the last admin must first promote another member in Members. Failed publication keeps the group locally.
- Back up browser data before rollout and retain the ingestion and rewind stores together. Do not downgrade an upgraded database without validating older-loader compatibility; use a pre-upgrade backup for rollback.
- NIP-05 invite lookup uses advertised relay hints and indexers. Public key-package queries do not wait for relay authentication; inbox/publish operations answer NIP-42 refusals using operation-scoped authentication when a relay requires authentication.
- Ordinary invitations report delivery failures after the membership commit, rather than treating the commit acknowledgement as proof that the member received a Welcome.

See the library's [migration guidance](https://github.com/marmot-protocol/marmot-ts/blob/master/docs/client/best-practices.md) for profile compatibility details.

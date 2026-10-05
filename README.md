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
git submodule update --init --recursive
pnpm install   # Install dependencies and build marmot-ts
pnpm dev       # Start development server
pnpm build     # Build for production
pnpm preview   # Preview production build
pnpm format    # Format code with Prettier
pnpm test      # Run migration, relay-auth, and protocol integration tests
```

## Project Structure

See [AGENTS.md](./AGENTS.md) for detailed project structure and development guidelines.

## Dependency updates

The app pins marmot-ts to commit `c2f5a12` on `master`, with stable Applesauce 6.x packages. The nested `ts-mls` workspace is built before marmot-ts, which vendors it into its public package output.

Run `pnpm update-marmot` to fetch and check out the current upstream `master`, initialize its MLS submodule, install the workspace dependencies, and rebuild. Review the submodule pointer and lockfile changes, then run `pnpm test` and `pnpm build` before committing the upgrade.

## Current protocol and migration

- Current identity proofs use the account's ordinary event signer. You can create/import a local key or connect a NIP-07 browser extension; no raw key access is required for the proof.
- Each browser profile has a persistent device slot, so devices sharing an account do not overwrite each other's published key packages.
- Startup publishes a current package for this device when needed, provided both outbox and invite inbox relay lists are configured. Incomplete discovery can be retried in Settings.
- Legacy key packages stay stored for existing invites. Settings marks them and offers explicit retirement, which publishes deletion events and removes the private keys. Retire them after dealing with pending older invites.
- Stored groups with an older identity-proof profile remain listed, and their saved chat history is readable. They cannot send or receive new messages: recreate the group and invite its members again. Group info offers explicit removal of local state and cached media.
- New groups can include founding members. Select one device per account; the library creates the founding membership before delivering Welcomes. Failed deliveries appear in the chat with a retry button. This report and retry material are held in memory, so retry before reloading. After a reload, remove an unreachable member and invite them again using a fresh key package.
- NIP-05 invite lookup uses advertised relay hints and indexers. Public key-package queries do not wait for relay authentication; inbox/publish requests answer NIP-42 challenges when a relay requires authentication.
- Ordinary invitations report delivery failures after the membership commit, rather than treating the commit acknowledgement as proof that the member received a Welcome.

See the library's [migration guidance](marmot-ts/docs/client/best-practices.md) for profile compatibility details.

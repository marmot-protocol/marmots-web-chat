# Marmot integration

Start with [setup.ts](./setup.ts): it constructs the library client with the
account signer, relay adapter, and durable stores. The UI then uses that
`MarmotClient` directly through the hooks in `src/hooks/use-marmot.tsx`.
[account.ts](./account.ts) runs only the background work no library owns, and
[actions/](./actions) holds stateless helpers for APIs marmot-ts does not have yet.
The app doubles as a check that the client has everything a full chat UI needs.

## Library APIs first

| Concern                                   | API used here                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| Event kinds                               | Applesauce `kinds` and Marmot's exported kind constants                               |
| Chat and NIP-C7 replies                   | `ChatMessageFactory`, then `toRumor(signer)`                                          |
| Reactions                                 | `ReactionFactory`, then `toRumor(signer)`                                             |
| Profile events                            | `ProfileFactory`                                                                      |
| Relay normalization                       | `relaySet()`                                                                          |
| Public event verification and replacement | Shared `EventStore`                                                                   |
| Private message projection                | `RumorStore`                                                                          |
| Group state and membership                | `group.groupData`, `Proposals`, `client.groups.commit()`                              |
| Connections and invitations               | `client.groups.connectAll()`, `client.invites.listen()`                               |
| Media                                     | `prepareMediaMessage()`, `createBlossomMediaTransport()`, `downloadMediaAttachment()` |
| KeyPackage publication                    | `client.keyPackages.ensurePublished()`                                                |
| Slot validation                           | `validateKeyPackageSlot()`                                                            |
| Stream cancellation and stale reads       | RxJS `takeUntil()` and `switchMap()`                                                  |

Keep protocol rules, serialization, cryptography, convergence, and relay retry
policy in the libraries. This folder supplies browser storage, application
routing choices, UI state, and compatibility for this app's existing data.

Group hooks subscribe to the library's `changed` events and read its stable
`group.snapshot` / `client.groups.snapshot` values with `useSyncExternalStore`.
The library owns per-group listener management; the app does not mirror it.

## File guide

- **setup.ts** — composition root; the only integration module that imports app
  settings and shared Nostr singletons. Supply changing lookup settings through
  a callback so the account runtime does not depend on those globals.
- **account.ts** — `MarmotAccount`: start once, stop when switching accounts. It
  publishes a fresh account's relay lists and profile, keeps this browser's
  KeyPackage published, connects groups and the invite inbox, owns per-group
  history windows, and collects background warnings in `notices$`. It holds no
  group registry or UI snapshot: groups come from `client.groups`.
- **actions/** — stateless `(client, group, …)` functions used by components via
  `useAction`. Each exists because of a library gap listed below.
- **types.ts** — concrete client/group types and display contracts.
- **network.ts / relay-auth.ts** — Applesauce v7 implementation of
  `NostrNetworkInterface`, with operation-scoped NIP-42 and cancellation.
- **discovery.ts / invitations.ts** — NIP-05 and relay-list discovery, then public
  KeyPackage lookup. The shared EventStore selects current addressable events;
  the app limits candidates to devices rediscovered on the queried relays.
- **key-packages.ts / key-package-slot.ts** — this browser's persistent publication
  slot, display summaries, and compatibility with the app's older slot names.
- **media.ts** — browser image metadata, guarded prepared intents, cancellation,
  and explicit reading of historical v1 attachments.
- **timeline.ts** — reactive local history projection, including fork retractions.
  Increasing the query window avoids a timestamp cursor dropping messages that
  share a page-boundary timestamp. RxJS unsubscribes listeners on disposal and
  ignores reads overtaken by later changes.
- **message-outbox.ts** — optimistic UI rows and retry state. These rows never enter
  the public EventStore. Retain the original file until delivery succeeds so a
  stale media preparation can be repeated with a fresh nonce.
- **stores.ts / prefixed-store.ts** — per-account IndexedDB stores and per-group
  namespaces. Preserve the ingest and rewind stores together. Stop the account
  before an explicit account-data reset.
- **audit.ts** — optional browser recording and upload; not required by the protocol.
- **`__tests__/`** — unit and protocol integration tests, shared test helpers,
  and a disposable 0.7.0 migration fixture. Tests use local transports and stores.

## marmot-ts API gaps

Each helper below wraps something a chat UI needs that marmot-ts 0.9 does not
provide. They are candidates to move upstream; once one lands, delete the helper
and call the library.

| Gap                                                                         | App code                                                                    |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| No chat message, NIP-C7 reply, or reaction send helpers                     | `actions/messages.ts`                                                       |
| No rename, promote/demote, remove-member, or media-policy helpers           | `actions/group-admin.ts`                                                    |
| `groups.leave()` does not hand over admin first                             | `leaveGroup()`                                                              |
| `groups.invite()` takes one KeyPackage and does not aggregate Welcome fails | `inviteKeyPackages()`                                                       |
| Founding `pendingWelcomes` are in memory only                               | `createGroup()` / `retryFoundingWelcome()` warn; retry is lost after reload |
| Publish results from `retryPendingPublication()` need interpretation        | `retryPendingChanges()`                                                     |
| `ensurePublished()` can pick another slot and returns no publication events | `actions/key-packages.ts` `ensureDeviceKeyPackage()`                        |
| `createPaginatedLoader()` can skip messages sharing a boundary timestamp    | `timeline.ts` grows a query window instead                                  |
| No KeyPackage discovery for another user, NIP-05, or relay-list publishing  | `invitations.ts`, `discovery.ts`, `actions/identity.ts`                     |
| Async generators / EventEmitters only, no Observables                       | `useAsyncIterable`, RxJS in `timeline.ts` and `account.ts`                  |

## Boundaries worth preserving

Public signed events go to the shared `EventStore`. MLS-authenticated unsigned
messages go to each group's `RumorStore`; do not add signatures or cast rumors
into signed events. Private rumor IDs are still checked by `RumorStore`.

Backfill failures, timeouts, and account cancellation must reject. Resolving an
empty request means the relay has no more events in that window and can advance
its durable cursor. Bounded pages count verified, distinct events.

Media retries retain the prepared intent's `expectedParent`. A
`StaleMediaPreparationError` requires preparation and upload again; never remove
the guard. Downloads use `mediaSourceForRumor()` rather than guessing an epoch or
trusting a plaintext cache entry. Historical v1 support is compatibility code,
not a model for new sends.

`ensurePublished()` in 0.9.0 can select another locally stored slot and returns a
summary without publication events after creation. The small device check here
reads signed capabilities and the durable list before deciding whether this
browser needs another publication. Old private bundles remain for delayed
Welcomes.

The `client_nonce` tag is app-specific: it keeps two identical messages sent in
one second from having the same rumor ID. The app's legacy-slot retirement and
historical media handling are migration policy, not library requirements.

## Scope and validation

`KeyValueRumorHistoryBackend` is the library's simple reference backend: queries
scan stored rumors. For large histories, supply an indexed backend instead of
adding caching or query logic to the app. Apps sharing durable state
between browser tabs must also coordinate a single writer; this sample does not
yet implement cross-tab locking.

Run `pnpm test`, `pnpm exec tsc -b`, and `pnpm build`. Integration tests exercise
real library clients through create/invite/join, admin handover, media across
restart, migration from 0.7.0, and byte-identical pending-commit retries.

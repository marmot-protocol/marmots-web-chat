# Marmot integration

Start with [setup.ts](./setup.ts): it constructs the library client with the
account signer, relay adapter, and durable stores. [controller.ts](./controller.ts)
connects that client to the app's workflows and React snapshot. Other apps can use
`MarmotClient` directly; the controller is this chat app's UI adapter.

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

## File guide

- **setup.ts** — composition root; the only integration module that imports app
  settings and shared Nostr singletons. Supply changing lookup settings through
  a callback so the controller does not depend on those globals.
- **controller.ts** — account lifecycle and user workflows. Start once, stop when
  switching accounts. Group metadata stays in the library; snapshots contain
  application state such as pagination, status, and busy indicators.
- **types.ts** — concrete client/group types and UI snapshot contracts.
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
  namespaces. Preserve the ingest and rewind stores together. Stop the controller
  before an explicit account-data reset.
- **audit.ts** — optional browser recording and upload; not required by the protocol.
- **`__tests__/`** — unit and protocol integration tests, shared test helpers,
  and a disposable 0.7.0 migration fixture. Tests use local transports and stores.

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

`ensurePublished()` in 0.8.0 can select another locally stored slot and returns a
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
adding caching or query logic to this controller. Apps sharing durable state
between browser tabs must also coordinate a single writer; this sample does not
yet implement cross-tab locking.

Run `pnpm test`, `pnpm exec tsc -b`, and `pnpm build`. Integration tests exercise
real library clients through create/invite/join, admin handover, media across
restart, migration from 0.7.0, and byte-identical pending-commit retries.

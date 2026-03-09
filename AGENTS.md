# Agent Guidelines for marmot-ts Web Chat

React + TypeScript + Vite reference implementation of marmot-ts (MLS group chat on Nostr).

## Build, Lint, and Test Commands

```bash
# Development
pnpm dev              # Start development server (Vite)
pnpm build            # Type check + production build (tsc -b && vite build)
pnpm preview          # Preview production build

# Code Quality
pnpm format           # Format all files with Prettier
tsc -b                # Type check only (no emit); run this before committing

# Dependencies
pnpm install          # Install dependencies (also builds marmot-ts submodule via prepare)
pnpm prepare          # Build marmot-ts submodule (cd marmot-ts && pnpm build)
```

**No test suite exists yet.** If tests are added, use `.test.ts` / `.test.tsx` extensions.
The canonical pre-commit check is `tsc -b` — the build must pass with zero errors.

## Project Structure

```text
src/
  components/         React components
    ui/               shadcn/ui primitives — regenerate with `shadcn`, do NOT edit by hand
    form/             Form-specific components
    key-package/      Key package UI
  contexts/           React context definitions + typed hooks
  hooks/              Custom React hooks (use-*.ts)
  lib/                Core app logic, singletons, utilities
  pages/              Route-based page components
    groups/[id]/      Group layout + mini-app tabs (chat, members, admin, …)
  types/              Global ambient type declarations
marmot-ts/            Git submodule — MLS group chat library (@internet-privacy/marmot-ts)
```

Key singletons in `src/lib/`:

- `nostr.ts` — `eventStore` (public), `pool`, `eventLoader`
- `marmot-client.ts` — `marmotClient$`, `liveGroups$`, `liveKeyPackages$`, `AppGroup` type
- `accounts.ts` — `accounts`, `user$`, `factory`, `actions`, `publish()`
- `settings.ts` — all RxJS `BehaviorSubject`s for user preferences + `persist()`
- `blossom.ts` — `uploadToConfiguredBlossomServers()`
- `account-database.ts` — `MultiAccountDatabaseBroker` (IndexedDB + localforage)
- `runtime.ts` — import once in `main.tsx` to activate background managers

## Code Style

### TypeScript Strictness

```jsonc
// tsconfig.app.json enforces:
"strict": true,
"noUnusedParameters": true,       // unused params → compile error
"noUnusedLocals": false,          // locals are linted but not errors
"erasableSyntaxOnly": true,       // no const enum / namespace
"noFallthroughCasesInSwitch": true,
"noUncheckedSideEffectImports": true
```

Always run `tsc -b` to verify. Never silence errors with `// @ts-ignore` except for
browser globals exposed on `window` in DEV-only blocks.

### Import Order

```typescript
// 1. External libraries
import { useState, useEffect } from "react";
import { EventStore } from "applesauce-core";
import { Link } from "react-router";

// 2. Path-alias imports (@/*)
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// 3. Relative imports
import { MessageItem } from "./message-item";

// 4. Type-only imports (anywhere in the block, marked with `type`)
import type { NostrEvent } from "applesauce-core/helpers";
import type { AppGroup } from "@/lib/marmot-client";
```

- Always use `import type` for type-only imports.
- Use the `@/*` alias for anything under `src/`.

### Naming Conventions

| Thing                  | Convention               | Example                         |
| ---------------------- | ------------------------ | ------------------------------- |
| React components       | PascalCase               | `UserBadge`, `PageHeader`       |
| Hooks                  | `use` prefix + camelCase | `useDebounce`, `use$`           |
| Types / Interfaces     | PascalCase               | `GroupContextValue`, `AppGroup` |
| RxJS observables       | `$` suffix               | `extraRelays$`, `marmotClient$` |
| Module-level constants | SCREAMING_SNAKE_CASE     | `DEFAULT_LOOKUP_RELAYS`         |
| Variant / size types   | String literal unions    | `"sm" \| "md" \| "lg"`          |

### Formatting (Prettier)

Config (`.prettierrc`): `tabWidth: 2`, `useTabs: false`.
All other Prettier defaults apply: double quotes, semicolons, trailing commas.
Run `pnpm format` before submitting — do not fix formatting by hand.

### Error Handling

- Throw with descriptive messages: `throw new Error("Invalid nostr public key, must be 64 hex characters")`.
- Use empty `catch {}` for expected silent failures (e.g. `localStorage` unavailable).
- Boolean-return validators: `try { verify(e); return true; } catch { return false; }`.

### JSDoc

Export every public function, hook, and context with JSDoc.
Include `@param`, `@returns`, and at least one `@example` for hooks.

## React Patterns

### Component structure (canonical order)

1. All hooks (never reorder or conditionalise)
2. Early returns for loading / error states
3. Event handlers
4. Render

### Custom hooks

- Prefix with `use`: `useDebounce`, `use$`, `useGroupEventStore`.
- Document with JSDoc + `@example`.
- Export as named exports; return consistent shapes (array, object, or scalar).
- Clean up subscriptions and object URLs in `useEffect` return functions.

## State Management

### RxJS BehaviorSubjects (module-level singletons)

```typescript
export const extraRelays$ = new BehaviorSubject<string[]>(DEFAULT_EXTRA_RELAYS);
persist("extra-relays", extraRelays$); // auto-persists to localStorage

const relays = use$(() => extraRelays$, []); // subscribe reactively in components
```

- Observable names end with `$`.
- Use `shareReplay(1)` on observables derived from async work so late subscribers get the latest value.
- Convert async generators to Observables with `new Observable(subscriber => …)` (see `liveGroups$`).

### Two EventStore instances

- **`eventStore`** (`src/lib/nostr.ts`) — public signed Nostr events, verified by nostr-wasm.
- **per-group `groupEventStore`** (`useGroupEventStore` hook) — private unsigned MLS rumors from IndexedDB; verification bypassed.

Never mix them. Rumors from `group.history` → `groupEventStore`; profile/relay-list events → `eventStore`.

## Group Mini-App Pattern

Each tab under `/groups/:id/*` is a self-contained mini-app. Two contexts are provided by the `[id].tsx` layout:

| Context                  | Hook                   | Provides                                                             |
| ------------------------ | ---------------------- | -------------------------------------------------------------------- |
| `GroupContext`           | `useGroup()`           | `group`, `isAdmin`, `loadingMore`, `loadingDone`, `loadMoreMessages` |
| `GroupEventStoreContext` | `useGroupEventStore()` | Per-group `EventStore` for private MLS events                        |

**Rules:**

- Source the group via `useGroup()` — never via props or `useOutletContext`.
- Derive metadata (name, members, admins, epoch) from `group.state` using
  `extractMarmotGroupData` / `getGroupMembers` — do not cache them in context.
- Each mini-app lives in `src/pages/groups/[id]/<tab>/index.tsx`.
  Sub-components exclusive to that tab live in the same folder.

**Adding a new tab:**

1. Create `src/pages/groups/[id]/<tab>/index.tsx`.
2. Call `useGroup()` (+ `useGroupEventStore()` if you need private events).
3. Add `<Route path="<tab>" element={<YourPage />} />` inside the `:id` route in `src/main.tsx`.
4. Add the tab link in the nav bar inside `[id].tsx`.

## UI Framework

- **shadcn/ui** components live in `src/components/ui/` — regenerate with `shadcn`, never hand-edit.
- **Tailwind CSS v4** — utility classes only; custom theme tokens in `src/index.css`.
- **Tabler Icons** (`@tabler/icons-react`) — preferred icon set.
- **lucide-react** is also available but prefer Tabler.

```typescript
import { Button } from "@/components/ui/button";
import { IconSend } from "@tabler/icons-react";
<Button variant="outline" size="sm"><IconSend size={16} /> Send</Button>
```

## Key Domain Concepts

- **AppGroup** (`MarmotGroup<GroupRumorHistory, GroupMediaStore>`) — the concrete group type; always has `.media` wired.
- **Rumor** — unsigned Nostr event used inside an MLS group; stored in IndexedDB.
- **MIP-04** — E2E encrypted media: encrypt → upload to Blossom → publish kind-1063 rumor.
- **kind 9** (`kinds.ChatMessage`) — plain text group chat message.
- **kind 1063** (`kinds.FileMetadata`) — file metadata rumor (media in chat).
- **`persist(key, subject$)`** — saves/loads a BehaviorSubject to localStorage automatically.
- **`nostr-wasm`** — used for fast Schnorr signature verification; initialised once in `nostr.ts`.

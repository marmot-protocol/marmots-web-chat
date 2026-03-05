# Agent Guidelines for marmot-ts Web Chat

This document provides guidelines for AI coding agents working in this chat application - a React + TypeScript reference implementation of marmot-ts (MLS group chat on Nostr).

## Build, Lint, and Test Commands

```bash
# Development
pnpm dev              # Start development server (Vite)
pnpm build            # Type check and build for production
pnpm preview          # Preview production build

# Code Quality
pnpm format           # Format all files with Prettier
tsc -b                # Type check only (no build)

# Dependencies
pnpm install          # Install dependencies (also builds marmot-ts submodule)
pnpm prepare          # Build marmot-ts submodule (runs automatically on install)
```

**Note:** This project does not currently have test files. If tests are added, they should use the `.test.ts` or `.test.tsx` extension.

## Project Structure

React + TypeScript + Vite application with Nostr/MLS integration:

- **`/src/components`**: React components (UI + custom)
  - `/ui`: shadcn/ui components (don't edit directly, regenerate with `shadcn`)
  - `/form`: Form-specific components
  - `/key-package`: Key package related components
- **`/src/hooks`**: Custom React hooks
- **`/src/lib`**: Utility libraries & core logic (Nostr, settings, utils)
- **`/src/pages`**: Route-based page components
- **`/public`**: Static assets
- **`/marmot-ts`**: Git submodule for MLS functionality (workspace dependency)

## Code Style Guidelines

### Imports

**Order**: External libraries first, then path alias imports, then relative imports

```typescript
// 1. External libraries
import { useState, useEffect } from "react";
import { EventStore } from "applesauce-core";
import { Link } from "react-router";

// 2. Path alias imports (@/*)
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

// 3. Type-only imports
import type { ClassValue } from "clsx";
import type { NostrEvent } from "applesauce-core/helpers";
```

**Type imports**: Use `type` keyword for type-only imports

```typescript
import type { ReactNode } from "react";
import type { BreadcrumbItemType } from "@/components/page-header";
```

### TypeScript Configuration

- **Strict mode enabled**: `strict: true` in tsconfig
- **No unused locals/parameters**: Compiler will error on unused variables
- **Import type keyword**: Use `import type` for type-only imports
- **Path alias**: Use `@/*` for imports from `src/` (e.g., `@/components/ui/button`)

### Naming Conventions

- **Components**: PascalCase function components (e.g., `UserBadge`, `PageHeader`)
- **Hooks**: camelCase with `use` prefix (e.g., `useDebounce`, `use$`)
- **Types/Interfaces**: PascalCase (e.g., `UserBadgeProps`, `BreadcrumbItemType`)
- **Observables**: camelCase with `$` suffix (e.g., `extraRelays$`, `relayConfig$`)
- **Constants**: SCREAMING_SNAKE_CASE for module-level (e.g., `DEFAULT_LOOKUP_RELAYS`)
- **Size/variant types**: string literal unions (e.g., `type UserAvatarSize = "sm" | "md" | "lg"`)

### Formatting

- **Prettier**: 2 spaces, no tabs (configured in `.prettierrc`)
- **Line length**: No hard limit, but keep reasonable (<120 chars when possible)
- **Quotes**: Use double quotes for strings (Prettier default)
- **Semicolons**: Always use semicolons (Prettier default)

### Error Handling

**Throw errors with descriptive messages**:

```typescript
if (!isValidPubkey(pubkey)) {
  throw new Error("Invalid nostr public key, must be 64 hex characters");
}
```

**Use try-catch for expected failures**:

```typescript
try {
  const data = localStorage.getItem(key);
  if (data) {
    subject.next(JSON.parse(data));
  }
} catch {
  // Silent failure for localStorage (expected in some environments)
}
```

**Verify with try-catch for validation**:

```typescript
eventStore.verifyEvent = (e) => {
  try {
    nw.verifyEvent(e);
    return true;
  } catch {
    return false;
  }
};
```

### Documentation

**Use JSDoc** for exported functions and hooks

## Group Mini-App Pattern

Each tab under a group route (`/groups/:id/*`) is a self-contained "mini app" — a folder with its own `index.tsx` — that sources everything it needs from two React contexts provided by the `[id].tsx` layout route:

| Context                                                                | Hook                   | Provides                                                                          |
| ---------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------- |
| `GroupContext` (`src/contexts/group-context.ts`)                       | `useGroup()`           | `group` (`AppGroup`), `isAdmin`, `loadingMore`, `loadingDone`, `loadMoreMessages` |
| `GroupEventStoreContext` (`src/contexts/group-event-store-context.ts`) | `useGroupEventStore()` | Per-group `EventStore` for reactive queries on private MLS events                 |

**Rules for mini apps:**

- Never accept the group via props or `useOutletContext` — always call `useGroup()`.
- Derive group metadata (members, admins, name, epoch) directly from `group.state` using the marmot-ts helpers (`extractMarmotGroupData`, `getGroupMembers`) — do not add pre-computed derived fields to `GroupContextValue`.
- Each mini app lives in `src/pages/groups/[id]/<tab-name>/index.tsx`. Any sub-components or hooks used exclusively by that tab live in the same folder.

**Folder layout:**

```text
src/pages/groups/[id]/
  [id].tsx          ← layout: resolves group, provides both contexts, renders tabs + <Outlet>
  chat/             index.tsx, message-form.tsx, message-list.tsx, …
  members/          index.tsx
  admin/            index.tsx
  timeline/         index.tsx
  media/            index.tsx
  tree/             index.tsx, ratchet-tree-graph.tsx, …
```

**Adding a new tab:**

1. Create `src/pages/groups/[id]/<tab-name>/index.tsx`.
2. Call `useGroup()` (and `useGroupEventStore()` if you need group-private events).
3. Add a `<Route path="<tab-name>" element={<YourPage />} />` inside the `:id` route in `src/main.tsx`.
4. Add the tab link in the nav bar inside `[id].tsx`.

## React Patterns

### Component Structure

```typescript
interface ComponentProps {
  required: string;
  optional?: number;
}

export function Component({ required, optional = 42 }: ComponentProps) {
  // 1. Hooks first (always in same order)
  const [state, setState] = useState<string>("");
  const profile = use$(() => eventStore.profile(pubkey), [pubkey]);

  useEffect(() => {
    // Side effects
  }, [dependencies]);

  // 2. Early returns for loading/error states
  if (!profile) return <Skeleton />;
  if (error) return <ErrorMessage error={error} />;

  // 3. Event handlers
  const handleClick = () => {
    setState("new value");
  };

  // 4. Render
  return (
    <div>
      {required}
    </div>
  );
}
```

### Custom Hooks

- **Prefix with `use`**: `useDebounce`, `use$`, `useProfile`
- **Document with JSDoc** and examples
- **Export as named exports**
- **Return consistent types** (arrays, objects, or single values)

## State Management

### RxJS Observables

```typescript
import { BehaviorSubject } from "rxjs";

// Create observable
export const extraRelays$ = new BehaviorSubject<string[]>([]);

// Persist to localStorage
persist("extra-relays", extraRelays$);

// Subscribe in components
const relays = use$(() => extraRelays$, []);
```

### LocalStorage Persistence

BehaviorSubject can be persisted to localStorage using the `persist` function

## UI Framework

- **shadcn/ui** with Radix UI primitives
- **Tailwind CSS v4** with custom themes
- **Tabler Icons** (`@tabler/icons-react`)
- **JetBrains Mono** variable font

### shadcn/ui Components

Located in `src/components/ui/`:

- Import and use as React components
- Styled with Tailwind CSS
- Customizable via `className` prop

```typescript
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

<Button variant="outline" size="sm">Click me</Button>
```

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

## Layout & Page Building

### Design Tokens (CSS baseline)

All layout decisions flow from these non-negotiable CSS constraints in `src/index.css`:

```css
html,
body,
#root {
  @apply h-full overflow-hidden;
}
--radius: 0; /* all components are square — no rounded corners */
--sidebar-width: 400px; /* overridden in main.tsx (shadcn default is 16rem) */
```

**`html/body/#root` is `overflow-hidden`.** Scroll is never inherited — every scrollable region
must explicitly declare `overflow-y-auto` or `overflow-x-auto`. Nothing scrolls by default.

**All full-height shells use `h-dvh`** (dynamic viewport height), never `h-screen`, so mobile
browser chrome is accounted for.

**Font**: `JetBrains Mono Variable` is `font-sans` — a monospace font used everywhere, including
all body text and UI labels.

---

### The Mobile/Desktop Split

The entire app uses a **single runtime breakpoint** via `useIsMobile` hook
(`src/hooks/use-mobile.ts`):

```typescript
const MOBILE_BREAKPOINT = 768; // identical to Tailwind `md`
// uses window.matchMedia("(max-width: 767px)") — JS, not CSS
```

Every `_layout.tsx` does this:

```tsx
const isMobile = useIsMobile();
return isMobile ? <MobileXxxLayout /> : <DesktopXxxLayout />;
```

This split is **explicit and total** — there are no hybrid CSS-only responsive layouts. Mobile and
desktop are separate component trees.

---

### Shell Components

Two shell components live in `src/layouts/`:

#### `DesktopShell` (`src/layouts/desktop/shell.tsx`)

```tsx
<DesktopShell
  title="Page Title" // shown in sidebar header
  sidebar={<SidebarContent />} // content rendered inside the sidebar panel
  footer={<SidebarFooter />} // optional sidebar footer slot
  scroll={true} // default: true
>
  {/* children override <Outlet />; omit to use <Outlet /> */}
</DesktopShell>
```

- `scroll={true}` → `SidebarInset` gets `overflow-y-auto h-dvh` — the full page scrolls.
  Use for: settings, contacts, key packages, tools.
- `scroll={false}` → `SidebarInset` gets `overflow-hidden h-dvh` — the child owns its scroll.
  Use for: groups (chat needs internal scroll control).

#### `MobileShell` (`src/layouts/mobile/shell.tsx`)

```tsx
<MobileShell title="Page Title" scroll={true}>
  {/* children override <Outlet /> */}
</MobileShell>
```

Structure:

```
<div class="flex flex-col h-dvh overflow-hidden bg-background">
  <MobileTopHeader title={title} />     ← h-14 border-b, title left + avatar right
  <main class="flex-1 overflow-y-auto"> ← (or overflow-hidden when scroll=false)
    {children ?? <Outlet />}
  </main>
  <MobileBottomNav />                   ← h-14 border-t, 3 tabs: Groups / Contacts / Settings
</div>
```

**`PageHeader` returns `null` on mobile.** Never rely on it for mobile layouts — mobile pages
build their own headers inline or via `MobileTopHeader`.

---

### App Sidebar (`src/components/app-sidebar.tsx`)

```
<Sidebar collapsible="icon">
  <SidebarHeader>     ← avatar + page title + hamburger toggle
  <SidebarContent>
    <SidebarGroup>    ← pinned tabs (shown when AppSwitcher is closed)
    <SidebarGroup>    ← either AppSwitcher grid OR section-specific sidebar content
  <SidebarFooter>     ← optional slot passed via DesktopShell `footer` prop
```

- Desktop: fixed `inset-y-0` panel, `400px` wide, collapses to `3rem` icon mode via CSS transition.
- Mobile: renders as a `Sheet` (slide-in drawer from `@radix-ui/react-dialog`), `18rem` wide.
- Sidebar open/closed state persisted in cookie `sidebar_state` (7-day TTL).
- Keyboard shortcut: `Cmd/Ctrl+B` toggles the sidebar.
- **AppSwitcher**: 3-column grid of `h-20 flex-col` buttons for all top-level sections; toggled by
  the hamburger button in the header. When open it replaces section-specific sidebar content.
- **Unread dots**: `h-2 w-2 rounded-full bg-destructive` appear on Groups and Invites in both the
  AppSwitcher grid and pinned tabs list.

---

### Page Header (`src/components/page-header.tsx`)

```tsx
<PageHeader
  items={[
    { label: "Home", to: "/" },
    { label: "Settings", to: "/settings" },
    { label: "Accounts" }, // last item has no `to` — current page
  ]}
  actions={<Button>...</Button>} // optional, right-aligned via ml-auto
/>
```

- Returns `null` on mobile — desktop-only.
- `sticky top-0 bg-background border-b p-4`
- Contains: `SidebarTrigger` | vertical `Separator` | `Breadcrumb` | `actions`
- First breadcrumb item and all `BreadcrumbSeparator`s are `hidden md:block`.

---

### Page Body (`src/components/page-body.tsx`)

```tsx
<PageBody center>
  {" "}
  {/* center adds mx-auto */}
  {/* content */}
</PageBody>
```

CSS: `w-full max-w-4xl space-y-6 p-4 sm:space-y-8 sm:p-6`

Use for all standard scrollable-page content (settings, contacts, profile). Not used inside group
tabs, which manage their own layout.

---

### Canonical Page Layouts

#### Standard desktop page (scrollable — e.g. Settings sub-page)

```tsx
// _layout.tsx
const isMobile = useIsMobile();
if (isMobile)
  return (
    <MobileShell title="Settings">
      <Outlet />
    </MobileShell>
  );
return (
  <DesktopShell title="Settings" sidebar={<SettingsSidebarNav />} scroll={true}>
    <Outlet />
  </DesktopShell>
);

// sub-page component
export default function SettingsAccountsPage() {
  return (
    <>
      <PageHeader
        items={[
          { label: "Home", to: "/" },
          { label: "Settings", to: "/settings" },
          { label: "Accounts" },
        ]}
      />
      <PageBody>{/* Card / Separator sections */}</PageBody>
    </>
  );
}
```

#### Standard settings content layout

```tsx
<Card>
  <CardHeader>
    <CardTitle>Section Title</CardTitle>
    <CardDescription>Subtitle</CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="space-y-2">
      <Label htmlFor="field">Label</Label>
      <Input id="field" ... />
    </div>
  </CardContent>
</Card>
<Separator />
```

#### Mobile settings index row (iOS-style)

```tsx
<Link className="flex items-center gap-4 px-4 py-3.5 hover:bg-muted/50 transition-colors">
  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
    <ItemIcon size={18} />
  </span>
  <span className="flex flex-col flex-1 min-w-0">
    <span className="text-sm font-medium leading-tight">{title}</span>
    <span className="text-xs text-muted-foreground mt-0.5">{description}</span>
  </span>
  <IconChevronRight size={16} className="shrink-0 text-muted-foreground" />
</Link>
```

---

### Group Pages Layout

Group pages deviate from the standard shell — they manage their own layout entirely.

#### Desktop group layout structure

```
DesktopShell scroll={false}
  AppSidebar → GroupsListSidebar (group list + Create button)
  SidebarInset (overflow-hidden)
    PageHeader (breadcrumb + actions)
    <div class="flex gap-1 px-4 border-b shrink-0">
      <GroupTabLinks />   ← horizontal tab strip
    </div>
    GroupContextProviders
      <div class="flex flex-col flex-1 overflow-hidden">
        <Outlet />        ← each tab page
```

#### Mobile group layout structure

```
<div class="flex flex-col h-dvh overflow-hidden bg-background">
  <header class="h-14 border-b bg-background flex items-center px-2 gap-2">
    ← back button | group name (flex-1 truncate) | kebab menu →
  </header>
  <div class="border-b overflow-x-auto flex no-scrollbar">
    <GroupTabLinks />     ← horizontally scrollable tab strip
  </div>
  <main class="flex flex-col flex-1 overflow-hidden">
    <GroupContextProviders>
      <Outlet />
    </GroupContextProviders>
  </main>
  <GroupDetailsDrawer />  ← Sheet opened by kebab menu
```

Key mobile differences from desktop:

- No `MobileShell` — entirely custom layout.
- Tab strip is horizontally scrollable (`overflow-x-auto no-scrollbar flex`); tab items get
  `whitespace-nowrap shrink-0` to prevent wrapping.
- Details accessible via kebab → `Sheet` (`GroupDetailsDrawer`), not a sidebar.
- No `PageHeader`, no `SidebarTrigger`, no breadcrumbs.

#### Tab link active state

```typescript
// tabClassName is a (active: boolean) => string function
const tabClass = (active: boolean) =>
  cn(
    "px-4 py-2 text-sm font-medium transition-colors hover:text-foreground",
    active
      ? "text-foreground border-b-2 border-primary"
      : "text-muted-foreground",
  );
```

Active detection: `useLocation().pathname === href`. The Chat tab also matches the index route
(`/groups/:id`).

#### Group tab page scroll pattern

Every group tab that needs scrollable content follows this structure:

```tsx
// Outer: fills available height, clips overflow
<div className="flex flex-col flex-1 overflow-hidden p-4">
  {/* fixed controls (search, toolbar) */}
  <div className="flex gap-3 mb-4">...</div>

  {/* scrollable list — always flex-1 + overflow-y-auto */}
  <div className="flex-1 overflow-y-auto">
    <div className="flex flex-col gap-2 pb-4">
      {items.map(...)}
    </div>
  </div>
</div>
```

#### Chat scroll architecture (`flex-col-reverse` trick)

```tsx
// Pins messages to bottom; new messages appear at the visual bottom
<div className="flex flex-col-reverse flex-1 h-0 overflow-y-auto overflow-x-hidden px-2 pt-10">
  <MessageList />
  {!loadingDone && <Button>Load older messages</Button>}
</div>
// Fixed input bar, never scrolls away
<div className="border-t p-2 bg-background shrink-0">
  <MessageForm />
</div>
```

`flex-col-reverse` makes the bottom of the list the flex "start", so the container starts
scrolled to the bottom. `h-0 flex-1` creates the scroll box without fighting the parent flex.

---

### Adding a New Section (non-group page)

1. Create `src/pages/<section>/_layout.tsx`:

```tsx
export default function SectionLayout() {
  const isMobile = useIsMobile();
  if (isMobile)
    return (
      <MobileShell title="Section Title">
        <Outlet />
      </MobileShell>
    );
  return (
    <DesktopShell
      title="Section Title"
      sidebar={<SectionSidebarContent />}
      scroll={true}
    >
      <Outlet />
    </DesktopShell>
  );
}
```

2. Create `src/pages/<section>/index.tsx` (and sub-pages as needed):

```tsx
export default function SectionPage() {
  return (
    <>
      <PageHeader items={[{ label: "Home", to: "/" }, { label: "Section" }]} />
      <PageBody>{/* content */}</PageBody>
    </>
  );
}
```

3. Add routes in `src/main.tsx`:

```tsx
<Route path="section" element={<SectionLayout />}>
  <Route index element={<SectionIndex />} />
  <Route path="sub-page" element={<SubPage />} />
</Route>
```

4. Add to the AppSwitcher tabs in `src/components/app-sidebar.tsx` if it should appear in the
   top-level navigation grid.

5. Add to the mobile bottom nav in `src/layouts/mobile/bottom-nav.tsx` if it's a primary
   section (bottom nav is limited to ~3 items; secondary sections go in Settings).

---

### Sheet (Slide-in Drawer) Pattern

```tsx
<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent
    side="right"
    className="w-full sm:max-w-2xl overflow-y-auto flex flex-col"
  >
    <SheetHeader>
      <SheetTitle>Title</SheetTitle>
      <SheetDescription>...</SheetDescription>
    </SheetHeader>
    <div className="p-4 space-y-4 overflow-auto flex-1">
      {/* scrollable body */}
    </div>
    <SheetFooter className="flex-col gap-2 sm:flex-col border-t pt-4">
      {/* action buttons */}
    </SheetFooter>
  </SheetContent>
</Sheet>
```

- `w-full sm:max-w-2xl` → full-width on mobile, constrained on desktop.
- `overflow-y-auto flex flex-col` on `SheetContent` + `flex-1` on body → body scrolls, footer
  stays pinned.

---

### Dialog Scroll Pattern

```tsx
<DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
  <DialogHeader>
    <DialogTitle>Title</DialogTitle>
  </DialogHeader>
  <div className="overflow-auto flex-1">{/* scrollable content */}</div>
</DialogContent>
```

`max-h-[80vh] flex flex-col` + `flex-1 overflow-auto` on the body is the canonical pattern.

---

### Responsive Grid Pattern

```tsx
// Adapts from 2 columns on mobile up to 5 on large screens
<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
```

Used in the Media tab. `lg:grid-cols-3` is common for content cards (home page, contacts).

---

### Tailwind Breakpoints Reference

| Prefix | Viewport  | Common usage in this codebase                           |
| ------ | --------- | ------------------------------------------------------- |
| `sm:`  | ≥ 640 px  | `sm:p-6`, `sm:space-y-8`, `sm:flex-row`, `sm:max-w-2xl` |
| `md:`  | ≥ 768 px  | `hidden md:block` (sidebar), `md:h-8`, breadcrumb items |
| `lg:`  | ≥ 1024 px | `lg:grid-cols-3`, `lg:grid-cols-5` (content grids)      |

The `md` breakpoint matches `MOBILE_BREAKPOINT = 768` from `useIsMobile` — this is intentional.

---

### Layout Gotchas

| Gotcha                         | Detail                                                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `h-dvh` not `h-screen`         | All full-height shells use `h-dvh`. Mobile browser chrome shrinks `100vh`; `dvh` accounts for it.                                                                      |
| Root is `overflow-hidden`      | `html/body/#root` has `overflow-hidden`. Every scrollable region must declare `overflow-y-auto` explicitly.                                                            |
| `PageHeader` is desktop-only   | Returns `null` on mobile (`src/components/page-header.tsx:33`). Mobile pages must provide their own header.                                                            |
| Zero border radius             | `--radius: 0` in `index.css`. All shadcn components are square — never add `rounded-*` to match system style.                                                          |
| JetBrains Mono everywhere      | `--font-sans` is a monospace font. This is intentional — all UI text uses it.                                                                                          |
| Groups don't use `MobileShell` | The group detail layout is fully custom on mobile. It omits `MobileTopHeader` and `MobileBottomNav`.                                                                   |
| `scroll=false` propagates      | When `DesktopShell scroll={false}`, the `SidebarInset` is `overflow-hidden`. Every group tab page must establish its own scroll box or content will be clipped.        |
| Avoid `calc(100vh - Npx)`      | The media and timeline tabs use `calc(100vh - 118px)` — this is a code smell. Prefer `flex-1 overflow-y-auto` inside a `flex flex-col overflow-hidden` parent instead. |
| Sidebar width is 400px         | The CSS variable `--sidebar-width` is overridden globally in `main.tsx`. Do not hardcode sidebar widths; use the variable.                                             |

## Key Domain Concepts

- **AppGroup** (`MarmotGroup<GroupRumorHistory, GroupMediaStore>`) — the concrete group type; always has `.media` wired.
- **Rumor** — unsigned Nostr event used inside an MLS group; stored in IndexedDB.
- **MIP-04** — E2E encrypted media: encrypt → upload to Blossom → publish kind-1063 rumor.
- **kind 9** (`kinds.ChatMessage`) — plain text group chat message.
- **kind 1063** (`kinds.FileMetadata`) — file metadata rumor (media in chat).
- **`persist(key, subject$)`** — saves/loads a BehaviorSubject to localStorage automatically.
- **`nostr-wasm`** — used for fast Schnorr signature verification; initialised once in `nostr.ts`.

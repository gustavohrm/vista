---
status: IMPLEMENTED
last_updated: 2026-11-11
scope: Boundaries between shared app code, platform hosts, and workspace packages.
---

# Application architecture

Vista separates shared product code from platform hosts:

- `packages/app` is the home for shared React UI, features, state, domain behavior, and platform capability contracts. It provides the application shell, workspace file explorer, document viewers/editors, and platform contracts.
- `apps/web` boots the shared app at the browser boundary using the File System Access API for local workspace access and contains a local Cloudflare Worker scaffold for testing the approved hosting target.
- `apps/native` boots the shared app at the Tauri boundary, using Tauri plugins (`@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-fs`) for local filesystem access, plus `tauri-plugin-persisted-scope` so the granted folder scope survives restarts. Its single Tauri project targets desktop, Android, and iOS.

Platform hosts MUST keep browser- or Tauri-specific implementations outside `packages/app`. Shared code MUST consume future platform capabilities through narrow contracts. Add more workspace packages only when code has a proven independent responsibility or consumer.

## Platform adapters

The shared app owns capability interfaces; each host constructs and injects its implementations at startup. `AppAdapter` supplies host identity and capability interfaces such as `WorkspaceCapability` and `ThemeCapability`. Add capability contracts alongside their first product consumer, rather than building a generic adapter framework in advance.

- Group operations by a specific capability, such as workspace access (`WorkspaceCapability`). Do not grow one flat interface containing unrelated host operations.
- Keep browser file handles, Tauri imports, native paths, and host permission APIs inside the hosts. Shared code consumes domain values and opaque identifiers defined by its contracts.
- Detect support per capability. A `web` or `native` label alone does not establish that an operation is available.
- Define cancellation, unavailable capabilities, permission denial/revocation, and observable failures when introducing an operation. Do not silently substitute different storage semantics.
- Specify ownership and cleanup when a capability introduces subscriptions, watchers, or other resources. Host construction and React rendering must not create unmanaged side effects.
- Test shared behavior with supplied adapters and test real platform boundaries in their owning host.

## Initial platform scope

The immediate development targets are the web app in current desktop Chrome and Edge, and the Windows native app. The web MVP operates on user-selected existing folders via the File System Access API, rather than substituting browser-private storage. Folder access requires a secure context, supported File System Access APIs, and user-granted permissions. The native host uses Tauri's dialog and filesystem plugins.

Android and iOS remain planned targets of the same Tauri host. Their project initialization and toolchain prerequisites are documented by the native host; mobile builds and folder-access semantics require validation on those platforms before support is claimed. A shared web UI does not imply identical filesystem access across platforms.

The [File System Access API documentation](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker) covers the browser constraints. [Workspaces](specs/workspaces.md) specifies the detailed workspace semantics and document handling.

## Shared presentation

The shared package owns the base stylesheet exposed as `@vista/app/style.css`. It composes:

- `@import "@codenhub/styles/tw";` (pinned to `0.6.0`) for Tailwind CSS v4 itself plus Codenhub design tokens, layout primitives, and component classes. Since `0.5.0` this entrypoint imports Tailwind on its own, so the stylesheet MUST NOT also `@import "tailwindcss"`, which would emit Tailwind's Preflight twice.
- `@import "@codenhub/icons";` for base icon sizing and alignment rules.
- `@import "@codenhub/toaster/styles";` for the toast and confirmation dialog styles.

Class names use the Tailwind token utilities generated from the `@theme` tokens in `@codenhub/styles/tw` (for example `bg-surface`, `text-text-secondary`, and `border-border`). Components MUST NOT use arbitrary value classes that restate token variables, such as `bg-[var(--color-surface)]`.

Controls and surfaces use the `@codenhub/styles` component classes wherever one fits: `.btn` with its presentation, intent, size, `.icon`, and padding-step modifiers for every button (icon-only toolbar buttons included), `.card`/`.panel` for floating surfaces and dialogs, `.ipt` for text inputs, `.data-table` in `.table-wrap` for the CSV view, `.checkbox` for Markdown task items, `.divider`, `.loader`, `.hint`, and the typography utilities. Tailwind utilities are for layout only, never to re-skin a package component. Two surfaces stay custom because the package has no component for them: workspace tree rows, and the full-pane editors (the CodeMirror raw editor and the Markdown editor), which are document surfaces rather than form fields. The raw editor's CodeMirror theme in `raw-editor.tsx` reads the same token variables (`var(--color-*)`, `var(--font-mono)`), since CodeMirror styles its own DOM. Tooltips use the package's `.tooltip` composition through `packages/app/src/components/feedback/tooltip.tsx`, which adds the dismissal the package leaves to consumers (closing on click and Escape via `data-state="closed"`) and an end-aligned bottom variant (`.tooltip-end`, in `style.css`) for controls at the right edge of a header.

### Toasts and confirmations

Transient messages and modal confirmations use `@codenhub/toaster`, pinned to an exact version (`0.2.0`) in the pnpm catalog. It is a vanilla DOM library, so `packages/app/src/components/feedback/toast.tsx` wraps one toaster instance in a `ToastProvider` and exposes `useToast()` to React components. Toasts appear bottom-right with a close button and dismiss after 5 seconds. Confirmations use the library's native `<dialog>`. Components call the wrapper and never touch the DOM nodes the library creates.

Product icons use `@codenhub/icons` configured in Vite with `mode: "svg"`, which rewrites `<i class="ic-...">` elements into inline SVGs at build/transform time. Decorative icons are hidden with `aria-hidden="true"`; icon-only controls MUST have an accessible name (`aria-label` or visually-hidden text). The rewrite is a static, build-time text match: the `ic-*` class MUST appear as a literal string in `className`. An icon name computed at runtime (for example, a template string selecting between two icon names) is not detected and renders nothing; branch to two literal `<i className="ic-...">` elements instead.

### Responsive layout

The application shell (`ActivityBar`, `Sidebar`, `TabStrip`, `EditorPane`, `StatusBar` in `packages/app/src/app.tsx`) is responsive using Tailwind's default breakpoints, and is shared unchanged between the web host and the Tauri mobile targets named in [Initial platform scope](#initial-platform-scope):

- Below `md` (768px): `Sidebar` renders as a dismissible overlay drawer (`fixed`, off-canvas when closed) that opens beside the activity bar (`left-12`), over a backdrop. The backdrop sits at `z-30` and the drawer at `z-40`. `ActivityBar` is `relative z-50`, so it stays above both the backdrop and the drawer, and its Explorer toggle is always reachable for closing. The toggle is an Explorer tab: a folder icon that shows the panel's open/closed state via `aria-pressed` and swaps between `ic-folder`/`ic-folder-open`. Tapping the backdrop also closes the drawer. Selecting a file closes the drawer, since it covers the document underneath.
- `md` and above: `Sidebar` is the same persistent, in-flow column (narrower at `md`, full width at `lg` and above), but the same `ActivityBar` control still works: closing it collapses the column to zero width rather than overlaying content, and selecting a file no longer closes it, since it isn't covering anything.
- Default state: the explorer opens by default at `md` and above (`packages/app/src/domain/viewport.ts`, `isDesktopViewport()`). Below `md` it opens at startup only when no folder was restored, so a first-time or phone user sees the Open Folder controls immediately. When a folder is restored at startup, the drawer starts closed on phones.
- The editor area stays empty when no file is open. Opening a folder is done from the explorer, which offers "Open Folder" or "Reopen {name}" when a folder is remembered.
- `TabStrip` shows one tab per open document above `EditorPane` and scrolls horizontally when tabs overflow. Open documents live in a reducer in `packages/app/src/state/documents.ts`; [Tabs](specs/workspaces.md#tabs) specifies their behavior.
- `StatusBar` is a bottom bar that shows nothing when no file is open. With a file open it shows the raw editor's cursor and vim mode (only while the raw editor is shown), and the buffer's lines, size, line ending, format, and, for Markdown, word count. [Status bar](specs/workspaces.md#status-bar) specifies them. It does not show platform identity or encoding.

A Tauri mobile webview reports its real viewport dimensions, so this works through ordinary CSS media queries with no `platform === "native"` branching required.

### Commands and shortcuts

User actions with a keyboard shortcut are `Command` objects (`packages/app/src/commands`): an id, a label, an optional shortcut, whether it is enabled, and what it runs. `AppShell` builds the list from its state, and `useCommandShortcuts` installs one window `keydown` listener that runs the matching command. A disabled command still swallows its shortcut, so `Ctrl+S` with nothing to save never opens the browser's own Save dialog. Shortcuts are written like `Mod+Shift+S`, where `Mod` matches Ctrl or Cmd. The raw editor hands every command shortcut to this listener instead of handling the key itself, so a command wins over a CodeMirror or vim binding on the same key. Components MUST NOT add their own global shortcut listeners; the planned menu bar, context menus, and command palette read the same command list, so an action and its shortcut are defined once.

The commands are Save (`Mod+S`), Close Tab (`Mod+W` native, `Alt+W` web), Find (`Mod+F`), Replace (`Mod+H`), Go to File (`Mod+P`), and Go to Line (`Mod+G`). All of them are disabled while the unsaved-changes prompt is open. On macOS, `Cmd+H` is the system's Hide shortcut; since `Mod` also matches Ctrl, `Ctrl+H` opens Replace there, as does the find bar's disclosure button.

### Find

The find bar (`components/editor/find-bar.tsx`) owns the query and the UI and searches through a `FindTarget` (`components/editor/find-target.ts`), so it does not know which view it searches. The raw editor exposes a target over CodeMirror's search state (`raw-find.ts`), with CodeMirror's panel replaced by a hidden one, since its highlighting runs only while a panel is open. Rendered views share a DOM target (`dom-find.ts`) that walks the view's text and field values with the pattern from `domain/find.ts`.

Theming is managed via `@codenhub/theme`, supporting light and dark color schemes. The default color tokens provided by `@codenhub/styles` (`light-dark()`) are used without overriding base values, preserving room for future theme expansions.

## Hosting decision

Cloudflare Workers is **APPROVED**, with publishing and automatic deployment **not implemented**. Keep the existing local Worker scaffold and preview checks for development. Configure production accounts, credentials, deployment automation, and publication only when there is an actual app ready to publish. Their absence is intentional and does not block MVP development.

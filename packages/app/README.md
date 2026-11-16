# @vista/app

Shared Vista product package. It owns platform-neutral React UI and contracts consumed by the web and native hosts.

## API

The package root exports:

- `App`: shared React application shell. Pass an `AppAdapter` supplied by a platform host.
- `AppAdapter`: contract for capabilities supplied by a platform host.
- `AppPlatform`: supported host kind, currently `"web"` or `"native"`.
- `WorkspaceCapability`: contract for folder access, tree enumeration, and file reading, writing, and management. Hosts deal only in folders: they pick one, reopen or forget a remembered one by its id, and relate two of them; which folders form a workspace is the shared app's business. Every file operation names the folder it acts on. `resolveRelative`, `relativeLocation`, and `reveal` are optional, for hosts that can provide them.
- `RestoreFolderResult`: outcome of reopening a remembered folder by its id: `restored`, `needs-permission`, `unavailable`, or `none`.
- `LEGACY_FOLDER_ID`: the id under which a host keeps the single folder an earlier Vista remembered, so the app can turn it into a workspace once.
- `ThemeCapability`: contract for managing and observing light/dark theme preference.
- `WorkspaceFolder`: a folder the host gave access to, with its id, name, root path, and access mode. A workspace holds one or more of them.
- `FolderRelation`: how two folders relate: `same`, `contains`, `inside`, or `separate`.
- `FileStat`, `FileContents`, `WorkspaceError`, `WorkspaceErrorKind`: a file's version, its bytes with that version, and the error a write raises when the file changed on disk.
- `WorkspaceNode`: hierarchical tree node representing a file or directory, with its path relative to its folder's root.
- `FileDocument`: active document buffer with path, name, extension, content, and dirty flag.
- `WindowCapability`, `UpdaterCapability`, `AvailableUpdate`: optional host capabilities for the window and for updating the installed app.
- `ViewMode`: document presentation mode, `"raw"` or `"enriched"`.
- `getFileKind`, `normalizeExtension`, `supportsEnrichedView`: file-type helpers that classify a file, normalize its extension, and report whether its enriched view is available.
- `useTheme`, `getThemeInstance`: access to the theme state and the underlying theme manager.

The `@vista/app/style.css` subpath exports the shared base stylesheet. Import it from each host's CSS entrypoint and process it with Tailwind's Vite plugin. It includes Tailwind, `@codenhub/styles/tw`, `@codenhub/icons`, and the `@codenhub/toaster` styles.

Toasts and confirmation dialogs are provided internally by `ToastProvider` and `useToast()` on top of `@codenhub/toaster`. They are not exported. Hosts do not need to supply a toast capability.

Platform-specific browser and Tauri implementations must remain in their respective host applications.

## Icons

Icons are supplied by `@codenhub/icons` configured in Vite with `mode: "svg"`. In React components, render icon markup as `<i className="ic-<name>" aria-hidden="true" />`, which Vite transforms into inline SVG at build/transform time. Decorative icons use `aria-hidden="true"`; icon-only buttons need an accessible name on the button.

## Theming

Theming is powered by `@codenhub/theme` and `@codenhub/styles`. It defaults to system preference and supports explicit light and dark themes using the standard design tokens.

## Tests

Run `pnpm test --project app` from the repository root. Tests use Vitest with jsdom, React Testing Library, and jest-dom matchers. Use `@testing-library/user-event` for interactions and keep test files beside their components. `pnpm test:watch` and `pnpm test:coverage` work the same way.

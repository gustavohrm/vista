# @vista/app

Shared Vista product package. It owns platform-neutral React UI and contracts consumed by the web and native hosts.

## API

The package root exports:

- `App`: shared React application shell. Pass an `AppAdapter` supplied by a platform host.
- `AppAdapter`: contract for capabilities supplied by a platform host.
- `AppPlatform`: supported host kind, currently `"web"` or `"native"`.
- `WorkspaceCapability`: contract for folder access (opening, reopening the last folder), tree enumeration, and file reading, writing, and management.
- `RestoreFolderResult`: outcome of reopening the last folder: `restored`, `needs-permission`, `unavailable`, or `none`.
- `ThemeCapability`: contract for managing and observing light/dark theme preference.
- `Workspace`: workspace descriptor with ID, name, and root path.
- `WorkspaceNode`: hierarchical tree node representing a file or directory.
- `FileDocument`: active document buffer with path, name, extension, content, and dirty flag.
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

Run `pnpm --filter=@vista/app test` from the repository root. Tests use Vitest with jsdom, React Testing Library, and jest-dom matchers. Use `@testing-library/user-event` for interactions and keep test files beside their components. `test:watch` and `test:coverage` are also available.

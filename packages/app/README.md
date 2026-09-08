# @vista/app

Shared Vista product package. It owns platform-neutral React UI and contracts consumed by the web and native hosts.

## API

The package root exports:

- `App`: shared React application shell. Pass an `AppAdapter` supplied by a platform host.
- `AppAdapter`: contract for capabilities supplied by a platform host.
- `AppPlatform`: supported host kind, currently `"web"` or `"native"`.

The `@vista/app/style.css` subpath exports the shared base stylesheet. Import it from each host's CSS entrypoint and process it with Tailwind's Vite plugin. It includes Tailwind, scans the shared source for utility classes, sets the page background, and removes the body margin. Hosts may add host-specific styles in their own entrypoints.

Platform-specific browser and Tauri implementations must remain in their respective host applications.

`AppAdapter` currently contains only the platform label. Add narrow capability interfaces with their first feature consumer, following the [architecture rules](../../docs/specs/architecture.md). Do not import browser file handles or Tauri APIs into this package.

## Icons

Use named imports from `lucide-react` directly in shared components, such as `import { NotebookPen } from "lucide-react"`. Only imported icons are bundled. Decorative icons use `aria-hidden="true"`; icon-only buttons need an accessible name on the button. The icon library is shared product UI and does not need a platform adapter.

## Tests

Run `pnpm --filter=@vista/app test` from the repository root. Tests use Vitest with jsdom, React Testing Library, and jest-dom matchers. Use `@testing-library/user-event` for interactions and keep test files beside their components. `test:watch` and `test:coverage` are also available.

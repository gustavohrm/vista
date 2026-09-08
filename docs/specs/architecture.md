# Application architecture

**Status:** IMPLEMENTED
**Last updated:** 2026-09-08

Vista separates shared product code from platform hosts:

- `packages/app` is the home for shared React UI, features, state, domain behavior, and platform capability contracts. It currently provides the application shell and platform contract.
- `apps/web` boots the shared app at the browser boundary and contains a local Cloudflare Worker scaffold for testing the approved hosting target.
- `apps/native` boots the shared app at the Tauri boundary. Its single Tauri project targets desktop, Android, and iOS.

Platform hosts MUST keep browser- or Tauri-specific implementations outside `packages/app`. Shared code MUST consume future platform capabilities through narrow contracts. Add more workspace packages only when code has a proven independent responsibility or consumer.

## Platform adapters

The shared app owns capability interfaces; each host constructs and injects its implementations at startup. `AppAdapter` currently supplies only host identity. Add capability contracts alongside their first product consumer, rather than building a generic adapter framework in advance.

- Group operations by a specific capability, such as workspace access. Do not grow one flat interface containing unrelated host operations.
- Keep browser file handles, Tauri imports, native paths, and host permission APIs inside the hosts. Shared code consumes domain values and opaque identifiers defined by its contracts.
- Detect support per capability. A `web` or `native` label alone does not establish that an operation is available.
- Define cancellation, unavailable capabilities, permission denial/revocation, and observable failures when introducing an operation. Do not silently substitute different storage semantics.
- Specify ownership and cleanup when a capability introduces subscriptions, watchers, or other resources. Host construction and React rendering must not create unmanaged side effects.
- Test shared behavior with supplied adapters and test real platform boundaries in their owning host.

## Initial platform scope

The immediate development targets are the web app in current desktop Chrome and Edge, and the Windows native app. The web MVP must operate on user-selected existing folders, rather than substituting browser-private storage. Folder access requires a secure context, supported File System Access APIs, and user-granted permissions. Future workspace UI must explain unsupported capabilities and permission failures.

Android and iOS remain planned targets of the same Tauri host. Their project initialization and toolchain prerequisites are documented by the native host; mobile builds and folder-access semantics require validation on those platforms before support is claimed. A shared web UI does not imply identical filesystem access across platforms.

See the [File System Access API documentation](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker) for browser constraints. Exact filesystem operations and mobile storage behavior will be designed with the MVP workflows.

## Shared presentation

The shared package owns the base stylesheet exposed as `@vista/app/style.css`; each host runs Tailwind through its Vite plugin. Product icons use direct named imports from `lucide-react` in shared UI. Avoid an icon registry or wrapper until there is an actual need for one. Decorative icons are hidden from assistive technology; icon-only controls need accessible names.

## Hosting decision

Cloudflare Workers is **APPROVED**, with publishing and automatic deployment **not implemented**. Keep the existing local Worker scaffold and preview checks for development. Configure production accounts, credentials, deployment automation, and publication only when there is an actual app ready to publish. Their absence is intentional and does not block MVP development.

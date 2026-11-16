# @vista/web

Browser host and Cloudflare Workers deployment for the shared Vista app. Browser capability implementations belong in this host; shared UI consumes interfaces from `@vista/app`.

## Local development

Run commands from the repository root, with the toolchain the root README pins installed:

```sh
pnpm dev:web
pnpm build:web
pnpm --filter=@vista/web preview:worker
pnpm --filter=@vista/web deploy:check
```

Vite provides frontend development and hot reload. `preview:worker` builds fresh assets and runs Wrangler locally. `deploy:check` builds and validates the deployment bundle without publishing it. Pass a different port to Wrangler directly if the default port is occupied:

```sh
pnpm --filter=@vista/web exec wrangler dev --local --port 8798 --inspector-port 9248
```

`wrangler.json` serves the built frontend as a single-page application, including direct navigation and reload at nested URLs. The Worker (`src/worker.ts`) answers the release routes [Deployment](#deployment) lists and hands every other request to the asset binding. Introduce more server behavior only when a feature needs it.

## Tests

```sh
pnpm --filter=@vista/web exec playwright install chromium
pnpm --filter=@vista/web test:e2e
```

The browser suite in `tests/e2e/` builds the frontend, starts an isolated local Wrangler server on port 8799 with inspector port 9249, and tests the production output in Chromium. Those ports must be free. It covers startup and styles on a nested URL and after reload, tabs, the path bar, the editor chrome, menus and Markdown images, the CSV table, the responsive layout, and creating, renaming, and deleting files. Automation cannot drive the native folder picker, so the suite opens its fixture folders through the `webkitdirectory` fallback. Every test fails on a content security policy violation, through the shared fixture in `tests/e2e/test.ts`; the startup test also fails on a JavaScript error.

## Deployment

The web app is a Cloudflare Worker. A release deploys it: the release workflow, which [`docs/ci.md`](../../docs/ci.md#releases) describes, runs `pnpm deploy:web` with the repository's Cloudflare secrets. A merge to `main` does not deploy.

The Worker also serves the desktop releases from the R2 bucket bound as `RELEASES`: `/releases/latest.json` for the updater, `/releases/<version>/<file>` for installers, and `/download/windows`, `/download/linux` (the AppImage), `/download/deb`, and `/download/rpm` as links to the current installer. These paths are listed in `run_worker_first`, because otherwise a browser navigating to them gets the app's `index.html`. Anything else under `/releases/` is a 404, never the app. Every response, from the Worker or the static app, carries the security headers the [security guidelines](../../docs/guidelines/security.md#web-host-responses) describe. The absolute URLs in the manifest and the download redirects use `PUBLIC_ORIGIN` from `vars` in `wrangler.json`, never the request's host. Locally, `wrangler dev --local` simulates the bucket, empty until objects are put into it with `wrangler r2 object put --local`. Copy `.dev.vars.example` to `.dev.vars` so those URLs point at the local server; it assumes Wrangler's default port, 8787, so when `wrangler dev` runs on another one, set `PUBLIC_ORIGIN` to match.

`pnpm deploy:web` builds fresh frontend assets before invoking Wrangler. Deployment targets the Worker name in `wrangler.json`, currently `vista`, in the authenticated Cloudflare account.

For a manual deployment, authenticate with `pnpm --filter=@vista/web exec wrangler login` before running the deploy command. Confirm any existing Cloudflare Git integration before configuring another publisher.

Never put API tokens into source files or `VITE_*` environment variables. Keep local Worker secrets in ignored `.dev.vars` files and browser development configuration in ignored `.env` files. Client environment variables are public once bundled.

## Browser scope

Workspace support targets current desktop Chrome and Edge with File System Access APIs. Folder selection follows a user gesture in a secure context and is permission-aware. The workspace adapter (`src/workspace-adapter.ts`) detects whether the API is available, falls back to a `webkitdirectory` input where it is not, and reports cancellation, denied permission, and folders that are gone, as [Workspaces](../../docs/specs/workspaces.md#platform-specific-implementations) describes. Mobile browsers and browsers without folder APIs are not promised equivalent workspace access.

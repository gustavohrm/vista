# @vista/web

Browser host and Cloudflare Workers deployment for the shared Vista app. Browser capability implementations belong in this host; shared UI consumes interfaces from `@vista/app`.

## Local development

Run commands from the repository root after following the root README's toolchain setup:

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

`wrangler.json` serves the built frontend as a single-page application, including direct navigation and reload at nested URLs. Its small Worker currently forwards requests to the asset binding; introduce server behavior only when a feature needs it.

## Tests

```sh
pnpm --filter=@vista/web exec playwright install chromium
pnpm --filter=@vista/web test:e2e
```

The smoke test starts an isolated local Wrangler server on port 8799 with inspector port 9249 and tests the production frontend output. Those ports must be free. It checks application startup and styles on a nested URL and after reload. Feature routing is not implemented yet.

## Deployment

Cloudflare Workers hosting is **APPROVED**. Publication and automatic deployment are **not implemented** and are deferred until there is an actual app to publish. The existing Wrangler configuration, local preview, and dry-run commands are development scaffolding; no publishing workflow is enabled.

`pnpm deploy:web` builds fresh frontend assets before invoking Wrangler. Deployment targets the Worker name in `wrangler.json`, currently `vista`, in the authenticated Cloudflare account.

When publishing becomes in scope, select the Cloudflare account and deployment trigger explicitly. For manual deployment at that time, authenticate with `pnpm --filter=@vista/web exec wrangler login` before running the deploy command. Confirm any existing Cloudflare Git integration before configuring another publisher.

Never put API tokens into source files or `VITE_*` environment variables. Keep local Worker secrets in ignored `.dev.vars` files and browser development configuration in ignored `.env` files. Client environment variables are public once bundled.

## Browser scope

Initial workspace support targets current desktop Chrome and Edge with File System Access APIs. Folder selection must follow a user gesture in a secure context and remain permission-aware. Feature detection and unavailable/denied/cancelled outcomes belong to the future workspace adapter. Mobile browsers and browsers without folder APIs are not promised equivalent workspace access.

# Security

## Reporting a vulnerability

Report it privately through [GitHub's private vulnerability reporting](https://github.com/gustavohrm/vista/security/advisories/new), not in a public issue. Describe the impact, the commit you found it in, and include the smallest reproduction you have.

## What matters most

Vista reads and writes the user's own folders, and the notes and documents in them are private. The reports that matter most are the ones that let something outside the user's intent reach that data:

- **Folder access.** On the web, access comes only from the folder the user picks, through the File System Access API and the browser's permission prompt, or through the `webkitdirectory` input fallback (`apps/web/src/workspace-adapter.ts`). On desktop and mobile, the Tauri capabilities in `apps/native/src-tauri/capabilities/default.json` grant the dialog and filesystem permissions, and `tauri-plugin-persisted-scope` keeps the granted folders across restarts. A report that widens access beyond a folder the user granted, or that bypasses the webview's content security policy in `apps/native/src-tauri/tauri.conf.json`, is in scope.
- **Note content.** A report that causes note or document content to leave the device, or to be read by another origin or another workspace, is in scope.
- **The web host.** `apps/web` is served as static assets by a Cloudflare Worker (`apps/web/wrangler.json`). Hosting on Cloudflare Workers is approved; production deployment is not yet set up.
- **Build-time configuration.** Any environment variable with the `VITE_` prefix is compiled into the browser bundle, so it is public. Secrets do not belong in one.

[Architecture](docs/architecture.md#platform-adapters) describes where browser- and Tauri-specific code is kept, and [Initial platform scope](docs/architecture.md#initial-platform-scope) describes the folder-access requirements.

## Supported versions

Vista has no releases yet. Fixes land on `main`.

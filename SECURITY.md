# Security

## Reporting a vulnerability

Report it privately through [GitHub's private vulnerability reporting](https://github.com/gustavohrm/vista/security/advisories/new), not in a public issue. Include the version or commit you found it in, the impact, and the smallest reproduction you have. Remove secrets, tokens, and personal data, including note content, from anything you paste.

A report is acknowledged on GitHub, and the advisory stays private until the vulnerability is fixed.

A vulnerability in a dependency that Vista uses goes to that dependency's maintainers. If you are not sure which side it is on, report it here.

## What matters most

Vista reads and writes the user's own folders, and the notes and documents in them are private. The reports that matter most are the ones that let something outside the user's intent reach that data:

- **Folder access.** On the web, access comes only from the folder the user picks, through the File System Access API and the browser's permission prompt, or through the `webkitdirectory` input fallback (`apps/web/src/workspace-adapter.ts`). On desktop and mobile, the Tauri capabilities in `apps/native/src-tauri/capabilities/default.json` grant the dialog and filesystem permissions, `tauri-plugin-persisted-scope` keeps the granted folders across restarts, and on desktop only, `capabilities/desktop.json` grants the updater, restarting the app after an update, and `tauri-plugin-opener` just `opener:allow-reveal-item-in-dir`, to show an entry in the file manager. A granted folder's scope includes its dot entries, such as `.vista`, on every platform. A workspace's `.vista/workspace.json` lists its other folders by relative location, but opening it never grants access to them: on desktop each must already be in the granted scope, and on the web each is picked by the user. A report that widens access beyond a folder the user granted, or that bypasses the webview's content security policy in `apps/native/src-tauri/tauri.conf.json`, is in scope.
- **Note content.** A report that causes note or document content to leave the device, or to be read by another origin or another workspace, is in scope.
- **The web host.** `apps/web` is a Cloudflare Worker (`apps/web/wrangler.json`) that serves the web app and the desktop releases, deployed by the release workflow. A report that bypasses the content security policy it sends (`apps/web/src/security-headers.ts`) is in scope.
- **Desktop updates.** The desktop app checks `https://vista.coden.dev/releases/latest.json` for updates and installs a download only when its signature matches the public key in `apps/native/src-tauri/tauri.conf.json`. A report that gets an update installed without a valid signature is in scope.
- **Build-time configuration.** Any environment variable with the `VITE_` prefix is compiled into the browser bundle, so it is public. Secrets do not belong in one.

[Architecture](docs/architecture.md#platform-adapters) describes where browser- and Tauri-specific code is kept, and [Platform scope](docs/architecture.md#platform-scope) describes the folder-access requirements.

## Supported versions

Only the latest release is supported. Fixes land on `main` and ship in the next release; the desktop app offers it through its updater.

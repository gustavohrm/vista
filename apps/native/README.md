# @vista/native

Tauri host for the shared Vista app. Windows is the primary platform and Linux the second; CI builds both installers on every change. macOS is not built or tested. Android and iOS are prepared through this same project, with device validation still required.

## Setup

Run every command below from the repository root. The root README says where the pinned Node and pnpm versions are declared. Install them, then run `pnpm install --frozen-lockfile`.

Install [Tauri's platform prerequisites](https://v2.tauri.app/start/prerequisites/) and Rust through rustup. The root `rust-toolchain.toml` selects the Rust version and includes rustfmt and Clippy. On Windows, install Microsoft C++ Build Tools with the Desktop development with C++ workload and WebView2. On Debian or Ubuntu, install `libwebkit2gtk-4.1-dev libxdo-dev libssl-dev librsvg2-dev patchelf file` and a C toolchain such as `build-essential`; this is the list the `Desktop (Linux)` CI job installs.

```sh
pnpm --filter=@vista/native tauri info
pnpm dev:native
pnpm --filter=@vista/native build:desktop
```

`pnpm build:native` builds only the shared frontend. `build:desktop` compiles Rust and creates native bundles: the NSIS installer on Windows, and `.deb`, `.rpm`, and AppImage on Linux, under `src-tauri/target/release/bundle/`. The app's version comes from `apps/native/package.json`, which `tauri.conf.json` names, and `pnpm versions:check` keeps it equal to the other manifests and `Cargo.toml`. For a local executable without installers, use `pnpm --filter=@vista/native build:desktop --no-bundle`.

Releases are built and published by the release workflow, which [`docs/ci.md`](../../docs/ci.md#releases) describes. The updater checks `https://vista.coden.dev/releases/latest.json`, the endpoint in `tauri.conf.json`, at startup and verifies each download against the public key in `tauri.conf.json`. To create the key pair, run `pnpm --filter=@vista/native tauri signer generate -w ~/.tauri/vista.key`, put the public key in `tauri.conf.json`, and store the private key and its password as the `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets. Never commit the private key.

Native checks are separate from the frontend checks:

```sh
pnpm --filter=@vista/native format:rust:check
pnpm --filter=@vista/native lint:rust:check
```

## Mobile preparation

Generated mobile projects under `src-tauri/gen` are ignored and must be initialized on each development machine. Do not store durable platform customizations only in ignored generated files; move required settings into checked-in Tauri configuration or explicitly adopt a tracked customization workflow when needed.

For Android, install Android Studio, the SDK, NDK and Java requirements, configure `JAVA_HOME`, `ANDROID_HOME` and `NDK_HOME`, and install the Android Rust targets listed in Tauri's prerequisites. Then:

```sh
pnpm --filter=@vista/native tauri android init
pnpm --filter=@vista/native dev:android
pnpm --filter=@vista/native build:android
```

For iOS, use macOS with Xcode, its command-line tools, CocoaPods, and the iOS Rust targets listed in Tauri's prerequisites. Configure the Apple development team when a device build requires signing. Then:

```sh
pnpm --filter=@vista/native tauri ios init
pnpm --filter=@vista/native dev:ios
pnpm --filter=@vista/native build:ios
```

Mobile folder access is not supported yet. `@tauri-apps/plugin-dialog` has no folder picker on Android or iOS, so opening, remembering, and restoring folders is desktop-only until mobile folder access and platform permissions are designed and tested. Desktop paths and browser folder handles are not a cross-platform storage contract. App-store distribution and operating-system code signing are not set up: installers are signed for the updater only, so Windows SmartScreen may warn on first install.

## Host boundary and security

Tauri integrations belong in this host. The workspace capability uses `@tauri-apps/plugin-dialog` for folder selection and `@tauri-apps/plugin-fs` for file access. `tauri-plugin-persisted-scope` keeps the folder scope granted by the picker across restarts, so the last folder can be reopened. Grant permissions only for implemented capabilities. The default capability (`src-tauri/capabilities/default.json`) grants Tauri core operations, dialog, the filesystem operations the workspace uses (read directory, read and write files as bytes, stat, exists, mkdir, remove, and rename), and destroying the window, which closes it once unsaved edits are answered for, to the main window.

The production content security policy allows bundled scripts and styles, inline styles, local/data images, and Tauri IPC. The development policy additionally allows Vite's inline React bootstrap and WebSocket hot reload. Expand policies only alongside the feature that requires the new source; keep development exceptions out of production.

The app identifier is `com.coden.vista`. Keep it stable once users have installed the app, as changing identifiers can affect application identity and stored data.

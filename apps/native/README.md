# @vista/native

Tauri host for the shared Vista app. Windows is the verified development target; Android and iOS are prepared through this same project, with device validation still required.

## Setup

Run every command below from the repository root. The root README says where the pinned Node and pnpm versions are declared. Install them, then run `pnpm install --frozen-lockfile`.

Install [Tauri's platform prerequisites](https://v2.tauri.app/start/prerequisites/) and Rust through rustup. The root `rust-toolchain.toml` selects the Rust version and includes rustfmt and Clippy. On Windows, install Microsoft C++ Build Tools with the Desktop development with C++ workload and WebView2.

```sh
pnpm --filter=@vista/native tauri info
pnpm dev:native
pnpm --filter=@vista/native build:desktop
```

`pnpm build:native` builds only the shared frontend. `build:desktop` compiles Rust and creates native bundles. For a local executable without installers, use `pnpm --filter=@vista/native build:desktop --no-bundle`.

Native checks are separate from the frontend checks:

```sh
pnpm --filter=@vista/native format:rust:check
pnpm --filter=@vista/native lint:rust:check
pnpm --filter=@vista/native test:rust
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

Mobile folder access is not supported yet. `@tauri-apps/plugin-dialog` has no folder picker on Android or iOS, so opening, remembering, and restoring folders is desktop-only until mobile folder access and platform permissions are designed and tested. Desktop paths and browser folder handles are not a cross-platform storage contract. App-store distribution, signing and automatic updates belong to beta preparation.

## Host boundary and security

Tauri integrations belong in this host. The workspace capability uses `@tauri-apps/plugin-dialog` for folder selection and `@tauri-apps/plugin-fs` for file access. `tauri-plugin-persisted-scope` keeps the folder scope granted by the picker across restarts, so the last folder can be reopened. Grant permissions only for implemented capabilities. The default capability (`src-tauri/capabilities/default.json`) grants Tauri core operations, dialog, and the filesystem operations the workspace uses (read directory, read and write text files, exists, mkdir, remove, and rename) to the main window.

The production content security policy allows bundled scripts and styles, inline styles, local/data images, and Tauri IPC. The development policy additionally allows Vite's inline React bootstrap and WebSocket hot reload. Expand policies only alongside the feature that requires the new source; keep development exceptions out of production.

The app identifier is `com.coden.vista`. Keep it stable once users have installed the app, as changing identifiers can affect application identity and stored data.

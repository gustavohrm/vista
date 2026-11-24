---
status: DRAFT
last_updated: 2026-11-24
scope: Repo-wide direction for Vista, limited to work already stated in the repository's docs and READMEs.
---

# Roadmap

## Purpose

Durable direction for Vista: the current focus, what is planned, what is possible later, and what has been ruled out. Every entry below is taken from a document in this repository, and the source is cited. Nothing here is a new commitment. What Vista does today is in [Workspaces](specs/workspaces.md), not here.

## Current Focus

- None at the moment. The next focus is chosen from [Planned](#planned).

## Planned

- **Workspace search.** Searching inside file contents, in its own view behind the left rail's **Search** button, which is shown disabled with `Coming soon`. Finding a file by name is already the go-to picker. Source: `docs/specs/workspaces.md`, "Shell layout" and "Go to file and line".
- **Graph view and backlinks.** The rail's **Graph** button is shown disabled with `Coming soon`. Sources: `docs/specs/workspaces.md`, "Shell layout"; `README.md`.
- **Data export.** Source: `README.md`.
- **Moving files between workspace folders.** Moves work within one folder until the host contract gains a copy between folders. Source: `docs/specs/workspaces.md`, "Folder rules".
- **More file formats.** `.json`, `.yaml`, canvas representations, and embedded graph links. Source: `docs/specs/workspaces.md`, "Supported formats & view modes".
- **More interface themes.** Midnight, Forest, Ember, and Cappuccino, beside Daylight, Neutral, and Ocean. Source: `docs/specs/appearance.md`, "Themes".
- **Interface languages.** English, Brazilian Portuguese, and Spanish, chosen in Settings or detected from the system, with dates and numbers following the language. Fully translated only once failures carry a kind instead of platform text. Sources: `docs/specs/languages.md`; `docs/specs/errors.md`, "Direction".
- **Mobile folder access (Android and iOS).** The Tauri host builds for both, but opening, remembering, and restoring folders is desktop-only until mobile folder access and platform permissions are designed and tested. Support is not claimed before validation on those platforms. Sources: `apps/native/README.md`, "Mobile preparation"; `docs/architecture.md`, "Platform scope".
- **App-store distribution and operating-system code signing for the native app.** Installers are signed for the updater, not by a code-signing certificate, and are not in any app store. Source: `apps/native/README.md`.

## Later / Possible

- **Workspace support in other desktop browsers.** The web host targets current desktop Chrome and Edge; other browsers get the `webkitdirectory` fallback. Source: `apps/web/README.md`, "Browser scope".
- **macOS builds.** macOS is not built or tested. Sources: `docs/architecture.md`, "Platform scope"; `docs/ci.md`, "Not covered yet".

## Not Planned

- **Byte-for-byte Markdown round-trip.** No WYSIWYG editor guarantees it. Re-serializing untouched content can normalize list markers, such as `-` and `+` becoming `*`. The project treats this as intentional normalization, not data loss, and asserts the accepted cases in `packages/app/src/components/editor/markdown-round-trip.test.ts`. Source: `docs/specs/workspaces.md`, "Known limitation".
- **Browser-private storage in place of user folders.** The web host operates on user-selected folders through the File System Access API rather than substituting browser-private storage. Source: `docs/architecture.md`, "Platform scope".
- **Equivalent workspace access in mobile browsers and browsers without folder APIs.** These are not promised equivalent access, because folder access depends on the File System Access API. Sources: `apps/web/README.md`; `docs/architecture.md` ("A shared web UI does not imply identical filesystem access across platforms").

## References

- `README.md`: what Vista does and its planned capabilities.
- `docs/architecture.md`: platform scope and the hosting decision.
- `docs/specs/workspaces.md`: what is built, its known limitations, and the formats still to come.
- `docs/specs/appearance.md`: the themes still to ship.
- `apps/native/README.md`: mobile limits and distribution.
- `apps/web/README.md`: browser targets.

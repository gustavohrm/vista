---
status: DRAFT
last_updated: 2026-11-25
scope: Repo-wide direction for Vista, limited to work stated in the repository's docs and READMEs or set by the owner for a release.
---

# Roadmap

## Purpose

Durable direction for Vista: the current focus, what is planned, what is possible later, and what has been ruled out. Every entry below cites its source: a document in this repository, or the owner's direction for a release whose spec is not written yet. Nothing here is a commitment beyond that source. What Vista does today is in [Workspaces](specs/workspaces.md), not here.

## Current Focus

Release 0.0.4, set by the owner. The order follows what each outcome depends on: text written after the languages land is translated as it is written, rather than written in English and reworked, and the failure messages wait on a dependency.

1. **More interface themes.** Midnight, Forest, Ember, and Cappuccino, beside Daylight, Neutral, and Ocean. Independent of the others. Source: `docs/specs/appearance.md`, "Themes".
2. **Customizable keyboard shortcuts.** Source: the owner, for 0.0.4; needs a spec.
3. **One site in three parts.** `vista.coden.dev` becomes a landing page, the app moves to `vista.coden.dev/app`, and `vista.coden.dev/docs` holds articles, guides, and the full changelog. The release routes, `/releases/*`, stay where they are, because every installed app checks them for updates, and so do the download links, `/download/*`, because the app and links already shared point at them. The app stays on the same domain, because the browser keeps remembered folders and settings per domain. Changes the hosting decision in `docs/architecture.md`; needs a spec. Source: the owner, for 0.0.4.
4. **Workspace search.** Searching inside file contents, in its own view behind the left rail's **Search** button, with filters by folder, file type, and date, regular expressions, and replace across files. Needs a spec. Sources: `docs/specs/workspaces.md`, "Shell layout"; the owner, for 0.0.4.
5. **Interface languages.** English, Brazilian Portuguese, and Spanish, chosen in Settings or detected from the system, with dates and numbers following the language, and each release's changelog entry in all three. Every text but failure messages is translated first. Source: `docs/specs/languages.md`.
6. **A polished Settings screen**, and interface polish elsewhere. Source: the owner, for 0.0.4.
7. **Failures shown in Vista's own words.** Adapters report a failure kind and the shared app shows its own message for it, so no platform text reaches the interface, through `@codenhub/error`. It completes the languages. It waits on that package letting an adapter name a failure without wording it, [codenhub/codenhub#676](https://github.com/codenhub/codenhub/issues/676), so that the web and desktop adapters report a failure the same way. Source: `docs/specs/errors.md`, "Direction".

## Planned

- **Graph view and backlinks.** The rail's **Graph** button is shown disabled with `Coming soon`. Sources: `docs/specs/workspaces.md`, "Shell layout"; `README.md`.
- **Data export.** Source: `README.md`.
- **Moving files between workspace folders.** Moves work within one folder until the host contract gains a copy between folders. Source: `docs/specs/workspaces.md`, "Folder rules".
- **More file formats.** `.json`, `.yaml`, canvas representations, and embedded graph links. Source: `docs/specs/workspaces.md`, "Supported formats & view modes".
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
- `docs/specs/languages.md` and `docs/specs/errors.md`: the languages and the failure messages they depend on.
- `apps/native/README.md`: mobile limits and distribution.
- `apps/web/README.md`: browser targets.

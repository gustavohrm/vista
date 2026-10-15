---
status: DRAFT
last_updated: 2026-10-15
scope: Repo-wide direction for Vista, limited to work already stated in the repository's docs and READMEs.
---

# Roadmap

## Purpose

Durable direction for Vista: what is planned, what is possible later, and what has been ruled out. Every entry below is taken from a document in this repository, and the source is cited. Nothing here is a new commitment.

## Current Focus

None recorded.

## Planned

- **Mobile folder access (Android and iOS).** Mobile targets remain planned for the Tauri host, but opening, remembering, and restoring folders is desktop-only until mobile folder access and platform permissions are designed and tested. Support is not claimed before validation on those platforms. Sources: `apps/native/README.md` ("Mobile folder access is not supported yet"); `docs/architecture.md` ("remain planned targets").
- **Backlinks, folder search, and data export.** Listed as planned capabilities. Source: `README.md` ("Planned capabilities include ... backlinks, folder search, and data export").
- **Beta preparation for the native app.** App-store distribution, signing, and automatic updates belong to beta preparation. Source: `apps/native/README.md`.
- **Cloudflare Workers publication and automatic deployment.** Deferred until there is an app ready to publish. The local Worker scaffold and dry-run checks exist for development. Sources: `docs/architecture.md` ("Cloudflare Workers is APPROVED, with publishing and automatic deployment not implemented"); `apps/web/README.md`; `README.md`; `CONTRIBUTING.md`.
- **Additional file formats.** Future versions will expand to `.json`, `.yaml`, canvas representations, and embedded graph links. Source: `docs/specs/workspaces.md` ("Future versions will expand to ...").

## Later / Possible

- **Multi-root workspaces.** Only one folder is active in v1. The capability contract and state models use opaque identifiers and collections so multi-root support is not blocked later. Source: `docs/specs/workspaces.md`. This is a design accommodation, not a commitment.
- **Feature routing in the web host.** Source: `apps/web/README.md` ("Feature routing is not implemented yet.").
- **Workspace support in other desktop browsers.** The web host's initial target is current desktop Chrome and Edge. Source: `apps/web/README.md`.

## Not Planned

- **Byte-for-byte Markdown round-trip.** No WYSIWYG editor guarantees it. Re-serializing untouched content can normalize list markers, such as `-` and `+` becoming `*`. The project treats this as intentional normalization, not data loss, and asserts the accepted cases in `packages/app/src/components/editor/markdown-round-trip.test.ts`. Source: `docs/specs/workspaces.md`, "Known limitation".
- **Browser-private storage in place of user folders.** The web MVP operates on user-selected folders through the File System Access API rather than substituting browser-private storage. Source: `docs/architecture.md`, "Initial platform scope".
- **Equivalent workspace access in mobile browsers and browsers without folder APIs.** These are not promised equivalent access, because folder access depends on the File System Access API. Sources: `apps/web/README.md`; `docs/architecture.md` ("A shared web UI does not imply identical filesystem access across platforms").

## Notes

- `README.md` lists "rich Markdown editing" and "structured CSV views" as planned. `docs/specs/workspaces.md` describes a WYSIWYG Markdown editor and a CSV table editor as implemented, so neither is carried above. The `packages/app` source has both (`markdown-editor.tsx`, `csv-table-editor.tsx`).
- "Product features are not implemented yet" (`README.md`) is a general status statement. Individual implemented features are described in `docs/specs/workspaces.md`.

## References

- `README.md` — project status and planned capabilities.
- `docs/architecture.md` — platform scope and the Cloudflare decision.
- `docs/specs/workspaces.md` — v1 scope, known limitations, future formats.
- `apps/native/README.md` — mobile limits and beta preparation.
- `apps/web/README.md` — web host status and browser targets.

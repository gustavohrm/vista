---
status: IMPLEMENTED
last_updated: 2026-11-26
scope: The changelog under docs/changelog/, the check that holds a release to it, and where its entries are shown.
---

# Changelog

This document defines how Vista records what each release changes, and where that record is shown. `docs/changelog/` is the one source: the app, the updater manifest, and the GitHub release all read the same pages, so a change is described once, in the repository, and reviewed with the pull request that makes the release. Decided in [#36](https://github.com/gustavohrm/vista/issues/36), after the format [`codenhub/codenhub`](https://github.com/codenhub/codenhub) uses for its packages.

## Pages

```text
docs/changelog/
  index.md   # the published versions, newest first, and nothing else
  0.2.0.md
  0.1.0.md
  pt-BR/
    0.2.0.md # the 0.2.0 entry, translated
  es/
    0.2.0.md
```

Each released version has a page named for its exact version string, `0.2.0.md` or `1.0.0-beta.1.md`, which is the version in `package.json` and in the release tag without its `v`. A version number is not a word, so the page is not kebab-cased.

Each entry is also written in each of the interface's other languages, in a folder named for the language, as [Languages → The changelog](languages.md#the-changelog) describes: what a translated page holds, and that a version from before translations shows in English. The index lists versions, not languages, so the folders have no index; a translated page is published when its English page is.

### The index decides what is published

`index.md` sets `title: Changelog`, has the `# Changelog` heading, and then lists one link per published version, newest first:

```markdown
- [0.2.0](0.2.0.md)
- [0.1.0](0.1.0.md)
```

Only the pages it links are published: the app shows those and no others. Each version page carries its own date and summary, so the index does not repeat them. Keep every released version linked. A link is one line, and dropping one hides that version's changes from every surface. Drop one only when keeping it visible would mislead more than help, and never delete the page.

### A version page

Its frontmatter sets three fields:

- `title`: the version, the same as the file name without `.md`.
- `date`: the release date, as `YYYY-MM-DD`.
- `description`: one sentence on what the release changes for a user. The update offer and About show it before anything else, so it is written for someone deciding whether to install.

Then the `# {version}` heading, and the changes under the [Keep a Changelog](https://keepachangelog.com/) headings that apply, in this order: `## Added`, `## Changed`, `## Deprecated`, `## Removed`, `## Fixed`, `## Security`. Under each, a short bullet list. Describe each change from the user's side, meaning what they can now do or what stopped going wrong, not which files moved.

A bullet for a change that resolves an issue SHOULD end with a link to it, as a full URL: GitHub links a bare `#123` in release notes but not in a Markdown file in the repository, where the page is also read. The app shows a link as its text only, because the desktop app opens no web pages. Inline code spans are shown as code; other Markdown is shown as written, so a bullet keeps to plain sentences and code spans.

```markdown
---
title: 0.2.0
date: 2026-12-01
description: Large folders open faster, and CSV files keep their quoted cells.
---

# 0.2.0

## Changed

- Large folders open faster.

## Fixed

- Saving a CSV file keeps `"quoted"` cells as written. ([#12](https://github.com/gustavohrm/vista/issues/12))
```

### No "Unreleased" page

An entry is written in the pull request that raises the version, which [Contributing](../../CONTRIBUTING.md#deployment-and-releases) describes, and the release tag names a commit that already has it. A running "Unreleased" page was rejected: it is a second place to keep in step, and it makes the entry something to rename at release time rather than something reviewed with the version it describes. Entries are written by hand. A script that drafts one from the commits since the last tag was not added: commit subjects say what changed in the code, which an entry must restate for users anyway, and the drafting step would be one more thing a release depends on.

### The header

These pages carry the fields above instead of the `status` and `last_updated` header [the documentation guidelines](../guidelines/documentation.md#required-header) require. A page records a release; it has no status that changes, and its date is the release date. The exception is permanent, covers `docs/changelog/` only, and is recorded beside the rule it bypasses. `docs/README.md` lists the index, not each version page.

## The check

`pnpm changelog:check` runs `scripts/changelog.mjs check`, which holds the entry for the version in `package.json` to this format. It fails when:

- `index.md` is missing, or links a page that does not exist;
- the version has no page, or the index does not link it, or lists another version first;
- the page's `title` is not the version, its `date` is not a real `YYYY-MM-DD` date, or its `description` is empty or `TODO`;
- the page has a heading other than the six above, a heading with no bullets, no bullets at all, or a bullet that starts with `TODO`, and a heading deeper than `##` counts as one other than the six;
- the page has no `# {version}` heading, or its `##` headings are out of the order above or repeated;
- any item of `index.md`, for any version, is not a link to a version page, since it would drop that version from every surface;
- a translation of the version is missing, or does not match the English page as [Languages → The changelog](languages.md#the-changelog) lists.

Keeping every released version linked is otherwise a review rule: removing a correct link fails nothing, because dropping one is sometimes right, as [The index decides what is published](#the-index-decides-what-is-published) says.

Only the current version's page is checked. An older page that was written before a rule existed is brought in line when it is next edited, rather than failing every run. `pnpm verify` runs the check, so the pull request that raises the version fails without its entry. The release workflow runs it again, in `Check the tag`, before anything is built, so a tag cannot publish a version that has no entry.

## Where entries are shown

The app shows each entry in the interface language, from its translated page, and the English page whole for a version with no translation in that language. GitHub shows the English page.

- **In the app.** `packages/app/src/changelog.ts` inlines `docs/changelog/` at build time, translated pages included, so each build carries the entries up to its own version, in the browser and on the desktop, and reads them without a network request. **About** in Settings shows the running version's release date and summary, and **What's New** opens the entry, as [the workspace spec](workspaces.md#settings) describes. In the browser, the start screen's desktop download names the version it downloads, which is the running one, since a release deploys the web app. The release deploys the web app a moment before it publishes `latest.json`, which the download links follow, so for that moment, or until a rerun if the manifest upload fails, the label names the new version beside the previous installer. Reading the version from the manifest instead would cost a request on every start for that window alone.
- **In the update offer.** A newer version cannot be in the running build, so `scripts/release-manifest.mjs` writes the entry's `description` into the `notes` field of `latest.json`, and each translated page's `description` into a `vista_notes` object, by language, as `{ "pt-BR": "…", "es": "…" }`. The desktop updater passes `notes` to the app, and the native adapter reads `vista_notes` from the manifest as served, since the updater does not know the field. The offer and the update notice show the summary in the interface language, or `notes` when there is none in it, as plain text.
- **On GitHub.** The release workflow's last job creates the GitHub release for the tag with the entry's body and a link to the downloads, as a prerelease for a version with a suffix. The installers are not attached: they are served from the web app's host, as [Architecture](../architecture.md#hosting-decision) records.

A public `/changelog.json` route on the Worker was considered and not added: every surface above already has the entries, and the Worker's R2 copy would not do, since [retention](../ci.md#releases) keeps only the newest version folder before 1.0. A surface that needs entries the running build lacks, such as a website page, can add the route then.

## Parsing

`packages/app/src/domain/changelog.ts` reads the pages for both the app and `scripts/changelog.mjs`, so what the check accepts is what the app shows. It imports nothing and uses only erasable TypeScript, because the script loads it through Node.js type stripping. Its frontmatter reader takes flat `key: value` lines only, which is all a page carries.

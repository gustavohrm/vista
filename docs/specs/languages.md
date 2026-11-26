---
status: APPROVED
last_updated: 2026-11-23
scope: The interface languages, how one is chosen, stored, and applied, which text is translated and which is not, how changelog entries are translated, how dates and numbers follow the language, and how translations are written, reviewed, and tested.
---

# Languages

This document makes Vista's interface available in more than one language. It is approved and partly implemented: the language starts before the first render, is chosen in Settings → Language, and is stored as described below; the interface text is in the dictionaries with its tests; and the dates and numbers follow the language. Messages that report a failed operation, such as `Failed to open the selected folder.`, are still English literals in `packages/app`, because the [Errors direction](errors.md#direction) rewrites them; they move into the dictionaries with it. The editor's phrases and the translated changelog are not implemented yet.

## The languages

Vista ships in three languages:

| Locale  | Shown in the picker as | Role                                                     |
| ------- | ---------------------- | -------------------------------------------------------- |
| `en`    | English                | The default, the source text, and the fallback for gaps. |
| `pt-BR` | Português (Brasil)     | Translated from `en`.                                    |
| `es`    | Español                | Translated from `en`, written as neutral Spanish.        |

Each language is named in itself, so a user who cannot read the current language can still find their own.

Spanish is one `es` dictionary rather than one per region, since Vista's interface text has few words that differ between regions. A visitor from Mexico (`es-MX`) or Spain (`es-ES`) gets `es`. Portuguese is `pt-BR` because that is the variant the project can review; a Portuguese visitor (`pt-PT`) gets `pt-BR`, since the same language in the same script serves them better than English. A regional dictionary can be added later and only needs the words that differ, as the package's regional fallback describes.

## Choosing the language

The first of these that gives one of the three languages wins:

1. The language the user chose in Settings.
2. The operating system's or browser's languages, most preferred first, as the webview reports them in `navigator.languages`.
3. English.

A user who never chooses keeps following the system, including when the system's language changes or a later version adds their language. Choosing a language fixes it from then on, until the user chooses _System_ again.

The choice lives in the **Language** section of [Settings](workspaces.md#settings), among the **Vista** sections, between Appearance and Editor. It has one row, **Language**, a list of _System_ followed by the three languages in their own names. _System_ is the default and follows the system's languages as described above, and changes with them; it shows which language it gives, as in _System (Español)_. A chosen language is selected when one is saved, and _System_ otherwise. A change applies at once, with no restart: every visible text, tooltip, and accessible name changes, and open documents, tabs, and dialogs keep their state.

### Alternatives considered

- **No _System_ entry.** Rejected: once a user picked a language, nothing would let them follow the system again, and it would differ from Appearance, where every preference has _System_.
- **Vista storing the choice itself in `vista.settings`, with the binding's `persistLocale: false`.** Rejected: it works around `@codenhub/i18n` rather than fixing it, and keeps the choice in a second store beside the one the binding owns. The binding gained what _System_ needs instead, as [Dependency](#dependency) records.
- **The language as a row in Appearance.** Rejected: Appearance is how the interface looks, and a user looking for the language would not look there first.

## Storage

The choice is saved by `@codenhub/i18n`'s browser binding in `localStorage`, with `storageKey: "vista-locale"`, as `{"locale":"pt-BR"}`, named after `vista-theme`, which `@codenhub/theme` owns the same way. Only a language the user chooses, through the manager's `i18n.setLocale()`, which the binding observes and saves, is saved; a detected language is not, so it is detected again at each start. Choosing _System_ calls `binding.switchToSystemLocale()`, which removes the saved choice and switches to the detected language. The picker shows _System_ selected while `binding.isUsingSystemLocale` is `true`. While it is, the binding also follows the browser's `languagechange` event, so a system language change applies without a restart.

Choosing the language already shown is a choice like any other and is saved: a user who picks English while English was detected keeps English after changing the system's language. If _System_ fails to load the detected language, the saved choice is already forgotten and the interface keeps its current language, with _System_ selected; the next start, or the next system language change, tries again.

If removing the saved choice fails while storage can still be read, the binding warns and follows the system for the rest of the session, but the old choice stays saved, so the next start reads it again and the user chooses _System_ again.

Both hosts keep this in the webview's `localStorage`, as they already do for `vista-theme`, `vista.settings`, and `vista.workspaces` ([Stored workspace data](workspaces.md#stored-workspace-data)), so the desktop app needs nothing of its own. The value is a locale code and holds no personal data. A saved value Vista does not ship, such as one from a later version that was removed, is matched like a system language, so `pt-PT` would give `pt-BR`, and anything with no match falls back to the system languages, then English. When storage can't be read or written, as in some private browsing modes, the language is detected at each start and a change still applies for the rest of the session.

## Applying the language

The shared app owns everything here, through `@codenhub/i18n`'s runtime-neutral root entry and its `/browser` binding, which uses only `localStorage`, `navigator.languages`, and `document`, all available in both hosts. Nothing goes through a host adapter, and `packages/app` stays host-free as [the stack guidelines](../guidelines/stack.md#react-and-ui) require. The `/routing` entry is not used, since Vista has no URLs to localize.

- **Before the first render.** The shared app starts the binding and waits for it before rendering, so the interface never shows English first and then switches. The binding sets `<html lang>` to the locale, such as `pt-BR`, so screen readers pronounce text correctly, and `dir` to `ltr`, the direction of all three languages. The hosts' `index.html` keep `lang="en"` until then.
- **Offline.** All three dictionaries are part of the app's own code, imported statically rather than as separate chunks, so switching language never needs the network, including in the web app after the connection drops. Interface text is a few kilobytes per language, so loading every language costs less than a switch that can fail; this is revisited if the dictionaries grow large. Since nothing is fetched, a dictionary that fails to load is a build defect, and the tests below exist to catch it.
- **Re-rendering.** The interface re-renders on a language change through `i18n.subscribe()` and `useSyncExternalStore`, from the root of the shared app, so no component shows a stale language. The Language row renders from `binding.subscribe()`, which also reports a change to `isUsingSystemLocale` and a pick of the language already shown, neither of which `i18n.subscribe()` reports.
- **Direction.** All three languages are left to right. Adding a right-to-left language would need the layout checked under `dir="rtl"`; this draft does not cover it.

## What is translated

Every piece of text Vista writes for the user:

- Labels, buttons, menus, tooltips, placeholders, and accessible names, such as `aria-label` and `title`.
- Toasts, confirmations, dialogs, and empty states.
- Settings, including each section's lead and every row's name and description.
- Command names in the command palette and in Keyboard Shortcuts, and their categories. The palette matches what it shows, so commands are searched in the current language.
- The update notice and its offers, such as `Update to {version}` and `Install it now?`, and the summary of what the update changes, as [The changelog](#the-changelog) describes.
- What's New and the release summary in About, as [The changelog](#the-changelog) describes.
- Text inside the editor libraries that Vista shows: CodeMirror's phrases, such as those of the search and vim extensions, through CodeMirror's `EditorState.phrases` facet. The facet is part of the editor's state, so a re-render does not change it: on a language change, the open editor is reconfigured with the new phrases, keeping each tab's saved state. Which phrases Vista actually shows is listed when this is implemented.
- Messages Vista writes for failures, such as `Failed to open the selected folder.`

The English strings that [Workspaces](workspaces.md) and other specs quote are the `en` dictionary's text. A spec keeps quoting English; the translations follow it.

## What is not translated

- **User content.** File contents, and file, folder, and workspace names, are shown as they are.
- **The name Vista**, the `<title>`, and key names such as `Ctrl` and `Alt`, which follow what the keyboard shows.
- **Logs.** Console messages stay in English, so a log in a bug report reads the same for everyone.
- **The GitHub release.** Its notes stay the English entry, since they are read on GitHub, alongside the repository.
- **Documentation**, the README, and the repository's own text.
- **The operating system's own dialogs.** The desktop app's file and folder pickers come from the operating system, which shows them in its own language. Vista does not control them.

### Platform error text

Today some failures show the platform's own message, from the Tauri filesystem plugin or a browser `DOMException`, through the `err.message` fallback in `app.tsx`, as [Errors → How failures reach the user](errors.md#how-failures-reach-the-user) describes. That text is in whatever language the platform uses, which may differ from Vista's, and Vista cannot translate it.

The interface is therefore only fully translated once the [Errors direction](errors.md#direction) is in place: adapters report a failure kind, and the shared app shows its own message for it. This document relies on that direction and does not restate it. Until it lands, the languages can ship with every other text translated, and such a failure still shows the platform's text.

## The changelog

A user deciding whether to install an update reads what it changes in their own language. Every [changelog](changelog.md) entry is therefore written in each of the three languages, and the app shows the one in the interface language: in What's New, in About's summary, and in the update offer.

- **Pages.** A translated entry is a page beside the English one, in a folder named for its locale: `docs/changelog/pt-BR/0.2.0.md` and `docs/changelog/es/0.2.0.md`. It has the English page's header, with the same `title` and `date` and a translated `description`, and the same `##` headings, kept in English, since they name the [Keep a Changelog](https://keepachangelog.com/) sections rather than being read as text; the app shows each heading through the dictionary, such as _Adicionado_ for `## Added`. Under each heading, the same bullets in the same order, translated, keeping their links and code spans. `docs/changelog/index.md` stays the one list of published versions; the folders have no index of their own.
- **Written with the release.** The translations are written in the pull request that raises the version, with the English entry, so a release never ships without them.
- **Checked.** `pnpm changelog:check` holds each translation of the current version to the English page: it exists, its `title` and `date` match, its `description` is not empty or `TODO`, it has the `# {version}` heading, the same headings in the same order with the same number of bullets under each, and each bullet has the same link targets and code spans, in the same order, as its English bullet. The check cannot judge the wording; [Review](#review) covers that.
- **Fallback.** A version with no translation in a language, such as a release from before this document, shows its English page whole, not a mix of the two.
- **The update offer.** A newer version cannot be in the running build, so `latest.json` carries the translated summaries: `notes` keeps the English `description`, which the desktop updater reads as before, and a `vista_notes` object adds the others by locale, as `{ "pt-BR": "…", "es": "…" }`. The native adapter reads it from the update's raw manifest, the [updater port](../../packages/app/src/ports.ts) carries the summaries by locale, and the shared app shows the one in the interface language, or `notes` when it has none.

[The changelog spec](changelog.md) owns the English pages and the check; it is updated to include translated pages in the change that implements them.

### Alternatives considered

- **English entries in every language.** Rejected: a user who does not read English cannot tell what an update changes, which is the friction translated entries remove.
- **Translations inside the English page**, such as a `description.pt-BR` field and a section per language. Rejected: the page becomes three documents in one, every reader of the format changes, and a diff for one language touches the others.
- **Translating at runtime**, with a machine translation service. Rejected: the desktop app reads entries without a network request, and a translation nobody saw before the release cannot be reviewed.

## Dates and numbers

Dates and numbers follow the interface language, not the browser's, through the manager's `formatDate()` and `formatNumber()`, so a Portuguese interface never shows an English date or `1.2 KB` where it writes `1,2 KB`. Every number Vista shows goes through them. This changes today's behavior in these places:

- The start screen's dates and What's New's release date use the browser's locale, with `toLocaleDateString(undefined, …)`.
- The status bar's large-table hint writes the cell limit with `"en-US"`.
- The status bar's facts and position, such as `12 lines`, `1.2 KB`, `340 words`, and `Ln 4, Col 7`, are built with plain template strings and `toFixed()`, so their numbers, units, and plurals all become messages.

Numbers inside a translated message are formatted by the message itself, as `{count, number}`, and counts that change the wording use ICU plurals, such as `{count, plural, one {# file} other {# files}}`, so every language gets its own plural rules.

## Writing translations

- **Where.** One dictionary per language in `packages/app`: English as an `as const` object in `src/i18n/en.ts`, and the translations as JSON, `pt-BR.json` and `es.json`, typed as English. Keys are grouped by the part of the interface they belong to, such as `settings.files.maxOpenSize.label`.
- **Typed keys and values.** `en.ts` is the source of the types. Because it is `as const`, TypeScript sees each English message, so a key that does not exist, or a missing or wrongly typed placeholder value, such as `version` in `Update to {version}`, fails to compile. A JSON dictionary would only check keys, since TypeScript types JSON text as `string`. The compiler cannot check that a translation uses the same placeholders as English; the message test below does.
- **Whole sentences.** A message is one whole sentence with placeholders, never pieces joined in code, because word order differs between languages. Markup stays in components; dictionaries hold only text, since `t()` does not render HTML.
- **Length.** Portuguese and Spanish text is often longer than English. The interface must not cut text off or overlap at any width it supports; a label that cannot fit wraps or is reworded in that language.
- **Missing text.** A string added in English without its translations falls back to English and is caught by the tests below, so it never ships unnoticed.

### Review

Translations, of interface text and of changelog entries alike, are drafted with AI from the English source, and are held to different reviews by language:

- **Portuguese (`pt-BR`)** is reviewed in full by the owner, who reads it natively, before it ships.
- **Spanish (`es`)** is checked by the owner, who does not read Spanish fluently, so a reviewed text can still read oddly to a native speaker. This is accepted: Spanish reaches many users who read no English, and an awkward phrase serves them better than English. A Spanish wording reported by a user is fixed like any other defect. A fluent reviewer, when one joins the project, reviews it in full as `pt-BR` is.

The review covers meaning and tone, including that a placeholder or plural reads correctly in context, which the tests below cannot judge.

## Tests

- **Key parity.** Every dictionary has exactly the keys of `en.ts`, as the package's own test pattern does with `loadLocale()`.
- **Messages parse.** Every message in every dictionary is valid ICU syntax and uses the same placeholders as its English source.
- **No missing keys at runtime.** Tests run with an `onMissingKey` that throws, so a key built at runtime that does not exist fails a test.
- **Detection and storage.** Choosing a language saves it under `vista-locale` and applies it at once; a saved language wins over the system's; an unknown saved value and unreadable storage fall back as [Storage](#storage) describes.
- **Formatting.** Dates and numbers, including the status bar's, follow the chosen language rather than the browser's.
- **Switching with an editor open.** Changing the language while the raw editor shows changes its phrases at once and keeps its selection, scroll position, and undo history.
- **Existing tests.** Tests start in English, so the tests that find elements by their English text keep working.
- **Translated changelog.** What's New, About, and the update offer show the entry in the interface language, and the English one for a version or summary with no translation; `pnpm changelog:check` fails on each mismatch [The changelog](#the-changelog) lists.

Checked by hand, as [Tests](tests.md) records for what no automated test reaches: that the desktop webview reports the operating system's language in `navigator.languages` on Windows and Linux, and that no screen cuts off Portuguese or Spanish text at the narrowest supported width.

## Dependency

This adds `@codenhub/i18n` to the workspace catalog, pinned to `0.5.0`, as the other `@codenhub/*` packages are, used by `packages/app` only. It has no dependencies of its own and no import-time side effects; its browser binding changes `<html lang>` and `dir` and follows `languagechange`, as [Applying the language](#applying-the-language) and [Storage](#storage) describe. It is maintained alongside Vista and is before 1.0, so a minor upgrade may change its API; a defect found in it is fixed in its own repository, as [the code guidelines](../guidelines/code.md) describe.

0.5.0 is the first version with everything this document needs. It added `binding.switchToSystemLocale()`, `binding.isUsingSystemLocale`, `binding.subscribe()`, and following `languagechange` while no choice is saved, which _System_ needs, in answer to [codenhub/codenhub#588](https://github.com/codenhub/codenhub/issues/588), which Vista filed. Markup inside a translated sentence, such as a link, is not supported: the `rich()` method that did it was removed before 0.5.0, and [codenhub/codenhub#648](https://github.com/codenhub/codenhub/issues/648) tracks it. Vista does not need it, since its dictionaries hold only text and markup stays in components, as [Writing translations](#writing-translations) says; a sentence that ever needs a link inside it is the case that issue waits for.

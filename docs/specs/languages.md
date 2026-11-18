---
status: DRAFT
last_updated: 2026-11-18
scope: The interface languages, how one is chosen, stored, and applied, which text is translated and which is not, how dates and numbers follow the language, and how translations are written and tested.
---

# Languages

This document proposes making Vista's interface available in more than one language. It is a draft for the owner to approve or change; nothing in it is implemented. Today every piece of interface text is an English literal in `packages/app`, and that stays in force until this document is approved and implemented.

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
- **Vista storing the choice itself in `vista.settings`, with the binding's `persistLocale: false`.** Rejected: it works around `@codenhub/i18n` rather than fixing it, and keeps the choice in a second store beside the one the binding owns. See [Upstream change](#upstream-change).
- **The language as a row in Appearance.** Rejected: Appearance is how the interface looks, and a user looking for the language would not look there first.

## Storage

The choice is saved by `@codenhub/i18n`'s browser binding in `localStorage` under `vista-locale`, as `{"locale":"pt-BR"}`, named after `vista-theme`, which `@codenhub/theme` owns the same way. Only a language the user chooses is saved; a detected language is not, so it is detected again at each start. Choosing _System_ removes the saved choice.

Both hosts keep this in the webview's `localStorage`, as they already do for `vista-theme`, `vista.settings`, and `vista.workspaces` ([Stored workspace data](workspaces.md#stored-workspace-data)), so the desktop app needs nothing of its own. The value is a locale code and holds no personal data. A saved value Vista does not ship, such as one from a later version that was removed, is matched like a system language, so `pt-PT` would give `pt-BR`, and anything with no match falls back to the system languages, then English. When storage can't be read or written, as in some private browsing modes, the language is detected at each start and a change still applies for the rest of the session.

## Applying the language

The shared app owns everything here, through `@codenhub/i18n`'s runtime-neutral root entry and its `/browser` binding, which uses only `localStorage`, `navigator.languages`, and `document`, all available in both hosts. Nothing goes through a host adapter, and `packages/app` stays host-free as [the stack guidelines](../guidelines/stack.md#react-and-ui) require. The `/routing` entry is not used, since Vista has no URLs to localize.

- **Before the first render.** The shared app starts the binding and waits for it before rendering, so the interface never shows English first and then switches. The binding sets `<html lang>` to the locale, such as `pt-BR`, so screen readers pronounce text correctly, and `dir` to `ltr`, the direction of all three languages. The hosts' `index.html` keep `lang="en"` until then.
- **Offline.** All three dictionaries are part of the app's own code, imported statically rather than as separate chunks, so switching language never needs the network, including in the web app after the connection drops. Interface text is a few kilobytes per language, so loading every language costs less than a switch that can fail; this is revisited if the dictionaries grow large. Since nothing is fetched, a dictionary that fails to load is a build defect, and the tests below exist to catch it.
- **Re-rendering.** The interface re-renders on a language change through `i18n.subscribe()` and `useSyncExternalStore`, from the root of the shared app, so no component shows a stale language.
- **Direction.** All three languages are left to right. Adding a right-to-left language would need the layout checked under `dir="rtl"`; this draft does not cover it.

## What is translated

Every piece of text Vista writes for the user:

- Labels, buttons, menus, tooltips, placeholders, and accessible names, such as `aria-label` and `title`.
- Toasts, confirmations, dialogs, and empty states.
- Settings, including each section's lead and every row's name and description.
- Command names in the command palette and in Keyboard Shortcuts, and their categories. The palette matches what it shows, so commands are searched in the current language.
- The update notice and its offers, such as `Update to {version}` and `Install it now?`.
- Text inside the editor libraries that Vista shows: CodeMirror's phrases, such as those of the search and vim extensions, through CodeMirror's `EditorState.phrases` facet. The facet is part of the editor's state, so a re-render does not change it: on a language change, the open editor is reconfigured with the new phrases, keeping each tab's saved state. Which phrases Vista actually shows is listed when this is implemented.
- Messages Vista writes for failures, such as `Failed to open the selected folder.`

The English strings that [Workspaces](workspaces.md) and other specs quote are the `en` dictionary's text. A spec keeps quoting English; the translations follow it.

## What is not translated

- **User content.** File contents, and file, folder, and workspace names, are shown as they are.
- **The name Vista**, the `<title>`, and key names such as `Ctrl` and `Alt`, which follow what the keyboard shows.
- **The changelog.** What's New shows the [changelog](changelog.md) entry in English, in every language, for now. Translated entries may be added later, so that, for example, a Brazilian user can read what an update changes before installing it; that would extend the [changelog spec](changelog.md) and is not part of this draft.
- **Logs.** Console messages stay in English, so a log in a bug report reads the same for everyone.
- **Documentation**, the README, and the repository's own text.
- **The operating system's own dialogs.** The desktop app's file and folder pickers come from the operating system, which shows them in its own language. Vista does not control them.

### Platform error text

Today some failures show the platform's own message, from the Tauri filesystem plugin or a browser `DOMException`, through the `err.message` fallback in `app.tsx`, as [Errors → How failures reach the user](errors.md#how-failures-reach-the-user) describes. That text is in whatever language the platform uses, which may differ from Vista's, and Vista cannot translate it.

The interface is therefore only fully translated once the [Errors direction](errors.md#direction) is in place: adapters report a failure kind, and the shared app shows its own message for it. This document relies on that direction and does not restate it. Until it lands, the languages can ship with every other text translated, and such a failure still shows the platform's text.

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
- **Review.** A translation is reviewed by someone who reads that language before it ships. A string added in English without its translations falls back to English and is caught by the tests below, so it never ships unnoticed.

## Tests

- **Key parity.** Every dictionary has exactly the keys of `en.ts`, as the package's own test pattern does with `loadLocale()`.
- **Messages parse.** Every message in every dictionary is valid ICU syntax and uses the same placeholders as its English source.
- **No missing keys at runtime.** Tests run with an `onMissingKey` that throws, so a key built at runtime that does not exist fails a test.
- **Detection and storage.** Choosing a language saves it under `vista-locale` and applies it at once; a saved language wins over the system's; an unknown saved value and unreadable storage fall back as [Storage](#storage) describes.
- **Formatting.** Dates and numbers, including the status bar's, follow the chosen language rather than the browser's.
- **Switching with an editor open.** Changing the language while the raw editor shows changes its phrases at once and keeps its selection, scroll position, and undo history.
- **Existing tests.** Tests start in English, so the tests that find elements by their English text keep working.

Checked by hand, as [Tests](tests.md) records for what no automated test reaches: that the desktop webview reports the operating system's language in `navigator.languages` on Windows and Linux, and that no screen cuts off Portuguese or Spanish text at the narrowest supported width.

## Dependency

This adds `@codenhub/i18n` to the workspace catalog, used by `packages/app` only. It has no dependencies of its own and no side effects. It is maintained alongside Vista and is before 1.0, so an upgrade may change its API; a defect found in it is fixed in its own repository, as [the code guidelines](../guidelines/code.md) describe.

## Upstream change

_System_ relies on a change to `@codenhub/i18n`, which Vista's maintainers also maintain: [codenhub/codenhub#588](https://github.com/codenhub/codenhub/issues/588). The browser binding saves every applied language change and has no way to forget it, cannot say whether a language was chosen or detected, and does not follow a change to the browser's languages during a session. The issue proposes that the binding forget the saved choice and switch to the detected language, report the saved choice, and follow `languagechange` while nothing is saved.

The languages can ship before it is released. Until then, the list has no _System_ entry: a user who never chose still follows the system, but one who chose a language keeps it, and the list shows the current language as selected whether it was chosen or detected. _System_ ships once the change is released, and needs no migration, since a saved choice reads the same before and after.

## Open questions

- **Translation review.** Who reviews the Spanish text before it ships.
- **Translated changelog entries.** Whether, and when, What's New shows a translated entry.

import { type ChangelogEntry, parseChangelogPage, readChangelog } from "./domain/changelog";

// `docs/changelog/` is inlined at build time, so the app carries the history up to its own version and shows
// it without a network request, translations included. `docs/specs/changelog.md` defines the pages.
const files = import.meta.glob("../../../docs/changelog/*.md", { query: "?raw", import: "default", eager: true });
const translatedFiles = import.meta.glob("../../../docs/changelog/*/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** Translated page texts by their path in `docs/changelog/`, such as `pt-BR/0.2.0.md`. */
const TRANSLATED_PAGES: ReadonlyMap<string, string> = new Map(
  Object.entries(translatedFiles).map(([path, text]) => [path.split("/").slice(-2).join("/"), text]),
);

/** Every published entry, newest first, as `docs/changelog/index.md` lists them. */
export const CHANGELOG: readonly ChangelogEntry[] = readChangelog(
  Object.fromEntries(Object.entries(files).map(([path, text]) => [path.slice(path.lastIndexOf("/") + 1), text])),
);

/**
 * Finds a version's entry, in a language when it is translated into it.
 *
 * @param version - The version, such as `0.2.0`.
 * @param locale - The interface language. A version with no translation in it gives the English entry whole.
 * @returns Its entry, or undefined when the changelog publishes none.
 */
export function changelogEntryFor(version: string, locale = "en"): ChangelogEntry | undefined {
  const entry = CHANGELOG.find((published) => published.version === version);
  const translation = entry && TRANSLATED_PAGES.get(`${locale}/${version}.md`);
  return translation === undefined ? entry : parseChangelogPage(version, translation);
}

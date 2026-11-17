import { type ChangelogEntry, readChangelog } from "./domain/changelog";

// `docs/changelog/` is inlined at build time, so the app carries the history up to its own version and shows
// it without a network request. `docs/specs/changelog.md` defines the pages.
const files = import.meta.glob("../../../docs/changelog/*.md", { query: "?raw", import: "default", eager: true });

/** Every published entry, newest first, as `docs/changelog/index.md` lists them. */
export const CHANGELOG: readonly ChangelogEntry[] = readChangelog(
  Object.fromEntries(Object.entries(files).map(([path, text]) => [path.slice(path.lastIndexOf("/") + 1), text])),
);

/**
 * Finds a version's entry.
 *
 * @param version - The version, such as `0.2.0`.
 * @returns Its entry, or undefined when the changelog publishes none.
 */
export function changelogEntryFor(version: string): ChangelogEntry | undefined {
  return CHANGELOG.find((entry) => entry.version === version);
}

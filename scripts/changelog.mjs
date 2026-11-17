#!/usr/bin/env node
// Checks the changelog entry for the version being released, and prints an entry's release notes.
//
// Usage:
//   node scripts/changelog.mjs check            Checks the entry for the version in package.json.
//   node scripts/changelog.mjs notes <version>  Prints the entry's body, for the GitHub release.
//
// `docs/specs/changelog.md` defines the pages. Only the version being released is checked, so a page written
// before a rule existed is brought in line when it is next touched rather than failing every run.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { findEntryProblems, parseChangelogIndex, parseChangelogPage } from "../packages/app/src/domain/changelog.ts";

export const CHANGELOG_DIR = "docs/changelog";

/** @typedef {(name: string) => string | null} ReadPage */

/**
 * Reports what keeps a version's entry from being released: no index, no page, a page the index does not
 * link, an index link to a page that does not exist, or a page that is incomplete.
 *
 * @param {string} version - The version being released.
 * @param {ReadPage} read - Returns a page's text by its file name in `docs/changelog/`, or null when it is missing.
 * @returns {string[]} One message per problem; empty when the entry is ready.
 */
export function findChangelogProblems(version, read) {
  const index = read("index.md");
  if (index === null) {
    return [`${CHANGELOG_DIR}/index.md is missing. It lists every published version, newest first.`];
  }
  const page = `${version}.md`;
  const linked = parseChangelogIndex(index);
  /** @type {string[]} */
  const problems = linked
    .filter((name) => read(name) === null)
    .map((name) => `${CHANGELOG_DIR}/index.md links ${name}, which does not exist.`);
  const text = read(page);
  if (text === null) {
    problems.push(`${CHANGELOG_DIR}/${page} is missing. Write the entry in the change that raises the version.`);
    return problems;
  }
  if (!linked.includes(page)) {
    problems.push(`${CHANGELOG_DIR}/index.md does not link ${page}. Add "- [${version}](${page})" at the top.`);
  } else if (linked[0] !== page) {
    problems.push(`${CHANGELOG_DIR}/index.md must list ${page} first, since it is the newest version.`);
  }
  return [...problems, ...findEntryProblems(version, text)];
}

/** @type {ReadPage} */
const readPage = (name) => {
  const path = `${CHANGELOG_DIR}/${name}`;
  return existsSync(path) ? readFileSync(path, "utf8") : null;
};

/**
 * Reads a version's entry from `docs/changelog/`.
 *
 * @param {string} version - The version, such as `0.2.0`.
 * @returns {import("../packages/app/src/domain/changelog.ts").ChangelogEntry} The entry.
 * @throws {Error} When the version has no page.
 */
export function readEntry(version) {
  const text = readPage(`${version}.md`);
  if (text === null) {
    throw new Error(`${CHANGELOG_DIR}/${version}.md is missing.`);
  }
  return parseChangelogPage(version, text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, argument] = process.argv.slice(2);
  if (command === "check") {
    const version = argument ?? JSON.parse(readFileSync("package.json", "utf8")).version;
    const problems = findChangelogProblems(version, readPage);
    if (problems.length > 0) {
      for (const problem of problems) {
        console.error(problem);
      }
      console.error("docs/specs/changelog.md describes the entry.");
      process.exit(1);
    }
    console.log(`The changelog has an entry for ${version}.`);
  } else if (command === "notes" && argument) {
    process.stdout.write(`${readEntry(argument).body}\n`);
  } else {
    console.error("Usage: node scripts/changelog.mjs check [version] | notes <version>");
    process.exit(1);
  }
}

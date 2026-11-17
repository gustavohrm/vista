// Reads the changelog pages under `docs/changelog/`, in the format `docs/specs/changelog.md` defines. The app
// shows the entries, and `scripts/changelog.mjs` checks them and writes the release notes, so both read the
// pages the same way. That script runs under Node.js with type stripping, so this file imports nothing and
// uses only erasable TypeScript.

/** The Keep a Changelog headings an entry may use, in the order they appear. */
export const CHANGELOG_HEADINGS = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"] as const;

/** One heading of an entry, such as `Fixed`, and its bullets as written, in inline Markdown. */
export interface ChangelogSection {
  heading: string;
  items: string[];
}

/** One released version, as its page describes it. */
export interface ChangelogEntry {
  /** The version the page is named for, such as `0.2.0`. */
  version: string;
  /** The release date, `YYYY-MM-DD`, or an empty string when the page sets none. */
  date: string;
  /** A sentence on what the release changes for a user, or an empty string when the page sets none. */
  description: string;
  sections: ChangelogSection[];
  /** The page's Markdown after its title, for a surface that renders Markdown itself, such as GitHub. */
  body: string;
}

/** A run of an entry's inline text, either plain or a code span. */
export interface InlinePart {
  kind: "text" | "code";
  text: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PLACEHOLDER = /^TODO\b/i;
// A file name the index may link: a version, as the release tag names it, and `.md`.
const PAGE_NAME = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\.md$/;

/**
 * Splits a page into its frontmatter fields and its body. Only flat `key: value` lines are read, which is
 * all a changelog page carries; a value in matching quotes loses them.
 *
 * @param text - The page's text.
 * @returns The fields and the text after the frontmatter, or null when the page has no frontmatter.
 */
export function parseFrontmatter(text: string): { fields: Record<string, string>; body: string } | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) {
    return null;
  }
  const fields: Record<string, string> = {};
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const field = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (field) {
      const value = (field[2] ?? "").trim();
      fields[field[1] ?? ""] = /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;
    }
  }
  return { fields, body: text.slice(match[0].length) };
}

/**
 * Lists the version pages the index links, in its order, which is newest first.
 *
 * @param text - The text of `docs/changelog/index.md`.
 * @returns File names such as `0.2.0.md`; a link to anything else is left out.
 */
export function parseChangelogIndex(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(/^\s*-\s+\[[^\]]*\]\(([^)\s]+)\)\s*$/gm)) {
    const target = match[1] ?? "";
    if (PAGE_NAME.test(target)) {
      names.push(target);
    }
  }
  return names;
}

/**
 * Reads one version page. It reads what is there and never throws, so a page written before a rule
 * existed still shows; `findEntryProblems` is what holds a page to the format.
 *
 * @param version - The version the page is named for.
 * @param text - The page's text.
 * @returns The entry.
 */
export function parseChangelogPage(version: string, text: string): ChangelogEntry {
  const parsed = parseFrontmatter(text);
  const fields = parsed?.fields ?? {};
  const afterFrontmatter = parsed?.body ?? text;
  // The title is the page's one `# ` heading; everything after it is the body.
  const title = /^# .*$/m.exec(afterFrontmatter);
  const body = (title ? afterFrontmatter.slice(title.index + title[0].length) : afterFrontmatter).trim();

  const sections: ChangelogSection[] = [];
  let section: ChangelogSection | null = null;
  let item: string | null = null;
  const finishItem = () => {
    if (section && item !== null) {
      section.items.push(item);
    }
    item = null;
  };
  for (const line of body.split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (heading) {
      finishItem();
      section = { heading: heading[1] ?? "", items: [] };
      sections.push(section);
    } else if (bullet) {
      finishItem();
      item = (bullet[1] ?? "").trim();
    } else if (item !== null && /^\s+\S/.test(line)) {
      // An indented line continues the bullet above it.
      item = `${item} ${line.trim()}`;
    } else {
      finishItem();
    }
  }
  finishItem();

  return { version, date: fields.date ?? "", description: fields.description ?? "", sections, body };
}

/**
 * Reads the changelog the index publishes, newest first. A page the index links but that does not exist
 * is left out, as is every page it does not link.
 *
 * @param pages - Page texts keyed by file name, such as `index.md` and `0.2.0.md`.
 * @returns The entries, or an empty list when there is no index.
 */
export function readChangelog(pages: Readonly<Record<string, string>>): ChangelogEntry[] {
  const index = pages["index.md"];
  if (index === undefined) {
    return [];
  }
  return parseChangelogIndex(index).flatMap((name) => {
    const text = pages[name];
    return text === undefined ? [] : [parseChangelogPage(name.slice(0, -".md".length), text)];
  });
}

/**
 * Holds the page of the version being released to the format: the frontmatter it must set, at least one
 * bullet under the headings Keep a Changelog defines, and no scaffolded `TODO` left in it.
 *
 * @param version - The version being released.
 * @param text - Its page's text.
 * @returns One message per problem; empty when the page is complete.
 */
export function findEntryProblems(version: string, text: string): string[] {
  const page = `docs/changelog/${version}.md`;
  const parsed = parseFrontmatter(text);
  if (!parsed) {
    return [`${page} has no frontmatter. Set title, date, and description.`];
  }
  const problems: string[] = [];
  const { title = "", date = "", description = "" } = parsed.fields;
  if (title !== version) {
    problems.push(`${page} must set "title: ${version}", not "${title}".`);
  }
  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    problems.push(`${page} must set "date" to the release date as YYYY-MM-DD.`);
  }
  if (description === "" || PLACEHOLDER.test(description)) {
    problems.push(`${page} must set "description" to one sentence on what the release changes for a user.`);
  }

  const entry = parseChangelogPage(version, text);
  const allowed: readonly string[] = CHANGELOG_HEADINGS;
  for (const section of entry.sections) {
    if (!allowed.includes(section.heading)) {
      problems.push(`${page} has a "## ${section.heading}" heading. Use only ${CHANGELOG_HEADINGS.join(", ")}.`);
    } else if (section.items.length === 0) {
      problems.push(`${page} has a "## ${section.heading}" heading with no bullets. Remove it or add one.`);
    }
  }
  if (!entry.sections.some((section) => section.items.length > 0)) {
    problems.push(`${page} lists no changes. Add a bullet under ${CHANGELOG_HEADINGS.join(", ")}.`);
  }
  if (entry.sections.some((section) => section.items.some((item) => PLACEHOLDER.test(item)))) {
    problems.push(`${page} still has a TODO bullet. Replace it with what changed.`);
  }
  return problems;
}

/**
 * Splits a bullet's inline Markdown into plain text and code spans. A link keeps only its text, because the
 * desktop app opens no web links; emphasis markers stay as written.
 *
 * @param markdown - One bullet, as `ChangelogSection.items` holds it.
 * @returns The runs, in order.
 */
export function inlineParts(markdown: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const pushText = (text: string) => {
    const plain = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
    if (plain === "") {
      return;
    }
    const last = parts.at(-1);
    if (last?.kind === "text") {
      last.text += plain;
    } else {
      parts.push({ kind: "text", text: plain });
    }
  };
  let rest = markdown;
  for (let code = /`([^`]+)`/.exec(rest); code; code = /`([^`]+)`/.exec(rest)) {
    pushText(rest.slice(0, code.index));
    parts.push({ kind: "code", text: code[1] ?? "" });
    rest = rest.slice(code.index + code[0].length);
  }
  pushText(rest);
  return parts;
}

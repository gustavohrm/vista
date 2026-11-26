// Reads the changelog pages under `docs/changelog/`, in the format `docs/specs/changelog.md` defines. The app
// shows the entries, and `scripts/changelog.mjs` checks them and writes the release notes, so both read the
// pages the same way. That script runs under Node.js with type stripping, so this file imports nothing and
// uses only erasable TypeScript.

/** The Keep a Changelog headings an entry may use, in the order they appear. */
export const CHANGELOG_HEADINGS = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"] as const;

/**
 * The languages each entry is translated into besides English, which are the interface's other languages. Each
 * has a folder of `docs/changelog/` named for it.
 */
export const CHANGELOG_TRANSLATIONS = ["pt-BR", "es"] as const;

/**
 * One heading of an entry, such as `Fixed`, and its bullets as written, in inline Markdown. A heading deeper
 * than `##` keeps its marks, as `### Details`, so the check can tell it from an entry heading.
 */
export interface ChangelogSection {
  heading: string;
  items: string[];
}

/** One released version, as its page describes it. */
export interface ChangelogEntry {
  /** The version the page is named for, such as `0.2.0`. */
  version: string;
  /** The text of the page's `# ` heading, or an empty string when it has none. */
  title: string;
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
// A list item in the index, whether or not it is a link the index can read.
const INDEX_ITEM = /^\s*[-*]\s+(.*?)\s*$/;
const INDEX_LINK = /^\[[^\]]*\]\(([^)\s]+)\)$/;

/**
 * Whether a string is a real calendar day as `YYYY-MM-DD`. `Date` rolls `2026-02-31` over to March 3, so the
 * parsed day is written back and compared.
 *
 * @param date - The string to test.
 * @returns True for a real day.
 */
export function isIsoDate(date: string): boolean {
  if (!ISO_DATE.test(date)) {
    return false;
  }
  const day = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === date;
}

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
  return readIndexItems(text).flatMap((item) => (item.page === null ? [] : [item.page]));
}

/**
 * Reads each list item of the index, and the version page it links when it is one.
 *
 * @param text - The text of `docs/changelog/index.md`.
 * @returns The items in order, each with its text and its page, or null for an item that links no page.
 */
export function readIndexItems(text: string): { text: string; page: string | null }[] {
  return text.split(/\r?\n/).flatMap((line) => {
    const item = INDEX_ITEM.exec(line)?.[1];
    if (item === undefined) {
      return [];
    }
    const target = INDEX_LINK.exec(item)?.[1];
    return [{ text: item, page: target !== undefined && PAGE_NAME.test(target) ? target : null }];
  });
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
  const titleText = title ? title[0].slice(2).trim() : "";

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
    const heading = /^(#{2,6})\s+(.+?)\s*$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (heading) {
      finishItem();
      const [, marks = "", name = ""] = heading;
      section = { heading: marks === "##" ? name : `${marks} ${name}`, items: [] };
      sections.push(section);
    } else if (bullet) {
      finishItem();
      item = (bullet[1] ?? "").trim();
    } else if (item !== null && line.trim() !== "") {
      // Any other text line continues the bullet above it, indented or not, as Markdown reads it.
      item = `${item} ${line.trim()}`;
    } else {
      finishItem();
    }
  }
  finishItem();

  return {
    version,
    title: titleText,
    date: fields.date ?? "",
    description: fields.description ?? "",
    sections,
    body,
  };
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
  if (!isIsoDate(date)) {
    problems.push(`${page} must set "date" to the release date as YYYY-MM-DD.`);
  }
  if (description === "" || PLACEHOLDER.test(description)) {
    problems.push(`${page} must set "description" to one sentence on what the release changes for a user.`);
  }

  const entry = parseChangelogPage(version, text);
  if (entry.title !== version) {
    problems.push(`${page} must have the heading "# ${version}".`);
  }
  const allowed: readonly string[] = CHANGELOG_HEADINGS;
  let previous = -1;
  for (const section of entry.sections) {
    const position = allowed.indexOf(section.heading);
    const shown = section.heading.startsWith("#") ? section.heading : `## ${section.heading}`;
    if (position === -1) {
      problems.push(`${page} has a "${shown}" heading. Use only ${CHANGELOG_HEADINGS.join(", ")}, as ##.`);
      continue;
    }
    if (position <= previous) {
      problems.push(
        `${page} has "${shown}" out of order or twice. Use ${CHANGELOG_HEADINGS.join(", ")}, in that order.`,
      );
    }
    previous = Math.max(previous, position);
    if (section.items.length === 0) {
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
 * Holds a translated page of the version being released to its English page: the same `title` and `date`, a
 * description of its own, the `# {version}` heading, the same headings in the same order with as many bullets
 * under each, and in each bullet the same link targets and code spans, in the same order. The wording is left
 * to review.
 *
 * @param version - The version being released.
 * @param locale - The translation's language, which names its folder, such as `pt-BR`.
 * @param english - The English page's text, which `findEntryProblems` checks.
 * @param text - The translated page's text.
 * @returns One message per problem; empty when the translation matches.
 */
export function findTranslationProblems(version: string, locale: string, english: string, text: string): string[] {
  const page = `docs/changelog/${locale}/${version}.md`;
  const parsed = parseFrontmatter(text);
  if (!parsed) {
    return [`${page} has no frontmatter. Copy the English page's title and date, and translate its description.`];
  }
  const problems: string[] = [];
  const englishFields = parseFrontmatter(english)?.fields ?? {};
  const { title = "", date = "", description = "" } = parsed.fields;
  if (title !== (englishFields.title ?? "")) {
    problems.push(`${page} must set "title: ${englishFields.title ?? ""}", as the English page does.`);
  }
  if (date !== (englishFields.date ?? "")) {
    problems.push(`${page} must set "date: ${englishFields.date ?? ""}", as the English page does.`);
  }
  if (description === "" || TRANSLATION_PLACEHOLDER.test(description)) {
    problems.push(`${page} must set "description" to the English description, translated.`);
  }

  const entry = parseChangelogPage(version, text);
  if (entry.title !== version) {
    problems.push(`${page} must have the heading "# ${version}".`);
  }
  const source = parseChangelogPage(version, english);
  const headings = (sections: ChangelogSection[]) =>
    sections.map((section) => (section.heading.startsWith("#") ? section.heading : `## ${section.heading}`)).join(", ");
  if (headings(entry.sections) !== headings(source.sections)) {
    problems.push(
      `${page} must have the English page's headings, in English and in its order: ${headings(source.sections)}.`,
    );
    return problems;
  }
  source.sections.forEach((section, sectionIndex) => {
    const items = entry.sections[sectionIndex]?.items ?? [];
    if (items.length !== section.items.length) {
      problems.push(
        `${page}: "## ${section.heading}" has ${items.length} bullets, and the English page ${section.items.length}.`,
      );
      return;
    }
    section.items.forEach((item, itemIndex) => {
      if (markupOf(items[itemIndex] ?? "") !== markupOf(item)) {
        problems.push(
          `${page}: bullet ${itemIndex + 1} under "## ${section.heading}" must keep the English bullet's links and code spans, in order.`,
        );
      }
    });
  });
  return problems;
}

/** A bullet's link targets and code spans, in order, which a translation keeps as written. */
function markupOf(markdown: string): string {
  return JSON.stringify([...markdown.matchAll(/`[^`]+`|\]\(([^)\s]*)\)/g)].map((match) => match[1] ?? match[0]));
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
  const pushText = (plain: string) => {
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
  // One pass finds whichever comes first, a code span or a link, so a code span keeps a link's syntax as
  // written, and a link whose text is a code span keeps the span.
  const token = /`([^`]+)`|\[((?:`[^`]*`|[^\]`])*)\]\([^)]*\)/g;
  let end = 0;
  for (const match of markdown.matchAll(token)) {
    pushText(markdown.slice(end, match.index));
    end = match.index + match[0].length;
    if (match[1] !== undefined) {
      parts.push({ kind: "code", text: match[1] });
      continue;
    }
    const label = match[2] ?? "";
    let labelEnd = 0;
    for (const code of label.matchAll(/`([^`]+)`/g)) {
      pushText(label.slice(labelEnd, code.index));
      parts.push({ kind: "code", text: code[1] ?? "" });
      labelEnd = code.index + code[0].length;
    }
    pushText(label.slice(labelEnd));
  }
  pushText(markdown.slice(end));
  return parts;
}

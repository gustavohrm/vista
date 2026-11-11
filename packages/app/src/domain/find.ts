/** What the find bar looks for. */
export interface FindQuery {
  text: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  /** Treats `text` as a regular expression instead of literal text. */
  regexp: boolean;
}

/** A match as UTF-16 offsets into the searched text. */
export interface TextMatch {
  from: number;
  to: number;
}

const REGEXP_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

/**
 * Builds the regular expression a query stands for. Word boundaries count letters and digits of any
 * script, so whole-word search works on accented text too.
 *
 * @returns The pattern, or null when the query is empty or its regular expression is invalid.
 */
export function createFindPattern(query: FindQuery): RegExp | null {
  if (query.text === "") {
    return null;
  }
  let source = query.regexp ? query.text : query.text.replace(REGEXP_SPECIAL_CHARACTERS, "\\$&");
  if (query.wholeWord) {
    source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  }
  try {
    return new RegExp(source, query.caseSensitive ? "gu" : "giu");
  } catch {
    return null;
  }
}

/**
 * Lists the non-empty matches of a pattern in a text. Empty matches, such as those of `a*`, are
 * skipped, since there is nothing to highlight.
 */
export function findMatches(text: string, pattern: RegExp): TextMatch[] {
  const matches: TextMatch[] = [];
  for (const match of text.matchAll(pattern)) {
    if (match[0].length > 0) {
      matches.push({ from: match.index, to: match.index + match[0].length });
    }
  }
  return matches;
}

import { createFindPattern, findMatches, type FindQuery } from "../../domain/find";
import { NO_FIND_RESULT, type FindResult, type FindTarget } from "./find-target";

const MATCH_HIGHLIGHT = "vista-find";
const CURRENT_HIGHLIGHT = "vista-find-current";

/** A match in rendered text, or a form field whose value matches, such as a CSV table cell. */
type DomMatch = { range: Range } | { field: HTMLInputElement | HTMLTextAreaElement };

/**
 * Finds text in a rendered view, such as rendered Markdown or the CSV table, without changing it.
 * Text matches are painted with the CSS Custom Highlight API, so the view's DOM, which its editor
 * owns, is left alone; matching form fields are marked with `data-find-match`. A match must lie
 * within one text node, so a phrase split by formatting, such as half in bold, is not found.
 *
 * @param getRoot - Returns the element holding the view, or null when it isn't mounted.
 */
export function createDomFindTarget(getRoot: () => HTMLElement | null): FindTarget {
  let matches: DomMatch[] = [];
  let current = -1;
  let lastQuery: FindQuery | null = null;

  const result = (): FindResult => ({
    total: matches.length,
    current: current >= 0 ? current + 1 : null,
    invalid: false,
  });

  const select = (index: number): FindResult => {
    if (matches.length === 0) {
      current = -1;
      return result();
    }
    current = (index + matches.length) % matches.length;
    paint(matches, current);
    scrollToMatch(matches[current]);
    return result();
  };

  const target: FindTarget = {
    canReplace: false,
    // Rendered text has no selection to keep, so searching again is how matches follow an edit.
    refresh: () => (lastQuery ? target.search(lastQuery) : result()),
    search: (query) => {
      const root = getRoot();
      const pattern = createFindPattern(query);
      const isSameQuery = lastQuery !== null && isEqualQuery(lastQuery, query);
      lastQuery = query;
      clearPaint(matches);
      matches = root && pattern ? collectMatches(root, pattern) : [];
      if (!pattern) {
        current = -1;
        return { ...NO_FIND_RESULT, invalid: query.text !== "" };
      }
      // The same query runs again after the text changes; keep the reader's place then.
      return select(isSameQuery ? Math.min(Math.max(current, 0), matches.length - 1) : 0);
    },
    findNext: () => select(current + 1),
    findPrevious: () => select(current - 1),
    replace: result,
    replaceAll: result,
    clear: () => {
      clearPaint(matches);
      matches = [];
      current = -1;
      lastQuery = null;
    },
    focus: () => getRoot()?.querySelector<HTMLElement>("[contenteditable='true'], input, textarea")?.focus(),
  };
  return target;
}

function isEqualQuery(a: FindQuery, b: FindQuery): boolean {
  return (
    a.text === b.text && a.caseSensitive === b.caseSensitive && a.wholeWord === b.wholeWord && a.regexp === b.regexp
  );
}

function collectMatches(root: HTMLElement, pattern: RegExp): DomMatch[] {
  const matches: DomMatch[] = [];
  // Controls and `data-find-skip` regions, such as the CSV table's buttons and headings, are not file text.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) =>
      node instanceof HTMLElement && (node instanceof HTMLButtonElement || node.hasAttribute("data-find-skip"))
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
      if (findMatches(node.value, pattern).length > 0) {
        matches.push({ field: node });
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      for (const { from, to } of findMatches(node.textContent ?? "", pattern)) {
        const range = document.createRange();
        range.setStart(node, from);
        range.setEnd(node, to);
        matches.push({ range });
      }
    }
  }
  return matches;
}

function supportsHighlights(): boolean {
  return typeof Highlight !== "undefined" && typeof CSS !== "undefined" && "highlights" in CSS;
}

function paint(matches: readonly DomMatch[], current: number) {
  const others: Range[] = [];
  const selected: Range[] = [];
  matches.forEach((match, index) => {
    if ("range" in match) {
      (index === current ? selected : others).push(match.range);
    } else {
      match.field.setAttribute("data-find-match", index === current ? "current" : "");
    }
  });
  if (supportsHighlights()) {
    CSS.highlights.set(MATCH_HIGHLIGHT, new Highlight(...others));
    CSS.highlights.set(CURRENT_HIGHLIGHT, new Highlight(...selected));
  }
}

function clearPaint(matches: readonly DomMatch[]) {
  for (const match of matches) {
    if ("field" in match) {
      match.field.removeAttribute("data-find-match");
    }
  }
  if (supportsHighlights()) {
    CSS.highlights.delete(MATCH_HIGHLIGHT);
    CSS.highlights.delete(CURRENT_HIGHLIGHT);
  }
}

function scrollToMatch(match: DomMatch | undefined) {
  const element = match && ("range" in match ? match.range.startContainer.parentElement : match.field);
  // jsdom does not implement scrolling.
  element?.scrollIntoView?.({ block: "center", inline: "nearest" });
}

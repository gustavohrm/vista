import type { FindQuery } from "../../domain/find";

/** How many matches the current query has, and which one is selected. */
export interface FindResult {
  total: number;
  /** 1-based index of the selected match, or null when none is selected. */
  current: number | null;
  /** True when the query is a regular expression that doesn't parse. */
  invalid: boolean;
}

export const NO_FIND_RESULT: FindResult = { total: 0, current: null, invalid: false };

/**
 * A view the find bar can search: the raw editor, or a rendered view. Each method returns the
 * result after it ran, so the bar can show the count.
 */
export interface FindTarget {
  /** Whether the view can replace text; rendered views only find. */
  canReplace: boolean;
  /** Highlights every match of a new query and selects the first one after the cursor. */
  search: (query: FindQuery) => FindResult;
  /** Counts the matches again after the text changed, without moving the selection. */
  refresh: () => FindResult;
  findNext: () => FindResult;
  findPrevious: () => FindResult;
  /** Replaces the selected match, or selects the next one when none is selected. */
  replace: (replacement: string) => FindResult;
  replaceAll: (replacement: string) => FindResult;
  /** Removes the highlights when the find bar closes. */
  clear: () => void;
  /** Moves focus back to the view. */
  focus: () => void;
}

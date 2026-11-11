import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  search,
  searchPanelOpen,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import { EditorView } from "@codemirror/view";

import type { FindQuery } from "../../domain/find";
import { NO_FIND_RESULT, type FindResult, type FindTarget } from "./find-target";

/**
 * CodeMirror's search, with its own panel replaced by an empty, hidden one: the app's find bar is the
 * interface. CodeMirror only highlights matches while a search panel is open, so the hidden panel
 * is opened while the find bar is.
 */
export const hiddenSearchPanel = [
  search({
    top: true,
    createPanel: () => {
      const dom = document.createElement("div");
      dom.hidden = true;
      return { dom };
    },
  }),
  EditorView.theme({ ".cm-panels-top": { borderBottom: "none" } }),
];

/**
 * Lets the find bar drive CodeMirror's search in the raw editor. Replacing goes through CodeMirror,
 * so it is one undo step and reaches the buffer like any other edit.
 *
 * @param getView - Returns the mounted editor, or null when there is none.
 */
export function createRawFindTarget(getView: () => EditorView | null): FindTarget {
  const withView = (action: (view: EditorView) => void): FindResult => {
    const view = getView();
    if (!view) {
      return NO_FIND_RESULT;
    }
    action(view);
    return describeMatches(view);
  };

  return {
    canReplace: true,
    search: (query) =>
      withView((view) => {
        if (!searchPanelOpen(view.state)) {
          openSearchPanel(view);
        }
        const next = toSearchQuery(query, getSearchQuery(view.state).replace);
        view.dispatch({ effects: setSearchQuery.of(next) });
        selectFirstMatchFrom(view, next, view.state.selection.main.from);
      }),
    // CodeMirror moves its highlights with the text itself; only the count needs redoing.
    refresh: () => withView(() => {}),
    findNext: () => withView(findNext),
    findPrevious: () => withView(findPrevious),
    replace: (replacement) =>
      withView((view) => {
        setReplacement(view, replacement);
        replaceNext(view);
      }),
    replaceAll: (replacement) =>
      withView((view) => {
        setReplacement(view, replacement);
        replaceAll(view);
      }),
    clear: () => {
      const view = getView();
      if (view) {
        closeSearchPanel(view);
      }
    },
    focus: () => getView()?.focus(),
  };
}

function toSearchQuery(query: FindQuery, replace: string): SearchQuery {
  return new SearchQuery({
    search: query.text,
    caseSensitive: query.caseSensitive,
    wholeWord: query.wholeWord,
    regexp: query.regexp,
    // Without regex, `\n` and `\t` are matched as typed rather than as a line break or tab.
    literal: !query.regexp,
    replace,
  });
}

function setReplacement(view: EditorView, replace: string) {
  const current = getSearchQuery(view.state);
  view.dispatch({
    effects: setSearchQuery.of(
      new SearchQuery({
        search: current.search,
        caseSensitive: current.caseSensitive,
        wholeWord: current.wholeWord,
        regexp: current.regexp,
        literal: current.literal,
        replace,
      }),
    ),
  });
}

/** Selects the first match at or after a position, wrapping to the start, as typing a query does in most editors. */
function selectFirstMatchFrom(view: EditorView, query: SearchQuery, from: number) {
  if (!query.valid) {
    return;
  }
  const match = firstMatch(query.getCursor(view.state, from)) ?? firstMatch(query.getCursor(view.state));
  if (match) {
    view.dispatch({
      selection: { anchor: match.from, head: match.to },
      effects: EditorView.scrollIntoView(match.from, { y: "center" }),
      userEvent: "select.search",
    });
  }
}

function firstMatch(cursor: Iterator<{ from: number; to: number }>) {
  const next = cursor.next();
  return next.done ? null : next.value;
}

function describeMatches(view: EditorView): FindResult {
  const query = getSearchQuery(view.state);
  if (!query.valid) {
    return { ...NO_FIND_RESULT, invalid: query.search !== "" };
  }
  const selection = view.state.selection.main;
  const cursor = query.getCursor(view.state);
  let total = 0;
  let current: number | null = null;
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    total++;
    if (next.value.from === selection.from && next.value.to === selection.to) {
      current = total;
    }
  }
  return { total, current, invalid: false };
}

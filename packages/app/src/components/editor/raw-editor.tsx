import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  closeSearchPanel,
  highlightSelectionMatches,
  selectNextOccurrence,
  selectSelectionMatches,
} from "@codemirror/search";
import { Annotation, Compartment, EditorState, Prec, Transaction } from "@codemirror/state";
import type { Extension, StateEffect } from "@codemirror/state";
import {
  Decoration,
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { showMinimap } from "@replit/codemirror-minimap";
import { getCM, vim } from "@replit/codemirror-vim";
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from "react";

import { matchesShortcut } from "../../commands/shortcuts";
import { lineSeparatorOf } from "../../domain/line-endings";
import { DEFAULT_EDITOR_SETTINGS, type EditorSettings } from "../../domain/settings";
import { findTextChange } from "../../domain/text-change";
import { t, useLocale } from "../../i18n";
import type { FindTarget } from "./find-target";
import { createRawFindTarget, hiddenSearchPanel } from "./raw-find";

/** Presentation and input options of the raw editor. */
export type RawEditorOptions = EditorSettings;

export const DEFAULT_RAW_EDITOR_OPTIONS: RawEditorOptions = DEFAULT_EDITOR_SETTINGS;

/** A place to move the cursor to, as people count it: lines and columns start at 1. */
export interface EditorPosition {
  line: number;
  column?: number;
}

/** Where the main cursor is, as people count it: lines and columns start at 1. */
export interface CursorInfo {
  line: number;
  /** UTF-16 code units from the start of the line, plus one. */
  column: number;
  /** Selected characters across all selection ranges, in UTF-16 code units. */
  selectionLength: number;
}

/** Editor state kept for a tab while another tab is shown. */
export interface SavedEditorState {
  state: EditorState;
  scroll: StateEffect<unknown>;
}

/** Saved editor states by tab key. The owner deletes entries of closed tabs. */
export type RawEditorStateCache = Map<string, SavedEditorState>;

interface RawEditorProps {
  /** Tab key of the document; switching it saves the current tab's editor state and restores the next one's. */
  documentKey: string;
  /** Text content of the document buffer, the source of truth. */
  content: string;
  /** File name, used in the editor's accessible name. */
  fileName: string;
  /** Shows the text without letting the user change it. */
  readOnly?: boolean;
  /** Called with the full text after each edit the user makes. */
  onChange: (value: string) => void;
  /** Called when the cursor or selection moves, and when a tab is shown. */
  onCursorChange?: (cursor: CursorInfo) => void;
  /** Holds each tab's selection, scroll position, and undo history across tab switches and remounts. */
  stateCache: RawEditorStateCache;
  options?: RawEditorOptions;
  /** App command shortcuts, such as `Mod+S`. The editor and vim ignore these keys so the command runs instead. */
  reservedShortcuts?: readonly string[];
  /** Called with vim's mode, such as "normal" or "visual line", and with null while vim is off. */
  onVimModeChange?: (mode: string | null) => void;
  /** A position to move the cursor to, scroll to, and focus. Positions past the end go to the end. */
  pendingJump?: EditorPosition | null;
  /** Called once `pendingJump` has been applied, so the owner can clear it. */
  onJumpApplied?: () => void;
  /** Receives the editor's find target, through which the find bar searches and replaces. */
  ref?: Ref<FindTarget>;
}

/** Marks changes that bring the editor in line with the buffer, so they aren't reported back as edits. */
const bufferSync = Annotation.define<boolean>();

// The rest of CodeMirror's search keymap opens its own search panel or go-to prompt, which the app's
// find bar and go-to commands replace.
const SELECTION_SEARCH_KEYMAP = [
  { key: "Mod-d", run: selectNextOccurrence, preventDefault: true },
  { key: "Mod-Shift-l", run: selectSelectionMatches },
];

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--color-frame)",
    color: "var(--color-text)",
    fontSize: "0.875rem",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.625" },
  ".cm-content": { padding: "1rem 0", caretColor: "var(--color-text)" },
  // The text starts a gutter's width in from the numbers, and the numbers well in from the frame's
  // edge, so neither reads as pressed against the other.
  ".cm-line": { padding: "0 1.5rem 0 0.75rem" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--color-text)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "var(--color-selection)" },
  ".cm-selectedText": { color: "var(--color-selection-text)" },
  // The current line is marked by its number alone; a fill under it competed with the selection.
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-gutters": {
    backgroundColor: "var(--color-frame)",
    color: "var(--color-text-faint)",
    border: "none",
  },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--color-text)" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 0.5rem 0 1.25rem" },
  ".cm-selectionMatch": { backgroundColor: "var(--color-selected)" },
  ".cm-searchMatch": { backgroundColor: "var(--color-highlight-soft)" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--color-highlight)" },
});

/**
 * CodeMirror's phrases that the raw editor shows, all of them announcements to screen readers, keyed by
 * CodeMirror's English text; CodeMirror puts its value where a phrase has `$`. The search panel's and
 * go-to prompt's phrases are left out, since the app's find bar and go-to dialog replace them.
 *
 * Each phrase is read in the interface language when CodeMirror asks for it, so the map itself never
 * changes: a different phrases map makes CodeMirror rebuild the view, which drops vim back to normal mode.
 */
const editorPhrases: Readonly<Record<string, string>> = Object.defineProperties(
  {},
  {
    "current match": { enumerable: true, get: () => t("editor.phrases.currentMatch") },
    "on line": { enumerable: true, get: () => t("editor.phrases.onLine") },
    "replaced match on line $": {
      enumerable: true,
      get: () => t("editor.phrases.replacedMatchOnLine", { line: "$" }),
    },
    "replaced $ matches": { enumerable: true, get: () => t("editor.phrases.replacedMatches", { count: "$" }) },
    "Selection deleted": { enumerable: true, get: () => t("editor.phrases.selectionDeleted") },
  },
);

const selectedTextMark = Decoration.mark({ class: "cm-selectedText" });

/**
 * Sets selected text in the selection's ink. CodeMirror draws the selection in a layer behind the
 * text, so the text keeps its own colour unless it is marked, and on the solid Daylight fill the
 * interface's light text would not read.
 */
const selectedText = EditorView.decorations.compute(["selection"], (state) =>
  Decoration.set(
    state.selection.ranges.filter((range) => !range.empty).map((range) => selectedTextMark.range(range.from, range.to)),
    true,
  ),
);

/**
 * Plain-text editor for every file type, built on CodeMirror 6. One editor instance serves every
 * tab: switching tabs swaps in that tab's saved state, so selection, scroll position, and undo
 * history survive. The document buffer stays the source of truth; when it changes elsewhere, such
 * as in the CSV table, the editor applies the smallest change that matches it.
 *
 * @param props - RawEditor properties.
 * @returns Raw editor element.
 */
export function RawEditor(props: RawEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const binding = useRef<EditorBinding>(createBinding(props)).current;
  binding.props = props;
  useImperativeHandle(props.ref, () => createRawFindTarget(() => viewRef.current), []);

  const { documentKey, content, fileName, readOnly, stateCache } = props;
  const options = props.options ?? DEFAULT_RAW_EDITOR_OPTIONS;

  // A layout effect, so that on unmount the scroll position is saved while the editor is still in the DOM.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    viewRef.current ??= new EditorView({ parent: host });
    const view = viewRef.current;
    const current = binding.props;

    const saved = stateCache.get(documentKey);
    loadState(view, binding, saved?.state ?? createEditorState(current.content));
    syncWithBuffer({ view, binding, content: current.content, scroll: saved?.scroll });
    // A tab saved while the find bar was open keeps its highlights; the bar searches again if it still is.
    closeSearchPanel(view);
    binding.reportedTexts = [];
    current.onCursorChange?.(describeCursor(view.state));

    return () => {
      stateCache.set(documentKey, { state: view.state, scroll: view.scrollSnapshot() });
    };
  }, [binding, documentKey, stateCache]);

  // A passive effect's cleanup runs after the layout effect's, so the tab's state is saved before the view goes away.
  useEffect(
    () => () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    // The buffer can lag behind fast typing, so an older report arriving late is an echo too, not an
    // outside change to undo the newer keystrokes with.
    const echoIndex = binding.reportedTexts.lastIndexOf(content);
    if (echoIndex >= 0) {
      binding.reportedTexts.splice(0, echoIndex + 1);
      return;
    }
    binding.reportedTexts = [];
    syncWithBuffer({ view, binding, content });
  }, [binding, content]);

  const { lineNumbers: showLineNumbers, minimap, vim: isVimEnabled, wordWrap } = options;
  // The locale too, since the editor's accessible name is in the interface language.
  const locale = useLocale();
  useEffect(() => {
    viewRef.current?.dispatch({ effects: reconfigure(binding) });
  }, [binding, fileName, readOnly, showLineNumbers, minimap, isVimEnabled, wordWrap, locale]);

  const { pendingJump } = props;
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !pendingJump) {
      return;
    }
    jumpTo(view, pendingJump);
    binding.props.onJumpApplied?.();
  }, [binding, documentKey, pendingJump]);

  return <div ref={hostRef} className="h-full w-full overflow-hidden" />;
}

/** Connects editor callbacks to the mounted component. It is mutated in place, so callbacks always see current props. */
interface EditorBinding {
  props: RawEditorProps;
  /** Texts reported through `onChange` that the buffer has not echoed back yet, oldest first. */
  reportedTexts: string[];
  /** Vim's adapter that mode changes are reported from, while vim is on. */
  vim: VimAdapter | null;
  /** Reports vim mode changes; one function, so it can be removed from the adapter again. */
  handleVimModeChange: (event: { mode: string; subMode?: string }) => void;
}

type VimAdapter = NonNullable<ReturnType<typeof getCM>>;

function createBinding(props: RawEditorProps): EditorBinding {
  const binding: EditorBinding = {
    props,
    reportedTexts: [],
    vim: null,
    handleVimModeChange: ({ mode, subMode }) => {
      const suffix = subMode === "linewise" ? " line" : subMode === "blockwise" ? " block" : "";
      binding.props.onVimModeChange?.(mode + suffix);
    },
  };
  return binding;
}

// Shared by every editor instance: a saved state can only be reconfigured through the compartments
// it was created with, and it may be restored by a later instance after a remount.
const compartments = {
  /** Callbacks bound to the mounted component, rebound when a saved state is restored. */
  bindings: new Compartment(),
  label: new Compartment(),
  lineNumbers: new Compartment(),
  minimap: new Compartment(),
  readOnly: new Compartment(),
  vim: new Compartment(),
  wordWrap: new Compartment(),
};

function createEditorState(content: string): EditorState {
  return EditorState.create({
    doc: content,
    extensions: [
      // CodeMirror otherwise splits on any line break and joins with LF, rewriting a CRLF file.
      EditorState.lineSeparator.of(lineSeparatorOf(content)),
      // Bindings come first so reserved shortcuts are checked before vim's and CodeMirror's keymaps.
      compartments.bindings.of([]),
      compartments.vim.of([]),
      compartments.label.of([]),
      compartments.lineNumbers.of([]),
      compartments.wordWrap.of([]),
      compartments.minimap.of([]),
      compartments.readOnly.of([]),
      EditorState.phrases.of(editorPhrases),
      history(),
      drawSelection(),
      selectedText,
      highlightActiveLine(),
      highlightSelectionMatches(),
      hiddenSearchPanel,
      EditorState.allowMultipleSelections.of(true),
      keymap.of([...SELECTION_SEARCH_KEYMAP, ...historyKeymap, ...defaultKeymap]),
      editorTheme,
    ],
  });
}

/**
 * Builds the effects that apply the component's current props to the editor's compartments. A
 * restored state still holds the previous configuration, so this runs after every restore as well.
 */
function reconfigure(binding: EditorBinding): StateEffect<unknown>[] {
  const props = binding.props;
  const options = props.options ?? DEFAULT_RAW_EDITOR_OPTIONS;
  return [
    compartments.bindings.reconfigure(createBindings(binding)),
    compartments.vim.reconfigure(options.vim ? vim() : []),
    compartments.label.reconfigure(
      EditorView.contentAttributes.of({ "aria-label": t("editor.rawContent", { name: props.fileName }) }),
    ),
    compartments.lineNumbers.reconfigure(options.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
    compartments.wordWrap.reconfigure(options.wordWrap ? EditorView.lineWrapping : []),
    compartments.readOnly.reconfigure(props.readOnly ? EditorState.readOnly.of(true) : []),
    compartments.minimap.reconfigure(
      options.minimap
        ? showMinimap.of({ create: () => ({ dom: document.createElement("div") }), displayText: "blocks" })
        : [],
    ),
  ];
}

function createBindings(binding: EditorBinding): Extension {
  return [
    Prec.highest(
      EditorView.domEventHandlers({
        // Returning true stops CodeMirror and vim from handling the key; the event still bubbles to
        // the app's command listener on the window.
        keydown: (event) =>
          (binding.props.reservedShortcuts ?? []).some((shortcut) => matchesShortcut(event, shortcut)),
      }),
    ),
    EditorView.updateListener.of((update) => {
      const isBufferSync = update.transactions.some((transaction) => transaction.annotation(bufferSync));
      if (update.docChanged && !isBufferSync) {
        const text = update.state.sliceDoc();
        binding.reportedTexts.push(text);
        binding.props.onChange(text);
      }
      if (update.docChanged || update.selectionSet) {
        binding.props.onCursorChange?.(describeCursor(update.state));
      }
      followVimMode(update.view, binding);
    }),
  ];
}

function loadState(view: EditorView, binding: EditorBinding, state: EditorState) {
  view.setState(state);
  view.dispatch({ effects: reconfigure(binding) });
}

interface BufferSync {
  view: EditorView;
  binding: EditorBinding;
  content: string;
  /** Scroll position to restore, mapped through the change. */
  scroll?: StateEffect<unknown>;
}

/**
 * Brings the editor's text in line with the buffer without recording an undo step. When the
 * buffer's line endings changed, such as after a CSV table edit, the state is rebuilt instead,
 * because a state's line separator is fixed.
 */
function syncWithBuffer({ view, binding, content, scroll }: BufferSync) {
  if (view.state.lineBreak !== lineSeparatorOf(content)) {
    loadState(view, binding, createEditorState(content));
    return;
  }
  // CodeMirror counts a line break as one position, so offsets come from LF-joined text, and the
  // inserted text goes back to the file's separator.
  const lineBreak = view.state.lineBreak;
  const change = findTextChange(view.state.doc.toString(), content.replaceAll(lineBreak, "\n"));
  if (!change) {
    if (scroll) {
      view.dispatch({ effects: scroll });
    }
    return;
  }
  const changes = view.state.changes({ ...change, insert: change.insert.replaceAll("\n", lineBreak) });
  const mappedScroll = scroll?.map(changes);
  view.dispatch({
    changes,
    effects: mappedScroll ? [mappedScroll] : [],
    annotations: [bufferSync.of(true), Transaction.addToHistory.of(false)],
  });
}

/**
 * Starts reporting vim's mode when vim comes on, and stops when it goes off. Vim creates a new
 * adapter whenever its extension is reconfigured, so the listener moves to the current one.
 */
function followVimMode(view: EditorView, binding: EditorBinding) {
  const isVimEnabled = (binding.props.options ?? DEFAULT_RAW_EDITOR_OPTIONS).vim;
  const adapter = isVimEnabled ? getCM(view) : null;
  if (adapter === binding.vim) {
    return;
  }
  binding.vim?.off("vim-mode-change", binding.handleVimModeChange);
  binding.vim = adapter;
  adapter?.on("vim-mode-change", binding.handleVimModeChange);
  binding.props.onVimModeChange?.(adapter ? "normal" : null);
}

function jumpTo(view: EditorView, { line, column = 1 }: EditorPosition) {
  const doc = view.state.doc;
  const target = doc.line(Math.min(Math.max(line, 1), doc.lines));
  const position = target.from + Math.min(Math.max(column, 1) - 1, target.length);
  view.dispatch({
    selection: { anchor: position },
    effects: EditorView.scrollIntoView(position, { y: "center" }),
    userEvent: "select",
  });
  view.focus();
}

function describeCursor(state: EditorState): CursorInfo {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  const selectionLength = state.selection.ranges.reduce((total, range) => total + range.to - range.from, 0);
  return { line: line.number, column: head - line.from + 1, selectionLength };
}

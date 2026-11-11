import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { Annotation, Compartment, EditorState, Prec, Transaction } from "@codemirror/state";
import type { Extension, StateEffect } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { showMinimap } from "@replit/codemirror-minimap";
import { vim } from "@replit/codemirror-vim";
import { useEffect, useLayoutEffect, useRef } from "react";

import { matchesShortcut } from "../../commands/shortcuts";
import { findTextChange } from "../../domain/text-change";

/** Presentation and input options of the raw editor. */
export interface RawEditorOptions {
  lineNumbers: boolean;
  minimap: boolean;
  vim: boolean;
  wordWrap: boolean;
}

/** Suits prose and narrow screens, the common case for Markdown and plain-text notes. */
export const DEFAULT_RAW_EDITOR_OPTIONS: RawEditorOptions = {
  lineNumbers: true,
  minimap: false,
  vim: false,
  wordWrap: true,
};

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
  /** Called with the full text after each edit the user makes. */
  onChange: (value: string) => void;
  /** Called when the cursor or selection moves, and when a tab is shown. */
  onCursorChange?: (cursor: CursorInfo) => void;
  /** Holds each tab's selection, scroll position, and undo history across tab switches and remounts. */
  stateCache: RawEditorStateCache;
  options?: RawEditorOptions;
  /** App command shortcuts, such as `Mod+S`. The editor and vim ignore these keys so the command runs instead. */
  reservedShortcuts?: readonly string[];
}

/** Marks changes that bring the editor in line with the buffer, so they aren't reported back as edits. */
const bufferSync = Annotation.define<boolean>();

// Mod-Alt-g opens CodeMirror's own go-to-line prompt; the app's go-to command will own that action.
const EDITOR_SEARCH_KEYMAP = searchKeymap.filter((binding) => binding.key !== "Mod-Alt-g");

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "var(--color-background)",
    color: "var(--color-text)",
    fontSize: "0.875rem",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.625" },
  ".cm-content": { padding: "1rem 0", caretColor: "var(--color-text)" },
  ".cm-line": { padding: "0 1rem" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--color-text)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "var(--color-primary-subtle)" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--color-foreground) 50%, transparent)" },
  ".cm-gutters": {
    backgroundColor: "var(--color-background)",
    color: "var(--color-text-secondary)",
    border: "none",
  },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--color-text)" },
  ".cm-selectionMatch": { backgroundColor: "var(--color-accent-subtle)" },
  ".cm-searchMatch": { backgroundColor: "var(--color-warning-subtle)" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--color-primary-subtle)" },
  ".cm-panels": {
    backgroundColor: "var(--color-foreground)",
    color: "var(--color-text)",
  },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--color-border)" },
});

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
  const binding = useRef<EditorBinding>({ props, reportedTexts: [] }).current;
  binding.props = props;

  const { documentKey, content, fileName, stateCache } = props;
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
  useEffect(() => {
    viewRef.current?.dispatch({ effects: reconfigure(binding) });
  }, [binding, fileName, showLineNumbers, minimap, isVimEnabled, wordWrap]);

  return <div ref={hostRef} className="bg-background h-full w-full overflow-hidden" />;
}

/** Connects editor callbacks to the mounted component. It is mutated in place, so callbacks always see current props. */
interface EditorBinding {
  props: RawEditorProps;
  /** Texts reported through `onChange` that the buffer has not echoed back yet, oldest first. */
  reportedTexts: string[];
}

// Shared by every editor instance: a saved state can only be reconfigured through the compartments
// it was created with, and it may be restored by a later instance after a remount.
const compartments = {
  /** Callbacks bound to the mounted component, rebound when a saved state is restored. */
  bindings: new Compartment(),
  label: new Compartment(),
  lineNumbers: new Compartment(),
  minimap: new Compartment(),
  vim: new Compartment(),
  wordWrap: new Compartment(),
};

/**
 * Keeps the file's line endings, so editing doesn't rewrite them. CodeMirror otherwise splits on any
 * line break and joins with LF. A file with any CRLF is treated as CRLF.
 */
function lineSeparatorOf(content: string): string {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

function createEditorState(content: string): EditorState {
  return EditorState.create({
    doc: content,
    extensions: [
      EditorState.lineSeparator.of(lineSeparatorOf(content)),
      // Bindings come first so reserved shortcuts are checked before vim's and CodeMirror's keymaps.
      compartments.bindings.of([]),
      compartments.vim.of([]),
      compartments.label.of([]),
      compartments.lineNumbers.of([]),
      compartments.wordWrap.of([]),
      compartments.minimap.of([]),
      history(),
      drawSelection(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      search({ top: true }),
      EditorState.allowMultipleSelections.of(true),
      keymap.of([...EDITOR_SEARCH_KEYMAP, ...historyKeymap, ...defaultKeymap]),
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
      EditorView.contentAttributes.of({ "aria-label": `Raw text content of ${props.fileName}` }),
    ),
    compartments.lineNumbers.reconfigure(options.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
    compartments.wordWrap.reconfigure(options.wordWrap ? EditorView.lineWrapping : []),
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

function describeCursor(state: EditorState): CursorInfo {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  const selectionLength = state.selection.ranges.reduce((total, range) => total + range.to - range.from, 0);
  return { line: line.number, column: head - line.from + 1, selectionLength };
}

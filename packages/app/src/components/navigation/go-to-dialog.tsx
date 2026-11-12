import {
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

import { formatShortcut, type Command } from "../../commands";
import { parseGoToQuery, rankFiles, type FileMatch } from "../../domain/goto";
import { FileIcon } from "../layout/file-icon";

/** Typed first in the picker to list commands instead of files. */
export const COMMAND_QUERY_PREFIX = ">";

/** Where to go: a file, or the current one when `path` is null, and optionally a position in it. */
export interface GoToRequest {
  path: string | null;
  line?: number;
  column?: number;
}

/** A command the picker can run, named with the menu it belongs to. */
export interface PaletteCommand {
  command: Command;
  /** Name shown and searched, such as "View: Word Wrap". */
  title: string;
}

interface GoToDialogProps {
  /** Workspace-relative paths of every file in the open folder. */
  files: readonly string[];
  /** Commands listed when the query starts with `>`. */
  commands: readonly PaletteCommand[];
  /** Text the field starts with, such as ":" for go-to-line or ">" for commands. */
  initialQuery: string;
  /** Whether a file is open, so `:line` has somewhere to go. */
  hasCurrentFile: boolean;
  onGo: (request: GoToRequest) => void;
  onRunCommand: (command: Command) => void;
  onClose: () => void;
}

/**
 * Quick-open picker: type part of a file path to fuzzy-find it, add `:line:col` to jump into it,
 * type `:line:col` alone to move in the current file, or type `>` to find and run a command. Arrow
 * keys pick a result and Enter opens it.
 *
 * @param props - GoToDialog properties.
 * @returns Modal picker element.
 */
export function GoToDialog({
  files,
  commands,
  initialQuery,
  hasCurrentFile,
  onGo,
  onRunCommand,
  onClose,
}: GoToDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [activeIndex, setActiveIndex] = useState(0);

  const isCommandMode = query.trimStart().startsWith(COMMAND_QUERY_PREFIX);
  const commandQuery = isCommandMode ? query.trimStart().slice(COMMAND_QUERY_PREFIX.length) : "";
  const target = parseGoToQuery(query);
  const isLineInCurrentFile = !isCommandMode && target.path === "" && query.trim().startsWith(":");
  const fileMatches = useMemo<FileMatch[]>(
    () => (isCommandMode || isLineInCurrentFile ? [] : rankFiles(files, target.path)),
    [files, isCommandMode, isLineInCurrentFile, target.path],
  );
  const commandMatches = useMemo(
    () => (isCommandMode ? rankCommands(commands, commandQuery) : []),
    [commandQuery, commands, isCommandMode],
  );
  const resultCount = isCommandMode ? commandMatches.length : fileMatches.length;

  // A layout effect, so focus is back where it was before a chosen command runs: the Edit commands
  // act on the focused editor. Closing a dialog that is being removed does not reliably restore it.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    const input = inputRef.current;
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
    return () => {
      if (dialog?.open) {
        dialog.close();
      }
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus();
      }
    };
  }, []);

  useEffect(() => {
    // Keyboard selection can move past the list's visible area; keep the picked result in view.
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, listId]);

  const goToFile = (match: FileMatch | undefined) => {
    if (isLineInCurrentFile) {
      if (hasCurrentFile && target.line !== undefined) {
        onGo({ path: null, line: target.line, column: target.column });
      }
      return;
    }
    if (match) {
      onGo({ path: match.path, line: target.line, column: target.column });
    }
  };

  const runCommandMatch = (match: CommandMatch | undefined) => {
    if (match && match.entry.command.isEnabled !== false) {
      onRunCommand(match.entry.command);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if (resultCount > 0) {
          const step = event.key === "ArrowDown" ? 1 : -1;
          setActiveIndex((index) => (index + step + resultCount) % resultCount);
        }
        return;
      }
      case "Enter":
        event.preventDefault();
        if (isCommandMode) {
          runCommandMatch(commandMatches[activeIndex]);
        } else {
          goToFile(fileMatches[activeIndex]);
        }
        return;
    }
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const optionId = (index: number) => `${listId}-${index}`;
  const optionClass = (index: number) =>
    `flex h-8 cursor-pointer items-center gap-2 rounded-md px-2.5 text-[13px] ${
      index === activeIndex ? "bg-surface" : ""
    }`;

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- the click only dismisses on the backdrop; keyboard users close with Escape (`onCancel`)
    <dialog
      ref={dialogRef}
      aria-label={isCommandMode ? "Commands" : "Go to file"}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={handleBackdropClick}
      className="card soft floating flush mx-auto mt-[12vh] w-[min(38rem,calc(100vw-2rem))] backdrop:bg-black/40"
    >
      <div className="flex flex-col">
        <div className="border-surface flex items-center gap-2 border-b px-3.5">
          {isCommandMode ? (
            <i className="ic-terminal text-text-secondary text-sm" aria-hidden="true" />
          ) : (
            <i className="ic-search text-text-secondary text-sm" aria-hidden="true" />
          )}
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label={isCommandMode ? "Run a command" : "Go to file, or :line:column"}
            aria-expanded={resultCount > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex < resultCount ? optionId(activeIndex) : undefined}
            placeholder="Search files by name"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="text-text placeholder:text-text-secondary h-12 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        {isLineInCurrentFile ? (
          <p className="text-text-secondary px-4 py-3 text-[13px]">
            {describeLineTarget(hasCurrentFile, target.line, target.column)}
          </p>
        ) : (
          <div
            id={listId}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a combobox's popup listbox; a native select can't hold rich options or follow the field's arrow keys
            role="listbox"
            aria-label={isCommandMode ? "Commands" : "Files"}
            className="max-h-80 overflow-y-auto p-1.5"
          >
            {isCommandMode
              ? commandMatches.map((match, index) => {
                  const { command, title } = match.entry;
                  const isDisabled = command.isEnabled === false;
                  const shortcut = command.shortcut ?? command.shortcutHint;
                  return (
                    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- the combobox field handles the keyboard: arrows pick an option and Enter runs it
                    <div
                      key={command.id}
                      id={optionId(index)}
                      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an option of the custom listbox above
                      role="option"
                      tabIndex={-1}
                      aria-selected={index === activeIndex}
                      aria-disabled={isDisabled || undefined}
                      onPointerMove={() => setActiveIndex(index)}
                      onClick={() => runCommandMatch(match)}
                      className={`${optionClass(index)} ${isDisabled ? "cursor-default opacity-45" : ""}`}
                    >
                      <span className="text-text min-w-0 flex-1 truncate">
                        <Highlighted text={title} from={0} to={title.length} positions={match.positions} />
                      </span>
                      {command.isChecked && <i className="ic-check text-text-secondary text-sm" aria-hidden="true" />}
                      {shortcut && <kbd className="kbd flex-none text-[11px]">{formatShortcut(shortcut)}</kbd>}
                    </div>
                  );
                })
              : fileMatches.map((match, index) => (
                  // oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- the combobox field handles the keyboard: arrows pick an option and Enter opens it
                  <div
                    key={match.path}
                    id={optionId(index)}
                    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an option of the custom listbox above
                    role="option"
                    tabIndex={-1}
                    aria-selected={index === activeIndex}
                    onPointerMove={() => setActiveIndex(index)}
                    onClick={() => goToFile(match)}
                    className={optionClass(index)}
                  >
                    <MatchedPath match={match} />
                  </div>
                ))}
            {resultCount === 0 && (
              <p className="text-text-secondary px-2.5 py-2 text-[13px]">
                {isCommandMode
                  ? "No matching commands."
                  : files.length === 0
                    ? "Open a folder to search its files."
                    : "No matching files."}
              </p>
            )}
          </div>
        )}
        <div className="text-text-secondary flex items-center gap-4 px-3.5 pt-1 pb-2.5 text-xs">
          <span className="flex items-center gap-1.5">
            <kbd className="kbd text-[11px]">↑</kbd>
            <kbd className="kbd text-[11px]">↓</kbd>
            Navigate
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="kbd text-[11px]">Enter</kbd>
            {isCommandMode ? "Run" : "Open"}
          </span>
          <span className="ml-auto hidden items-center gap-1.5 sm:flex">
            <kbd className="kbd text-[11px]">{COMMAND_QUERY_PREFIX}</kbd>
            Commands
            <kbd className="kbd ml-2 text-[11px]">:</kbd>
            Go to line
          </span>
        </div>
      </div>
    </dialog>
  );
}

function describeLineTarget(hasCurrentFile: boolean, line: number | undefined, column: number | undefined): string {
  if (!hasCurrentFile) {
    return "Open a file to go to a line in it.";
  }
  if (line === undefined) {
    return "Type a line number, and optionally :column, then press Enter.";
  }
  return column === undefined ? `Go to line ${line}.` : `Go to line ${line}, column ${column}.`;
}

interface CommandMatch {
  entry: PaletteCommand;
  /** Indices of the title's characters that matched, for highlighting. */
  positions: number[];
}

/** Ranks commands against a fuzzy query on their titles; an empty query keeps the given order. */
function rankCommands(commands: readonly PaletteCommand[], query: string): CommandMatch[] {
  if (query.trim() === "") {
    return commands.map((entry) => ({ entry, positions: [] }));
  }
  const byTitle = new Map(commands.map((entry) => [entry.title, entry]));
  return rankFiles([...byTitle.keys()], query).flatMap((match) => {
    const entry = byTitle.get(match.path);
    return entry ? [{ entry, positions: match.positions }] : [];
  });
}

interface HighlightedProps {
  text: string;
  from: number;
  to: number;
  /** Indices in `text` of the matched characters. */
  positions: readonly number[];
}

/** Renders a slice of text with the matched characters emphasized. */
function Highlighted({ text, from, to, positions }: HighlightedProps) {
  const matched = new Set(positions);
  // Split by UTF-16 unit, since match positions are UTF-16 indices.
  return Array.from(text.slice(from, to).split(""), (char, offset) =>
    matched.has(from + offset) ? (
      <mark key={from + offset} className="text-text-strong bg-transparent font-semibold">
        {char}
      </mark>
    ) : (
      char
    ),
  );
}

/** Shows the file's icon and name first and its folder after it, with the matched characters emphasized. */
function MatchedPath({ match }: { match: FileMatch }) {
  const { path, positions } = match;
  const nameStart = path.lastIndexOf("/") + 1;
  const extensionStart = path.lastIndexOf(".");
  const extension = extensionStart > nameStart ? path.slice(extensionStart + 1).toLowerCase() : "";
  return (
    <>
      <FileIcon extension={extension} className="text-text-secondary flex-none text-sm" />
      <span className="text-text flex-none truncate">
        <Highlighted text={path} from={nameStart} to={path.length} positions={positions} />
      </span>
      {nameStart > 0 && (
        <span className="text-text-secondary min-w-0 truncate text-xs">
          <Highlighted text={path} from={0} to={nameStart - 1} positions={positions} />
        </span>
      )}
    </>
  );
}

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import { parseGoToQuery, rankFiles, type FileMatch } from "../../domain/goto";

/** Where to go: a file, or the current one when `path` is null, and optionally a position in it. */
export interface GoToRequest {
  path: string | null;
  line?: number;
  column?: number;
}

interface GoToDialogProps {
  /** Workspace-relative paths of every file in the open folder. */
  files: readonly string[];
  /** Text the field starts with, such as ":" for go-to-line. */
  initialQuery: string;
  /** Whether a file is open, so `:line` has somewhere to go. */
  hasCurrentFile: boolean;
  onGo: (request: GoToRequest) => void;
  onClose: () => void;
}

/**
 * Quick-open picker: type part of a file path to fuzzy-find it, add `:line:col` to jump into it, or
 * type `:line:col` alone to move in the current file. Arrow keys pick a result and Enter opens it.
 *
 * @param props - GoToDialog properties.
 * @returns Modal picker element.
 */
export function GoToDialog({ files, initialQuery, hasCurrentFile, onGo, onClose }: GoToDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [activeIndex, setActiveIndex] = useState(0);

  const target = parseGoToQuery(query);
  const isLineInCurrentFile = target.path === "" && query.trim().startsWith(":");
  const matches = useMemo<FileMatch[]>(
    () => (isLineInCurrentFile ? [] : rankFiles(files, target.path)),
    [files, isLineInCurrentFile, target.path],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
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
    };
  }, []);

  useEffect(() => {
    // Keyboard selection can move past the list's visible area; keep the picked file in view.
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, listId]);

  const go = (match: FileMatch | undefined) => {
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

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if (matches.length > 0) {
          const step = event.key === "ArrowDown" ? 1 : -1;
          setActiveIndex((index) => (index + step + matches.length) % matches.length);
        }
        return;
      }
      case "Enter":
        event.preventDefault();
        go(matches[activeIndex]);
        return;
    }
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const optionId = (index: number) => `${listId}-${index}`;
  const activeMatch = matches[activeIndex];

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- the click only dismisses on the backdrop; keyboard users close with Escape (`onCancel`)
    <dialog
      ref={dialogRef}
      aria-label="Go to file"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={handleBackdropClick}
      className="card soft floating flush mx-auto mt-[12vh] w-[min(36rem,calc(100vw-2rem))] backdrop:bg-black/30"
    >
      <div className="flex flex-col">
        <div className="border-border flex items-center gap-2 border-b px-3">
          <i className="ic-search text-text-secondary text-sm" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="Go to file, or :line:column"
            aria-expanded={matches.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeMatch ? optionId(activeIndex) : undefined}
            placeholder="Search files by name, add :line to jump"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="ipt ghost edgeless h-11 min-w-0 flex-1 text-sm"
          />
        </div>
        {isLineInCurrentFile ? (
          <p className="text-text-secondary px-4 py-3 text-xs">
            {describeLineTarget(hasCurrentFile, target.line, target.column)}
          </p>
        ) : (
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a combobox's popup listbox; a native select can't hold rich options or follow the field's arrow keys
          <div id={listId} role="listbox" aria-label="Files" className="max-h-80 overflow-y-auto p-1">
            {matches.map((match, index) => (
              // oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- the combobox field handles the keyboard: arrows pick an option and Enter opens it
              <div
                key={match.path}
                id={optionId(index)}
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an option of the custom listbox above
                role="option"
                tabIndex={-1}
                aria-selected={index === activeIndex}
                onPointerMove={() => setActiveIndex(index)}
                onClick={() => go(match)}
                className={`flex cursor-pointer items-baseline gap-2 rounded px-3 py-1.5 text-sm ${
                  index === activeIndex ? "bg-foreground" : ""
                }`}
              >
                <MatchedPath match={match} />
              </div>
            ))}
            {matches.length === 0 && (
              <p className="text-text-secondary px-3 py-2 text-xs">
                {files.length === 0 ? "Open a folder to search its files." : "No matching files."}
              </p>
            )}
          </div>
        )}
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

/** Shows the file name first and its folder after it, with the matched characters emphasized. */
function MatchedPath({ match }: { match: FileMatch }) {
  const nameStart = match.path.lastIndexOf("/") + 1;
  const matched = new Set(match.positions);
  const renderPart = (from: number, to: number) =>
    // Split by UTF-16 unit, since match positions are UTF-16 indices.
    Array.from(match.path.slice(from, to).split(""), (char, offset) =>
      matched.has(from + offset) ? (
        <mark key={from + offset} className="text-text-strong bg-transparent font-semibold">
          {char}
        </mark>
      ) : (
        char
      ),
    );
  return (
    <>
      <span className="text-text truncate">{renderPart(nameStart, match.path.length)}</span>
      {nameStart > 0 && (
        <span className="text-text-secondary min-w-0 truncate text-xs">{renderPart(0, nameStart - 1)}</span>
      )}
    </>
  );
}
